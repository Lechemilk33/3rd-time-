-- Two emails clients were missing:
--   1. "You're approved" the moment they can book every service (from the approval switch on their
--      profile, or by approving their intake form), so they aren't left checking back.
--   2. "We can't make this one" when a request nobody confirmed expires, instead of it vanishing quietly.

-- 1. Approval ---------------------------------------------------------------------------------

create or replace function private.on_client_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_first text := coalesce(nullif(split_part(trim(coalesce(new.full_name, '')), ' ', 1), ''), 'friend');
begin
  if new.booking_approved and not old.booking_approved and new.role = 'client' and coalesce(new.email, '') <> '' then
    select * into s from public.booking_settings where id = 1;
    perform private.send_emails(jsonb_build_array(private.email(
      array[new.email],
      'You’re all set to book walks 🐾',
      private.email_layout(
        'You’re approved, ' || v_first || '! 🎉',
        'Thanks for letting us meet your pup. Every service is unlocked now — book walks, drop-ins and more right from your portal.',
        '',
        'Book now',
        s.site_url || '/portal/book'
      )
    )));
  end if;
  return null;
end;
$$;

revoke all on function private.on_client_approved() from public;

create or replace trigger profiles_approved_email
  after update of booking_approved on public.profiles
  for each row execute function private.on_client_approved();

-- 2. Expired requests -------------------------------------------------------------------------

create or replace function private.run_hourly_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_local timestamp;
  v_expired uuid[];
begin
  select * into s from public.booking_settings where id = 1;
  v_local := now() at time zone s.timezone;

  -- Visits are marked done a few hours after their window ends (admins can undo it).
  update public.bookings set status = 'completed'
  where status = 'scheduled' and coalesce(end_time, start_time) < now() - interval '3 hours';

  -- Requests nobody confirmed in time expire, and the client hears about it.
  with expired as (
    update public.bookings
    set status = 'declined', cancel_reason = 'Request expired', canceled_at = now()
    where status = 'requested' and start_time < now()
    returning id
  )
  select array_agg(id) into v_expired from expired;
  perform private.notify('declined', v_expired, true, true);

  if extract(hour from v_local) = s.reminder_hour then
    if s.client_reminders then perform private.send_client_reminders(v_local::date + 1); end if;
    if s.walker_digest then perform private.send_walker_digests(v_local::date + 1); end if;
  end if;
end;
$$;
