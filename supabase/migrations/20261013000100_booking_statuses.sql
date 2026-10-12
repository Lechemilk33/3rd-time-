-- Booking statuses for native booking (requests, declines) and the end of Calendly.
-- Kept separate because changing check constraints and dropping columns needs a confirmation
-- when applied through the Supabase MCP. The bookings table was empty, so nothing is lost.

alter table public.bookings
  drop constraint bookings_status_check,
  add constraint bookings_status_check
    check (status in ('requested', 'scheduled', 'completed', 'canceled', 'declined')),
  drop constraint bookings_source_check,
  add constraint bookings_source_check
    check (source in ('portal', 'manual'));

alter table public.bookings
  drop column pet_id,
  drop column external_id,
  drop column cancel_url,
  drop column reschedule_url;
