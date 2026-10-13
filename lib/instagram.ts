import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

/**
 * Recent posts from the business's Instagram, read with Instagram's official API ("Instagram API
 * with Instagram Login", professional accounts). An admin connects the account once in
 * Admin → Integrations; the 60-day token lives in Supabase Vault and is renewed here every few
 * days. Instagram's image links expire after a few days, so posts are never stored — they're
 * fetched fresh and cached for about an hour.
 */

/** Tagged on the cached feed; connecting or disconnecting the account invalidates it. */
export const INSTAGRAM_TAG = "instagram-feed";
/** Holds the OAuth state while the admin is on Instagram's login page. */
export const INSTAGRAM_STATE_COOKIE = "wfp-instagram-oauth";

const GRAPH = "https://graph.instagram.com";
const MEDIA_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";
/** The section shows up to 12; spares cover posts Instagram won't share an image for (e.g. reels with licensed music). */
const FETCH_COUNT = 16;
/** Tokens can be renewed once they're a day old and last 60 days, so renewing every few days leaves plenty of slack. */
const RENEW_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

export type InstagramPost = {
  id: string;
  href: string;
  image: string;
  kind: "image" | "video" | "carousel";
  caption: string;
  /** ISO timestamp */
  date: string;
};

export type InstagramFeed =
  | { status: "ok"; username: string; posts: InstagramPost[] }
  | { status: "off"; reason: "no-secret-key" | "not-set-up" | "not-connected" }
  | { status: "error"; message: string };

export function isInstagramLoginConfigured() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function instagramProfileUrl(username: string) {
  return `https://www.instagram.com/${username}/`;
}

// ---------------------------------------------------------------------------
// Instagram API
// ---------------------------------------------------------------------------

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Never throws, and never puts the request URL (which carries the token) in an error. Responses
 * skip Next's fetch cache so tokens are never written to disk; getInstagramFeed caches the posts.
 */
async function graph<T>(url: string, init?: RequestInit): Promise<GraphResult<T>> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const json = await res.json().catch(() => null);
    const message: unknown = json?.error?.message ?? json?.error_message;
    if (!res.ok || !json || message) {
      return { ok: false, error: typeof message === "string" ? message : `Instagram answered with an error (${res.status}).` };
    }
    return { ok: true, data: json as T };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, error: timedOut ? "Instagram took too long to answer." : "Couldn’t reach Instagram." };
  }
}

type TokenResponse = { access_token?: string; expires_in?: number };

function expiresAt(seconds: unknown) {
  return typeof seconds === "number" && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

/** The professional account a token belongs to. */
export async function lookupInstagramAccount(token: string): Promise<{ userId: string; username: string } | { error: string }> {
  const res = await graph<{ id?: string; user_id?: string; username?: string }>(
    `${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`,
  );
  if (!res.ok) return { error: res.error };
  const userId = String(res.data.user_id ?? res.data.id ?? "");
  const username = res.data.username ?? "";
  if (!/^\d{1,30}$/.test(userId) || !USERNAME.test(username)) {
    return { error: "Instagram didn’t say which account this is." };
  }
  return { userId, username };
}

export function instagramAuthorizeUrl(state: string, redirectUri: string) {
  return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic",
    state,
  })}`;
}

export type InstagramConnection = { token: string; userId: string; username: string; expiresAt: string | null };

/** Trades the code from Instagram's login page for a long-lived (60-day) token. */
export async function exchangeInstagramCode(code: string, redirectUri: string): Promise<InstagramConnection | { error: string }> {
  const clientId = process.env.INSTAGRAM_APP_ID ?? "";
  const clientSecret = process.env.INSTAGRAM_APP_SECRET ?? "";

  const short = await graph<TokenResponse & { data?: TokenResponse[] }>("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!short.ok) return { error: short.error };
  // Documented as { data: [{ access_token, … }] }; older apps get the fields at the top level.
  const shortToken = short.data.data?.[0]?.access_token ?? short.data.access_token;
  if (!shortToken) return { error: "Instagram didn’t send an access token." };

  const long = await graph<TokenResponse>(
    `${GRAPH}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: clientSecret, access_token: shortToken })}`,
  );
  if (!long.ok) return { error: long.error };
  if (!long.data.access_token) return { error: "Instagram didn’t send a long-lived access token." };

  const account = await lookupInstagramAccount(long.data.access_token);
  if ("error" in account) return account;
  return { token: long.data.access_token, ...account, expiresAt: expiresAt(long.data.expires_in) };
}

type Credentials = { token: string; username: string; refreshedAt: number };

function parseCredentials(value: unknown): Credentials | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== "string" || !v.token || typeof v.username !== "string" || !USERNAME.test(v.username)) return null;
  return { token: v.token, username: v.username, refreshedAt: Date.parse(String(v.refreshed_at)) };
}

/** Renews the token every few days so it never reaches its 60-day expiry. Falls back to the current one. */
async function renewIfDue(credentials: Credentials): Promise<string> {
  if (Date.now() - credentials.refreshedAt < RENEW_AFTER_MS) return credentials.token;

  const res = await graph<TokenResponse>(
    `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: credentials.token })}`,
  );
  if (!res.ok || !res.data.access_token) {
    console.error("Couldn’t renew the Instagram token:", res.ok ? "no token in the response" : res.error);
    return credentials.token;
  }
  const { error } = await createServiceClient().rpc("instagram_token_renewed", {
    p_old_token: credentials.token,
    p_token: res.data.access_token,
    p_expires_at: expiresAt(res.data.expires_in),
  });
  if (error) console.error("Couldn’t save the renewed Instagram token:", error.message);
  return res.data.access_token;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

type GraphMedia = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data?: GraphMedia[] };
};

function httpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** A still image for the grid: the photo, a video's cover, or an album's first shareable image. */
function coverImage(media: GraphMedia): string | null {
  if (media.media_type === "VIDEO") return httpsUrl(media.thumbnail_url);
  if (media.media_type === "CAROUSEL_ALBUM" && media.children?.data?.length) {
    for (const child of media.children.data) {
      const image = coverImage(child);
      if (image) return image;
    }
    return null;
  }
  return httpsUrl(media.media_url);
}

/** Captions read better without the trailing wall of hashtags and Instagram's spacer dots. */
function tidyCaption(caption: string | undefined) {
  const text = (caption ?? "")
    .split("\n")
    .filter((line) => !/^[\s.·•_–—-]+$/.test(line))
    .join(" ")
    .replace(/(\s*#[^\s#]+)+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 300 ? `${text.slice(0, 299).trimEnd()}…` : text;
}

function toPost(media: GraphMedia): InstagramPost | null {
  const image = coverImage(media);
  const href = httpsUrl(media.permalink);
  if (!media.id || !image || !href || !/^https:\/\/(www\.)?instagram\.com\//.test(href)) return null;
  // Instagram sends "+0000"; Date only promises to parse "+00:00".
  const date = new Date((media.timestamp ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return {
    id: media.id,
    href,
    image,
    kind: media.media_type === "VIDEO" ? "video" : media.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image",
    caption: tidyCaption(media.caption),
    date: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
  };
}

/**
 * The latest posts, cached for about an hour (Instagram's image links outlive that by days).
 * Never throws: the section shows a "Follow us" card for anything but `status: "ok"`.
 */
export async function getInstagramFeed(): Promise<InstagramFeed> {
  "use cache";
  cacheTag(INSTAGRAM_TAG);

  if (!isServiceRoleConfigured()) {
    cacheLife("hours");
    return { status: "off", reason: "no-secret-key" };
  }

  try {
    const { data, error } = await createServiceClient().rpc("instagram_credentials");
    if (error?.code === "PGRST202") {
      // The Instagram database update hasn't been run yet.
      cacheLife("hours");
      return { status: "off", reason: "not-set-up" };
    }
    if (error) throw new Error(error.message);

    const credentials = parseCredentials(data);
    if (!credentials) {
      cacheLife("hours");
      return { status: "off", reason: "not-connected" };
    }

    const token = await renewIfDue(credentials);
    const res = await graph<{ data?: GraphMedia[] }>(
      `${GRAPH}/me/media?${new URLSearchParams({ fields: MEDIA_FIELDS, limit: String(FETCH_COUNT), access_token: token })}`,
    );
    if (!res.ok) throw new Error(res.error);

    const posts = (res.data.data ?? []).map(toPost).filter((post): post is InstagramPost => post !== null);
    cacheLife("hours");
    return { status: "ok", username: credentials.username, posts };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    console.error("Couldn’t load the Instagram feed:", message);
    // Try again sooner than a good result would, without hammering Instagram while it's down.
    cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
    return { status: "error", message };
  }
}
