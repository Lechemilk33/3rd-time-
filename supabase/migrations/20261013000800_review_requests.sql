-- Google reviews. Once the team adds their Google review link (Admin → Schedule → Booking rules),
-- every client gets one friendly email asking for a review a day or so after their second visit.
-- Everyone is asked the same way (Google doesn't allow asking only happy clients), and nobody is
-- asked twice. The link is also shown on the site and in the client portal.

alter table public.booking_settings
  add column review_requests boolean not null default true,
  add column review_url text check (review_url is null or review_url ~ '^https://[^\s<>"]+$');

comment on column public.booking_settings.review_url is 'Google review link (Business Profile → Read reviews → Get more reviews).';

alter table public.profiles
  add column review_requested_at timestamptz;

comment on column public.profiles.review_requested_at is 'When we emailed this client asking for a Google review (asked once).';

-- Clients with at least two finished visits, the latest in the last two days, who haven't been
-- asked yet. Sent during the day only.
create or replace function private.send_review_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  r record;
  v_sent int := 0;
  v_pup text;
  v_first text;
begin
  select * into s from public.booking_settings where id = 1;
  if not s.review_requests or coalesce(s.review_url, '') = '' then return 0; end if;

  for r in
    select p.id, p.email, p.full_name
    from public.profiles p
    where p.role = 'client'
      and p.review_requested_at is null
      and coalesce(p.email, '') <> ''
      and (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'completed') >= 2
      and exists (
        select 1 from public.bookings b
        where b.user_id = p.id and b.status = 'completed' and b.end_time > now() - interval '2 days'
      )
    order by p.id
    limit 25
  loop
    v_first := coalesce(nullif(split_part(trim(coalesce(r.full_name, '')), ' ', 1), ''), 'there');
    select pt.name into v_pup from public.pets pt where pt.owner_id = r.id order by pt.created_at limit 1;
    perform private.send_emails(jsonb_build_array(private.email(
      array[r.email],
      'How are we doing? 🐾',
      private.email_layout(
        'Thanks for trusting us, ' || v_first || '!',
        'We’ve loved spending time with ' || coalesce(v_pup, 'your pup')
          || '. If you have a minute, would you leave us a Google review? It’s the best way for other dog owners nearby to find a walker they can trust, and we read every one.',
        '',
        'Leave a review',
        s.review_url,
        'Anything we could do better? Just reply to this email; it comes straight to us.'
      )
    )));
    update public.profiles set review_requested_at = now() where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

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

  -- Review requests go out in the late morning, never overnight.
  if extract(hour from v_local) = 10 then
    perform private.send_review_requests();
  end if;
end;
$$;

-- The booking rules (and review link) shown on the public site. Anyone can read them.
create or replace function public.booking_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cancel_cutoff_hours', s.cancel_cutoff_hours,
    'min_notice_hours', s.min_notice_hours,
    'review_url', s.review_url
  )
  from public.booking_settings s
  where s.id = 1;
$$;

revoke execute on function private.send_review_requests() from public, anon, authenticated;
