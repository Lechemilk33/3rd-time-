import { connection } from "next/server";
import { icsForVisits } from "@/lib/booking";
import { createPublicClient } from "@/lib/supabase/public";

type FeedBooking = {
  id: string;
  status: string;
  title: string;
  kind?: string;
  end_date?: string;
  visit_start: string;
  visit_end: string;
  service_date: string;
  arrival_time: string | null;
  duration_minutes: number;
  window_label: string | null;
  walker_id: string | null;
  walker_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  address: string | null;
  pets: string | null;
  notes: string | null;
  client_note: string | null;
};

/**
 * Private iCalendar feed for an admin (Google / Apple Calendar subscription).
 * GET /api/calendar/<token>          every visit
 * GET /api/calendar/<token>?mine=1   only the subscriber's own visits
 */
export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{32,128}$/i.test(clean)) return new Response("Not found", { status: 404 });

  const { data, error } = await createPublicClient().rpc("calendar_feed", { p_token: clean });
  if (error || !data) return new Response("Not found", { status: 404 });

  const feed = data as { walker_id: string; bookings: FeedBooking[] };
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  const visits = feed.bookings
    .filter((b) => !mine || b.walker_id === feed.walker_id)
    .map((b) => {
      const who = b.pets || b.client_name || "Visit";
      const prefix = b.status === "requested" ? "⏳ " : b.status === "completed" ? "✓ " : b.kind === "stay" ? "🌙 " : "🐾 ";
      return {
        id: b.id,
        title: `${prefix}${who} · ${b.title}${mine || !b.walker_name ? "" : ` (${b.walker_name})`}`,
        start: new Date(b.visit_start),
        end: new Date(b.visit_end),
        location: b.address ?? undefined,
        description: [
          b.client_name && `Client: ${b.client_name}`,
          b.client_phone && `Phone: ${b.client_phone}`,
          b.window_label && !b.arrival_time && `Arrival window: ${b.window_label}`,
          b.walker_name && `Walker: ${b.walker_name}`,
          b.status === "requested" && "Waiting for confirmation",
          b.client_note && `Client note: ${b.client_note}`,
          b.notes && `Notes: ${b.notes}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    });

  return new Response(icsForVisits(visits, mine ? "Waiting for Paws · My visits" : "Waiting for Paws"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="waiting-for-paws.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
