import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

const TOLERANCE_SECONDS = 5 * 60;

function verifySignature(body: string, header: string | null, key: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type CalendlyPayload = {
  uri?: string;
  email?: string;
  name?: string;
  cancel_url?: string;
  reschedule_url?: string;
  questions_and_answers?: { question?: string; answer?: string }[];
  scheduled_event?: { name?: string; start_time?: string; end_time?: string };
};

/**
 * Keeps bookings in sync with Calendly. Subscribe a webhook to
 * invitee.created and invitee.canceled pointing at /api/webhooks/calendly.
 */
export async function POST(request: Request) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key || !isServiceRoleConfigured()) {
    return Response.json({ error: "Calendly webhook is not configured" }, { status: 503 });
  }

  const body = await request.text();
  if (!verifySignature(body, request.headers.get("calendly-webhook-signature"), key)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: { event?: string; payload?: CalendlyPayload };
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const p = json.payload ?? {};
  if (!p.uri) return Response.json({ received: true });
  const supabase = createServiceClient();

  if (json.event === "invitee.created") {
    const scheduled = p.scheduled_event ?? {};
    if (!scheduled.start_time) return Response.json({ received: true });

    let userId: string | null = null;
    if (p.email) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", p.email.replace(/[\\%_]/g, "\\$&"))
        .limit(1)
        .maybeSingle();
      userId = data?.id ?? null;
    }

    const notes = (p.questions_and_answers ?? [])
      .filter((qa) => qa.answer)
      .map((qa) => `${qa.question}: ${qa.answer}`)
      .join("\n");

    const { error } = await supabase.from("bookings").upsert(
      {
        external_id: p.uri,
        user_id: userId,
        title: scheduled.name || "Calendly booking",
        start_time: scheduled.start_time,
        end_time: scheduled.end_time ?? null,
        status: "scheduled",
        source: "calendly",
        invitee_name: p.name ?? null,
        invitee_email: p.email ?? null,
        cancel_url: p.cancel_url ?? null,
        reschedule_url: p.reschedule_url ?? null,
        notes: notes || null,
      },
      { onConflict: "external_id" },
    );
    if (error) {
      console.error("Failed to save Calendly booking", error.message);
      return Response.json({ error: "Database error" }, { status: 500 });
    }
  } else if (json.event === "invitee.canceled") {
    await supabase.from("bookings").update({ status: "canceled" }).eq("external_id", p.uri);
  }

  return Response.json({ received: true });
}
