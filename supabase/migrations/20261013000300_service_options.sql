-- Services clients can shape themselves, and notes next to intake answers.
--   • Lengths: one "Dog Walk" where the client picks 30 or 60 minutes, each with its own price.
--   • Getting there: the team picks the pup up from home, or the client brings them.
--   • Intake/booking answers can carry a free-text note under "<question id>__details".

alter table public.services
  add column duration_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(duration_options) = 'array' and jsonb_array_length(duration_options) <= 8),
  add column handoff_options text[] not null default '{}'
    check (handoff_options <@ array['pickup', 'bring']::text[]),
  add column pickup_fee_cents int check (pickup_fee_cents between 0 and 100000),
  add column bring_details text check (char_length(bring_details) <= 300);

comment on column public.services.duration_options is
  'Lengths a client can pick, e.g. [{"minutes": 30, "price_cents": 2500}, {"minutes": 60, "price_cents": 4000}]. Empty = always duration_minutes.';
comment on column public.services.handoff_options is
  'pickup = the team collects the pup from home; bring = the client brings the pup. Empty = it happens at the client''s home.';
comment on column public.services.pickup_fee_cents is 'Extra charge per booking when the team picks the pup up.';
comment on column public.services.bring_details is 'Where and when clients bring their pup, shown when they choose that.';

alter table public.bookings
  add column handoff text check (handoff in ('pickup', 'bring'));

comment on column public.bookings.handoff is 'pickup or bring, for services that offer a choice of how the pup gets to us.';

-- The length to book: one of the service's options (admins can set any), else its fixed length.
create or replace function private.pick_duration(p_service public.services, p_minutes int, p_admin boolean)
returns int
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_admin and p_minutes between 5 and 1440 then return p_minutes; end if;
  if jsonb_array_length(coalesce(p_service.duration_options, '[]'::jsonb)) = 0 then
    return coalesce(p_service.duration_minutes, 30);
  end if;
  if p_minutes is null then
    return (select min((o ->> 'minutes')::int) from jsonb_array_elements(p_service.duration_options) o);
  end if;
  if exists (select 1 from jsonb_array_elements(p_service.duration_options) o where (o ->> 'minutes')::int = p_minutes) then
    return p_minutes;
  end if;
  raise exception 'Pick how long you’d like.';
end;
$$;

-- "30 min" / "1 hr" / "1 hr 30 min".
create or replace function private.length_label(p_minutes int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_minutes is null then null
    when p_minutes < 60 then p_minutes || ' min'
    when p_minutes % 60 = 0 then (p_minutes / 60) || ' hr'
    else (p_minutes / 60) || ' hr ' || (p_minutes % 60) || ' min'
  end;
$$;

-- book_visits and time_slots gain arguments. Postgres can't change a function's arguments in place,
-- so the previous versions are renamed and parked in the private schema, out of the API.
alter function public.book_visits(uuid, uuid[], date[], uuid, text, uuid, uuid, int, boolean, boolean, text, text, date, jsonb) rename to book_visits_v1;
alter function public.book_visits_v1(uuid, uuid[], date[], uuid, text, uuid, uuid, int, boolean, boolean, text, text, date, jsonb) set schema private;
alter function public.time_slots(uuid, date) rename to time_slots_v1;
alter function public.time_slots_v1(uuid, date) set schema private;

create or replace function public.time_slots(p_service_id uuid, p_date date, p_duration int default null)
returns table (minute int, window_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_admin boolean := private.is_admin();
  v_service public.services;
  v_duration int;
  w record;
  m int;
begin
  if (select auth.uid()) is null then raise exception 'Please log in to book.'; end if;
  select * into s from public.booking_settings where id = 1;
  select * into v_service from public.services where id = p_service_id;
  if not found or v_service.kind <> 'time' or p_date is null then return; end if;
  if not v_admin and (not s.booking_enabled or not v_service.active or not v_service.bookable
                      or p_date > private.local_today() + s.max_days_ahead) then
    return;
  end if;
  -- Only lists open times, so any sensible length is fine (a rescheduled visit keeps its own).
  v_duration := case when p_duration between 5 and 720 then p_duration else private.pick_duration(v_service, null, true) end;

  for w in select * from public.booking_windows where active order by start_minute loop
    m := w.start_minute;
    while m + v_duration <= w.end_minute loop
      if (v_admin or private.local_ts(p_date, m) >= now() + make_interval(hours => s.min_notice_hours))
         and private.pick_walker_at(p_date, w.id, null, m, v_duration) is not null then
        minute := m;
        window_id := w.id;
        return next;
      end if;
      m := m + 30;
    end loop;
  end loop;
end;
$$;

create or replace function public.book_visits(
  p_service_id uuid,
  p_pet_ids uuid[],
  p_dates date[],
  p_window_id uuid default null,
  p_note text default null,
  p_client_id uuid default null,
  p_walker_id uuid default null,
  p_arrival_minute int default null,
  p_force boolean default false,
  p_notify boolean default true,
  p_guest_name text default null,
  p_guest_email text default null,
  p_end_date date default null,
  p_answers jsonb default null,
  p_duration int default null,
  p_handoff text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := private.is_admin();
  s public.booking_settings;
  v_service public.services;
  v_kind text;
  v_window public.booking_windows;
  v_client uuid;
  v_pets uuid[];
  v_dates date[];
  v_date date;
  v_last date;
  v_series uuid;
  v_status text;
  v_reason text;
  v_walker uuid;
  v_arrival time;
  v_start timestamptz;
  v_end timestamptz;
  v_duration int;
  v_handoff text := nullif(trim(coalesce(p_handoff, '')), '');
  v_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_answers jsonb := case
    when jsonb_typeof(p_answers) = 'object' and length(p_answers::text) <= 20000 then
      (select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) from jsonb_each(p_answers) a where a.key !~ '^__')
    else '{}'::jsonb end;
begin
  if v_uid is null then raise exception 'Please log in to book.'; end if;
  select * into s from public.booking_settings where id = 1;

  if v_admin then
    v_client := p_client_id;
  else
    if p_client_id is not null and p_client_id <> v_uid then raise exception 'You can only book for yourself.'; end if;
    if p_walker_id is not null or p_force or p_guest_name is not null then
      raise exception 'Only the Waiting for Paws team can do that.';
    end if;
    if not s.booking_enabled then
      raise exception 'Online booking is paused right now. Send us a message and we’ll get you scheduled.';
    end if;
    v_client := v_uid;
  end if;

  -- Service
  select * into v_service from public.services where id = p_service_id;
  if not found or (not v_admin and (not v_service.active or not v_service.bookable)) then
    raise exception 'That service isn’t available to book online.';
  end if;
  if not v_admin and v_service.audience = 'approved'
     and not coalesce((select booking_approved from public.profiles where id = v_client), false) then
    raise exception 'Book a meet & greet first — regular visits unlock once we’ve met your pup.';
  end if;
  v_kind := v_service.kind;
  v_duration := private.pick_duration(v_service, p_duration, v_admin);

  -- How the pup gets to us (picked up from home, or the client brings them), when the service asks.
  if v_handoff is not null and v_handoff not in ('pickup', 'bring') then raise exception 'Let us know how your pup gets to us.'; end if;
  if v_handoff is not null and not v_admin and not (v_handoff = any (v_service.handoff_options)) then
    raise exception 'Let us know how your pup gets to us.';
  end if;
  if v_handoff is null and cardinality(v_service.handoff_options) = 1 then
    v_handoff := v_service.handoff_options[1];
  end if;
  if v_handoff is null and cardinality(v_service.handoff_options) > 1 and not v_admin then
    raise exception 'Let us know how your pup gets to us.';
  end if;
  if not v_admin and p_arrival_minute is not null and v_kind <> 'time' then
    raise exception 'Only the Waiting for Paws team can do that.';
  end if;

  -- When
  if p_arrival_minute is not null and (p_arrival_minute < 0 or p_arrival_minute > 1439) then
    raise exception 'Pick a valid time.';
  end if;
  if v_kind in ('window', 'time') then
    if v_kind = 'time' and p_arrival_minute is null then raise exception 'Pick a time.'; end if;
    -- Clients' appointments always count against the window their start time is in.
    if p_arrival_minute is not null and (p_window_id is null or (v_kind = 'time' and not v_admin)) then
      p_window_id := private.window_containing(p_arrival_minute);
    end if;
    if p_window_id is not null then
      select * into v_window from public.booking_windows where id = p_window_id;
      if not found or (not v_admin and not v_window.active) then raise exception 'Pick a time of day.'; end if;
    elsif not v_admin or p_arrival_minute is null then
      raise exception 'Pick a time of day.';
    end if;
    v_arrival := case when p_arrival_minute is not null then time '00:00' + make_interval(mins => p_arrival_minute) end;
  end if;

  -- Who
  if v_client is not null and not exists (select 1 from public.profiles where id = v_client) then
    raise exception 'Client not found.';
  end if;
  v_pets := array(select distinct x from unnest(coalesce(p_pet_ids, '{}'::uuid[])) as t(x) where x is not null);
  if exists (
    select 1 from unnest(v_pets) as t(x)
    where not exists (select 1 from public.pets where id = t.x and owner_id = v_client)
  ) then
    raise exception 'Those pups don’t belong to this client.';
  end if;
  if not v_admin and cardinality(v_pets) = 0 then raise exception 'Choose which pup this visit is for.'; end if;
  if not v_admin and cardinality(v_pets) > v_service.max_pets then
    raise exception 'This service fits up to % pups per visit.', v_service.max_pets;
  end if;
  if v_client is null and nullif(trim(coalesce(p_guest_name, '')), '') is null then
    raise exception 'Pick a client or enter a guest name.';
  end if;

  -- Dates
  v_dates := array(select distinct d from unnest(coalesce(p_dates, '{}'::date[])) as t(d) where d is not null order by d);
  if cardinality(v_dates) = 0 then raise exception 'Pick at least one date.'; end if;
  if cardinality(v_dates) > 100 then raise exception 'You can book up to 100 visits at a time.'; end if;
  if v_kind = 'stay' then
    if cardinality(v_dates) <> 1 then raise exception 'Pick a check-in date.'; end if;
    if p_end_date is null or p_end_date <= v_dates[1] then raise exception 'Pick a check-out date after check-in.'; end if;
    if not v_admin and (p_end_date - v_dates[1] < v_service.min_nights or p_end_date - v_dates[1] > v_service.max_nights) then
      raise exception 'Stays for this service are % to % nights.', v_service.min_nights, v_service.max_nights;
    end if;
  end if;

  v_status := case when v_service.confirmation = 'request' and not v_admin then 'requested' else 'scheduled' end;
  v_series := case when cardinality(v_dates) > 1 then gen_random_uuid() end;

  -- One booking at a time, so two people can never take the last spot.
  perform pg_advisory_xact_lock(hashtext('wfp:bookings'));

  foreach v_date in array v_dates loop
    v_reason := null;
    v_walker := null;
    v_last := case when v_kind = 'stay' then p_end_date else v_date end;

    if v_kind in ('day', 'stay') then
      v_start := private.local_ts(v_date, private.service_start_minute(v_service));
      v_end := private.local_ts(v_last, private.service_end_minute(v_service));
    elsif v_kind = 'window' and v_window.id is not null then
      v_start := private.local_ts(v_date, v_window.start_minute);
      v_end := private.local_ts(v_date, v_window.end_minute);
    else
      v_start := private.local_ts(v_date, p_arrival_minute);
      v_end := v_start + make_interval(mins => v_duration);
    end if;

    -- Can it be booked?
    if v_kind in ('day', 'stay') then
      if not (v_admin and p_force) then
        v_reason := private.range_problem(v_service, v_date, v_last, null, not v_admin);
      end if;
    elsif not v_admin then
      v_reason := case when v_kind = 'time'
        then private.time_problem(v_date, v_window, p_arrival_minute, v_duration)
        else private.slot_problem(v_date, v_window) end;
    end if;

    -- The same pup can't be booked twice for the same time.
    if v_reason is null and cardinality(v_pets) > 0 and exists (
      select 1 from public.bookings b
      join public.booking_pets bp on bp.booking_id = b.id
      where bp.pet_id = any (v_pets)
        and b.status in ('requested', 'scheduled')
        and case
          when v_kind in ('day', 'stay') then
            b.kind = v_kind
            and b.service_date < case when v_kind = 'stay' then v_last else v_last + 1 end
            and v_date < case when b.kind = 'stay' then b.end_date else b.end_date + 1 end
          else
            b.service_date = v_date and b.kind in ('window', 'time')
            and b.start_time < v_end and v_start < b.end_time
        end
    ) then
      v_reason := 'already_booked';
    end if;

    -- Who walks it?
    if v_reason is null then
      if v_admin and p_walker_id is not null then
        if not exists (select 1 from public.walkers where profile_id = p_walker_id) then
          raise exception 'Walker not found.';
        end if;
        if not p_force and v_kind in ('window', 'time') and v_window.id is not null
           and private.walker_capacity(p_walker_id, v_date, v_window.id)
               - private.walker_booked(p_walker_id, v_date, v_window.id) <= 0 then
          v_reason := 'walker_full';
        else
          v_walker := p_walker_id;
        end if;
      elsif v_kind in ('day', 'stay') then
        v_walker := private.pick_walker_range(v_date, v_last, v_client);
      elsif v_window.id is not null then
        v_walker := case when v_kind = 'time'
          then private.pick_walker_at(v_date, v_window.id, v_client, p_arrival_minute, v_duration)
          else private.pick_walker(v_date, v_window.id, v_client) end;
        if v_walker is null and not (v_admin and p_force) then
          v_reason := coalesce(case when v_admin then private.slot_problem(v_date, v_window) end, 'full');
          if v_reason in ('too_soon', 'too_far') then v_reason := 'full'; end if;
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('date', v_date, 'reason', v_reason);
      continue;
    end if;

    insert into public.bookings (
      user_id, service_id, title, kind, start_time, end_time, status, source, walker_id, window_id,
      service_date, end_date, arrival_time, duration_minutes, series_id, client_note, notes, answers,
      invitee_name, invitee_email, created_by, handoff
    ) values (
      v_client, v_service.id, v_service.name, v_kind, v_start, v_end, v_status,
      case when v_admin then 'manual' else 'portal' end,
      v_walker, v_window.id, v_date, v_last,
      case when v_kind in ('window', 'time') then v_arrival end,
      case when v_kind in ('day', 'stay') then greatest(5, least(1440, (extract(epoch from v_end - v_start) / 60)::int)) else v_duration end,
      v_series,
      case when v_admin then null else v_note end,
      case when v_admin then v_note end,
      v_answers,
      case when v_client is null then left(trim(p_guest_name), 120) end,
      case when v_client is null then nullif(left(trim(coalesce(p_guest_email, '')), 200), '') end,
      v_uid,
      v_handoff
    )
    returning id into v_id;

    insert into public.booking_pets (booking_id, pet_id) select v_id, unnest(v_pets);

    v_ids := v_ids || v_id;
    v_created := v_created || jsonb_build_object('id', v_id, 'date', v_date, 'end_date', v_last, 'walker_id', v_walker);
  end loop;

  if cardinality(v_ids) = 0 then
    raise exception '%', case (v_skipped -> 0 ->> 'reason')
      when 'too_soon' then 'That time is too soon to book online — please message us.'
      when 'too_far' then 'That’s further out than we book. Pick an earlier date.'
      when 'closed' then 'We’re not taking bookings then.'
      when 'already_booked' then 'Your pup already has a booking then.'
      when 'walker_full' then 'That walker is fully booked then. Choose another walker or allow overbooking.'
      else 'Sorry — that time just filled up. Please pick another.'
    end;
  end if;

  if v_series is not null and cardinality(v_ids) = 1 then
    update public.bookings set series_id = null where id = v_ids[1];
    v_series := null;
  end if;

  perform private.notify('booked', v_ids, v_admin, (not v_admin) or p_notify);

  return jsonb_build_object('series_id', v_series, 'status', v_status, 'created', v_created, 'skipped', v_skipped);
end;
$$;

create or replace function private.visit_cards(p_ids uuid[], p_for text, p_limit int default 10)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  r record;
  v_html text := '';
  v_total int := coalesce(cardinality(p_ids), 0);
  v_line2 text;
  v_line3 text;
begin
  for r in
    select b.id, b.title, b.status, b.client_note, b.notes, b.invitee_name,
           k.display_name as walker_name, p.full_name as client_name, p.address, p.phone,
           private.pet_names(b.id) as pets, vw.day_label, vw.time_label,
           private.answers_text(b.answers) as answers,
           case when b.kind in ('window', 'time') and jsonb_array_length(coalesce(sv.duration_options, '[]'::jsonb)) > 1
             then private.length_label(b.duration_minutes) end as length,
           b.handoff
    from public.bookings b
    cross join lateral private.visit_when(b.id) vw
    left join public.services sv on sv.id = b.service_id
    left join public.walkers k on k.profile_id = b.walker_id
    left join public.profiles p on p.id = b.user_id
    where b.id = any (p_ids)
    order by b.service_date, coalesce(b.arrival_time, (b.start_time at time zone private.booking_tz())::time), b.start_time
    limit p_limit
  loop
    v_line2 := concat_ws(' · ', r.title, r.length,
      case r.handoff
        when 'pickup' then case when p_for = 'admin' then 'Pick up from home' else 'We pick up from home' end
        when 'bring' then case when p_for = 'admin' then 'Client brings the pup' else 'You’re bringing your pup' end
      end,
      r.pets);
    if p_for = 'admin' then
      v_line3 := concat_ws(' · ', coalesce(r.client_name, r.invitee_name, 'Guest'), r.address, r.phone,
                           case when r.walker_name is not null then 'with ' || r.walker_name else 'Unassigned' end);
    else
      v_line3 := case when r.walker_name is not null then 'With ' || r.walker_name end;
    end if;

    v_html := v_html
      || '<div style="margin:0 0 10px;padding:14px 16px;border-radius:16px;background:#F3F9FD;border:1px solid #DCEBF5">'
      || '<div style="font-size:16px;font-weight:800;color:#0F2B3F">' || private.html(r.day_label) || '</div>'
      || '<div style="margin-top:2px;font-size:15px;font-weight:700;color:#1A6FA0">' || private.html(r.time_label)
      || case when r.status = 'requested' then ' &middot; <span style="color:#B45309">awaiting confirmation</span>' else '' end
      || '</div>'
      || '<div style="margin-top:6px;font-size:14px;color:#3D5566">' || private.html(v_line2) || '</div>'
      || case when v_line3 is not null then '<div style="margin-top:2px;font-size:14px;color:#3D5566">' || private.html(v_line3) || '</div>' else '' end
      || case when p_for = 'admin' and coalesce(r.client_note, '') <> '' then
           '<div style="margin-top:6px;font-size:14px;color:#0F2B3F"><b>Note:</b> ' || private.html(r.client_note) || '</div>'
         else '' end
      || case when p_for = 'admin' and coalesce(r.answers, '') <> '' then
           '<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#0F2B3F;white-space:pre-line">' || private.html(r.answers) || '</div>'
         else '' end
      || '</div>';
  end loop;

  if v_total > p_limit then
    v_html := v_html || '<p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#3D5566">+ '
      || (v_total - p_limit) || ' more visit' || case when v_total - p_limit = 1 then '' else 's' end || '</p>';
  end if;
  return v_html;
end;
$$;

create or replace function private.answers_text(p_answers jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(
    coalesce(f.label, regexp_replace(a.key, '__details$', '')) || case when a.key like '%\_\_details' then ' (notes)' else '' end || ': ' ||
    case jsonb_typeof(a.value)
      when 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(a.value) as x)
      when 'boolean' then case when a.value = 'true'::jsonb then 'Yes' else 'No' end
      else a.value #>> '{}'
    end,
    E'\n' order by f.ord nulls last, a.key)
  from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as a
  left join lateral (
    select e ->> 'label' as label, n as ord
    from public.forms fm, jsonb_array_elements(fm.fields) with ordinality as t(e, n)
    where fm.slug = 'intake' and e ->> 'id' = regexp_replace(a.key, '__details$', '')
    limit 1
  ) f on true
  where coalesce(a.value #>> '{}', '') <> '' and a.value <> '[]'::jsonb;
$$;

revoke execute on function private.book_visits_v1(uuid, uuid[], date[], uuid, text, uuid, uuid, int, boolean, boolean, text, text, date, jsonb) from public, anon, authenticated;
revoke execute on function private.time_slots_v1(uuid, date) from public, anon, authenticated;
revoke execute on function private.pick_duration(public.services, int, boolean) from public, anon, authenticated;
revoke execute on function private.length_label(int) from public, anon, authenticated;
revoke execute on function public.book_visits(uuid, uuid[], date[], uuid, text, uuid, uuid, int, boolean, boolean, text, text, date, jsonb, int, text) from public, anon;
grant execute on function public.book_visits(uuid, uuid[], date[], uuid, text, uuid, uuid, int, boolean, boolean, text, text, date, jsonb, int, text) to authenticated, service_role;
revoke execute on function public.time_slots(uuid, date, int) from public, anon;
grant execute on function public.time_slots(uuid, date, int) to authenticated, service_role;
