import { Copy, Play } from "lucide-react";
import type { ReactNode } from "react";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { num, str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { InstagramIcon, PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { getSiteSettings } from "@/lib/content";
import { BUSINESS_TIMEZONE } from "@/lib/env";
import { getInstagramFeed, instagramProfileUrl, type InstagramPost } from "@/lib/instagram";
import type { SectionData } from "@/lib/types";
import { cn, instagramHandle, safeHref } from "@/lib/utils";

/** The post counts the editor offers, each laid out so every row is full. */
const GRIDS: Record<number, string> = {
  4: "grid-cols-2 md:grid-cols-4",
  6: "mx-auto max-w-4xl grid-cols-2 sm:grid-cols-3",
  8: "grid-cols-2 md:grid-cols-4",
  12: "grid-cols-3 md:grid-cols-4",
};

const postDate = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, month: "short", day: "numeric" });

export async function InstagramFeedSection({ data }: { data: SectionData }) {
  const [feed, settings] = await Promise.all([getInstagramFeed(), getSiteSettings()]);
  const limit = num(data, "limit", 8);
  const count = GRIDS[limit] ? limit : 8;
  const posts = feed.status === "ok" ? feed.posts.slice(0, count) : [];
  // Follow the account the posts come from; until one is connected, the link in Site settings.
  const profileUrl = feed.status === "ok" ? instagramProfileUrl(feed.username) : safeHref(settings.instagramUrl, "");
  if (!profileUrl) return null;

  const handle = feed.status === "ok" ? `@${feed.username}` : instagramHandle(profileUrl);
  const label = str(data, "buttonLabel") || (handle ? `Follow ${handle}` : "Follow us on Instagram");
  const followButton = (
    <ButtonLink href={profileUrl} target="_blank" rel="noreferrer" size="lg">
      <InstagramIcon className="size-5" />
      {label}
    </ButtonLink>
  );

  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} intro={str(data, "intro")} />
      {posts.length ? (
        <>
          <ul className={cn("grid gap-3 sm:gap-4", GRIDS[count])}>
            {posts.map((post) => (
              <li key={post.id}>
                <PostTile post={post} />
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">{followButton}</div>
        </>
      ) : (
        <FollowCard handle={handle || settings.businessName} logoUrl={settings.logoUrl} button={followButton} />
      )}
    </SectionShell>
  );
}

function PostTile({ post }: { post: InstagramPost }) {
  const badge =
    post.kind === "video"
      ? { Icon: Play, label: "Video", className: "fill-current" }
      : post.kind === "carousel"
        ? { Icon: Copy, label: "Album", className: "" }
        : null;
  return (
    <a
      href={post.href}
      target="_blank"
      rel="noreferrer"
      className="group relative block aspect-square overflow-hidden rounded-2xl bg-sea-100 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:rounded-3xl"
    >
      <PawMark className="absolute inset-0 m-auto size-1/3 -rotate-12 text-sea-200" />
      <Photo
        src={post.image}
        alt=""
        className="absolute inset-0 size-full transition duration-500 ease-out group-hover:scale-105 group-focus-visible:scale-105"
      />
      {badge ? (
        <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-ink/45 text-white backdrop-blur-sm sm:top-3 sm:right-3">
          <badge.Icon className={cn("size-4", badge.className)} aria-hidden />
          <span className="sr-only">{badge.label}:</span>
        </span>
      ) : null}
      {/* Always in the page for screen readers; shown on hover or keyboard focus. */}
      <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/90 via-ink/50 to-ink/5 p-3 text-white opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 sm:p-4">
        {post.caption ? <span className="line-clamp-4 text-sm leading-snug font-semibold">{post.caption}</span> : null}
        <span className="mt-2 flex items-center gap-1.5 text-xs font-bold text-sun-300">
          <InstagramIcon className="size-3.5 shrink-0" />
          {post.date ? `${postDate.format(new Date(post.date))} · ` : ""}View on Instagram
        </span>
      </span>
    </a>
  );
}

/** Shown until Instagram is connected (or if it can't be reached): a friendly nudge to the profile. */
function FollowCard({ handle, logoUrl, button }: { handle: string; logoUrl: string; button: ReactNode }) {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div aria-hidden className="absolute -top-5 -left-4 hidden size-28 -rotate-12 place-items-center rounded-3xl bg-sun-100 sm:grid">
        <PawMark className="size-12 text-sun" />
      </div>
      <div aria-hidden className="absolute -right-4 -bottom-6 hidden size-32 rotate-12 place-items-center rounded-3xl bg-sea-100 sm:grid">
        <PawMark className="size-14 text-sea-300" />
      </div>
      <div className="relative flex flex-col items-center gap-6 rounded-[2rem] border border-ink-100 bg-white px-6 py-10 text-center shadow-lg sm:flex-row sm:px-10 sm:text-left">
        <span className="grid size-24 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-sun to-coral p-1 shadow-md">
          <span className="grid size-full place-items-center overflow-hidden rounded-full border-4 border-white bg-sea-100 text-ocean">
            {logoUrl ? <Photo src={logoUrl} alt="" className="size-full" /> : <PawMark className="size-11 -rotate-12" />}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-semibold [overflow-wrap:anywhere] text-ink sm:text-3xl">{handle}</p>
          <p className="mt-2 text-lg text-ink-600">Beach walks, sniff breaks and very good pups. Follow along for the latest.</p>
        </div>
        {button}
      </div>
    </div>
  );
}
