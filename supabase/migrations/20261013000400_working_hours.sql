-- Working hours as blocks on a weekly calendar.
--
-- Before, each walker filled in a grid: how many visits per arrival window per weekday. Now they
-- draw the blocks of time they work (Mon 8 AM – 5 PM) and say how many dogs they can have out at
-- once in each one (1 for one family at a time, 4 for a park trip). Visits are fit into those
-- blocks minute by minute:
--   • Group services (services.shared: walks, park trips) can share the walker's time with other
--     dogs, up to the block's limit. Everything else (drop-ins, meet & greets) needs the walker to
--     themselves for the length of the visit.
--   • A family's dogs always go together: a visit fits whenever nothing else is booked then.
--   • Arrival-window visits are slotted at the earliest spot in the window that fits
--     (bookings.planned_minute), so they hold real time and the calendar shows them there. Clients
--     still see the window; the team can pin an exact time like before.
--   • Set-time services (meet & greets) offer every half hour the walker works, not just inside
--     arrival windows.
-- The old grid is converted below; walker_availability and its helpers are no longer used.

create table public.walker_hours (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references public.walkers (profile_id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute int not null check (start_minute between 0 and 1425 and start_minute % 15 = 0),
  end_minute int not null check (end_minute between 15 and 1440 and end_minute % 15 = 0),
  dogs smallint not null default 1 check (dogs between 1 and 20),
  label text check (char_length(label) <= 40),
  service_ids uuid[] check (cardinality(service_ids) between 1 and 50),
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

comment on table public.walker_hours is 'When each walker works, as weekly blocks (ISO weekday: 1 = Monday).';
comment on column public.walker_hours.dogs is 'How many dogs the walker can have out at once in this block.';
comment on column public.walker_hours.label is 'Optional name shown on the block, e.g. "Park run".';
comment on column public.walker_hours.service_ids is 'Only these services can be booked in the block (null = any).';

create index walker_hours_walker_day_idx on public.walker_hours (walker_id, weekday);

alter table public.walker_hours enable row level security;
-- Supabase's default privileges cover signed-in access; row level security keeps it to admins.
revoke all on public.walker_hours from anon;
create policy "walker_hours: admins manage" on public.walker_hours
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

comment on table public.walker_availability is 'Replaced by walker_hours (20261013000400_working_hours.sql). No longer read.';

alter table public.services
  add column shared boolean not null default false;

comment on column public.services.shared is
  'Group visits (walks, park trips): other dogs can be out with the walker at the same time, up to the hours block''s limit. Off = the walker''s full attention.';

-- Walks and park trips start out as group-friendly; the team can change any service.
update public.services
set shared = true
where kind = 'window' and (name ilike '%walk%' or name ilike '%park%' or name ilike '%adventure%');

alter table public.bookings
  add column planned_minute int check (planned_minute between 0 and 1439);

comment on column public.bookings.planned_minute is
  'Arrival-window visits: where the scheduler fit the visit into the walker''s hours, until the team pins an exact time.';

-- The old grid becomes blocks: each run of back-to-back windows a walker worked on a weekday.
insert into public.walker_hours (walker_id, weekday, start_minute, end_minute, dogs)
select y.walker_id, y.weekday, min(y.start_minute), max(y.end_minute), 1
from (
  select x.*, sum(x.starts_run) over (partition by x.walker_id, x.weekday order by x.start_minute, x.end_minute) as run
  from (
    select a.walker_id, a.weekday,
           (w.start_minute / 15) * 15 as start_minute,
           least(1440, ((w.end_minute + 14) / 15) * 15) as end_minute,
           case when w.start_minute <= max(w.end_minute) over (
                  partition by a.walker_id, a.weekday order by w.start_minute, w.end_minute
                  rows between unbounded preceding and 1 preceding)
                then 0 else 1 end as starts_run
    from public.walker_availability a
    join public.booking_windows w on w.id = a.window_id
    where a.capacity > 0 and w.active
  ) x
) y
where not exists (select 1 from public.walker_hours)
group by y.walker_id, y.weekday, y.run;

-- ---------------------------------------------------------------------------
-- Fitting visits into the hours
-- ---------------------------------------------------------------------------

-- Minute of the day a visit starts: its pinned arrival, else its planned spot, else its start time.
create or replace function private.visit_minute(p_arrival time, p_planned int, p_start timestamptz)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce((extract(epoch from p_arrival) / 60)::int, p_planned, private.local_minute(p_start));
$$;

-- Room a visit takes: the number of dogs on a group visit, 0 = it needs the walker to themselves.
create or replace function private.visit_dogs(p_service public.services, p_pets int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_service.shared, false) then greatest(coalesce(p_pets, 1), 1) else 0 end;
$$;

-- Can a walker take a visit starting at p_minute on p_date? p_dogs as in visit_dogs.
create or replace function private.walker_fits(
  p_walker uuid,
  p_date date,
  p_minute int,
  p_duration int,
  p_dogs int,
  p_service uuid,
  p_exclude uuid default null
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit int;
  v_busiest int;
begin
  -- Off then (all day, or the part of the day the time off covers)?
  if exists (
    select 1 from public.time_off t
    left join public.booking_windows w on w.id = t.window_id
    where (t.walker_id is null or t.walker_id = p_walker)
      and p_date between t.start_date and t.end_date
      and (t.window_id is null or (w.start_minute < p_minute + p_duration and p_minute < w.end_minute))
  ) then
    return false;
  end if;

  -- Working then: one block holds the whole visit and takes this service.
  select max(h.dogs) into v_limit
  from public.walker_hours h
  where h.walker_id = p_walker
    and h.weekday = extract(isodow from p_date)::int
    and h.start_minute <= p_minute and p_minute + p_duration <= h.end_minute
    and (h.service_ids is null or p_service = any (h.service_ids));
  if v_limit is null then return false; end if;

  -- The busiest moment of the visit: dogs already out with the walker (a solo visit counts as full).
  with busy as (
    select private.visit_minute(b.arrival_time, b.planned_minute, b.start_time) as at,
           b.duration_minutes as len,
           case when coalesce(s.shared, false)
             then greatest((select count(*)::int from public.booking_pets bp where bp.booking_id = b.id), 1)
             else 1000 end as dogs
    from public.bookings b
    left join public.services s on s.id = b.service_id
    where b.walker_id = p_walker
      and b.service_date = p_date
      and b.kind in ('window', 'time')
      and b.status in ('requested', 'scheduled')
      and b.id is distinct from p_exclude
  ), overlapping as (
    select * from busy where busy.at < p_minute + p_duration and p_minute < busy.at + busy.len
  )
  select coalesce(max(x.dogs), 0) into v_busiest
  from (
    select (select sum(o.dogs) from overlapping o where o.at <= t.at and t.at < o.at + o.len) as dogs
    from (select p_minute as at union select o.at from overlapping o where o.at > p_minute) t
  ) x;

  if v_busiest = 0 then return true; end if;
  if p_dogs <= 0 then return false; end if;
  return v_busiest + p_dogs <= v_limit;
end;
$$;

-- The earliest spot for a visit starting from p_from up to (not including) p_until: the client's
-- usual walker first, then whoever has the lightest day. p_walker = only that walker.
-- Starts are tried on the clock every p_step minutes, plus the start of each block.
create or replace function private.place_visit(
  p_service public.services,
  p_date date,
  p_from int,
  p_until int,
  p_duration int,
  p_dogs int,
  p_client uuid default null,
  p_exclude uuid default null,
  p_walker uuid default null,
  p_step int default 15
)
returns table (walker_id uuid, minute int)
language plpgsql
stable
set search_path = ''
as $$
declare
  k uuid;
  m int;
begin
  for k in
    select w.profile_id
    from public.walkers w
    where (p_walker is null and w.active) or w.profile_id = p_walker
    order by
      (select max(b.service_date) from public.bookings b
       where p_client is not null and b.user_id = p_client and b.walker_id = w.profile_id
         and b.status in ('scheduled', 'completed')) desc nulls last,
      (select count(*) from public.bookings b
       where b.walker_id = w.profile_id and b.service_date = p_date
         and b.status in ('requested', 'scheduled') and b.id is distinct from p_exclude),
      w.position,
      w.profile_id
  loop
    for m in
      select distinct c.at
      from public.walker_hours h
      cross join lateral (
        select greatest(h.start_minute, p_from) as at
        union
        select g.at from generate_series(
          ((greatest(h.start_minute, p_from) + p_step - 1) / p_step) * p_step,
          least(p_until - 1, h.end_minute - p_duration),
          p_step) as g(at)
      ) c
      where h.walker_id = k
        and h.weekday = extract(isodow from p_date)::int
        and (h.service_ids is null or p_service.id = any (h.service_ids))
        and c.at < p_until
        and c.at + p_duration <= h.end_minute
      order by c.at
    loop
      if private.walker_fits(k, p_date, m, p_duration, p_dogs, p_service.id, p_exclude) then
        walker_id := k;
        minute := m;
        return next;
        return;
      end if;
    end loop;
  end loop;
end;
$$;

-- After a visit didn't fit: 'closed' when nobody works then, else 'full'.
create or replace function private.no_room_reason(p_service public.services, p_date date, p_from int, p_until int, p_duration int)
returns text
language sql
stable
set search_path = ''
as $$
  select case when exists (
    select 1
    from public.walkers k
    join public.walker_hours h on h.walker_id = k.profile_id
    where k.active
      and h.weekday = extract(isodow from p_date)::int
      and (h.service_ids is null or p_service.id = any (h.service_ids))
      and greatest(h.start_minute, p_from) < p_until
      and greatest(h.start_minute, p_from) + p_duration <= h.end_minute
      and not exists (
        select 1 from public.time_off t
        where (t.walker_id is null or t.walker_id = k.profile_id) and t.window_id is null
          and p_date between t.start_date and t.end_date
      )
  ) then 'full' else 'closed' end;
$$;

-- Too soon or too far out for a client to book a start at p_minute on p_date (or null).
create or replace function private.timing_problem(p_date date, p_minute int)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when private.local_ts(p_date, p_minute) < now() + make_interval(hours => s.min_notice_hours) then 'too_soon'
    when p_date > private.local_today() + s.max_days_ahead then 'too_far'
  end
  from public.booking_settings s
  where s.id = 1;
$$;

-- First minute of p_date a client can still book, given the notice they have to give (1440 = none).
create or replace function private.first_bookable_minute(p_date date)
returns int
language sql
stable
set search_path = ''
as $$
  select least(1440, greatest(0, ceil(
    extract(epoch from (now() + make_interval(hours => s.min_notice_hours)) - private.local_ts(p_date, 0)) / 60
  )::int))
  from public.booking_settings s
  where s.id = 1;
$$;

-- ---------------------------------------------------------------------------
-- Booking API
-- ---------------------------------------------------------------------------

-- Both take a service, a length and a number of dogs now. Postgres can't change a function's
-- arguments in place, so the previous versions are renamed and parked in the private schema.
alter function public.booking_availability(date, date) rename to booking_availability_v1;
alter function public.booking_availability_v1(date, date) set schema private;
alter function public.time_slots(uuid, date, int) rename to time_slots_v2;
alter function public.time_slots_v2(uuid, date, int) set schema private;

-- What's open per day for a service. Window services: a row per arrival window. Set-time services:
-- one row per day (window_id null) when any start time is open. remaining is 1 when it fits and 0
-- when it's full; closed times aren't returned. p_exclude = a visit being moved (it doesn't count
-- against itself).
create or replace function public.booking_availability(
  p_from date,
  p_to date,
  p_service_id uuid default null,
  p_duration int default null,
  p_pets int default null,
  p_exclude uuid default null
)
returns table (service_date date, window_id uuid, capacity int, remaining int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_admin boolean := private.is_admin();
  v_service public.services;
  v_kind text := 'window';
  v_duration int;
  v_dogs int;
  v_exclude uuid;
  v_from date;
  v_to date;
  v_day date;
  v_first int;
  v_start int;
  w public.booking_windows;
begin
  if (select auth.uid()) is null then raise exception 'Please log in to book.'; end if;
  select * into s from public.booking_settings where id = 1;
  if not s.booking_enabled and not v_admin then return; end if;
  if p_service_id is not null then
    select * into v_service from public.services where id = p_service_id;
    if not found or v_service.kind not in ('window', 'time') then return; end if;
    if not v_admin and (not v_service.active or not v_service.bookable) then return; end if;
    v_kind := v_service.kind;
  end if;
  v_duration := case
    when p_duration between 5 and 720 then p_duration
    when v_service.id is not null then private.pick_duration(v_service, null, true)
    else 30 end;
  v_dogs := private.visit_dogs(v_service, coalesce(p_pets, 1));
  select b.id into v_exclude from public.bookings b
  where b.id = p_exclude and (v_admin or b.user_id = (select auth.uid()));

  -- Admins see every open spot; clients only what they can still book.
  v_from := case when v_admin then p_from else greatest(p_from, private.local_today()) end;
  v_to := least(p_to, v_from + 120, case when v_admin then p_to else private.local_today() + s.max_days_ahead end);
  if v_from is null or v_to is null or v_to < v_from then return; end if;

  for v_day in select v_from + i from generate_series(0, v_to - v_from) as g(i) loop
    v_first := case when v_admin then 0 else private.first_bookable_minute(v_day) end;
    continue when v_first >= 1440;

    if v_kind = 'time' then
      service_date := v_day;
      window_id := null;
      capacity := 1;
      if exists (select 1 from public.time_slots(v_service.id, v_day, v_duration, p_pets, v_exclude)) then
        remaining := 1;
        return next;
      elsif private.no_room_reason(v_service, v_day, v_first, 1440, v_duration) = 'full' then
        remaining := 0;
        return next;
      end if;
      continue;
    end if;

    for w in select * from public.booking_windows where active order by start_minute, position loop
      -- The whole window has to be far enough ahead.
      continue when w.start_minute < v_first;
      service_date := v_day;
      window_id := w.id;
      capacity := 1;
      if exists (select 1 from private.place_visit(v_service, v_day, w.start_minute, w.end_minute, v_duration, v_dogs, null, v_exclude)) then
        remaining := 1;
        return next;
      elsif private.no_room_reason(v_service, v_day, w.start_minute, w.end_minute, v_duration) = 'full' then
        remaining := 0;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

-- Set-time services: the start times still open on a day (every half hour someone works, plus the
-- start of each block), with the arrival window each one falls in (if any).
create or replace function public.time_slots(
  p_service_id uuid,
  p_date date,
  p_duration int default null,
  p_pets int default null,
  p_exclude uuid default null
)
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
  v_dogs int;
  v_exclude uuid;
  v_first int;
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
  v_dogs := private.visit_dogs(v_service, coalesce(p_pets, 1));
  select b.id into v_exclude from public.bookings b
  where b.id = p_exclude and (v_admin or b.user_id = (select auth.uid()));
  v_first := case when v_admin then 0 else private.first_bookable_minute(p_date) end;

  for m in
    select distinct c.at
    from public.walker_hours h
    join public.walkers k on k.profile_id = h.walker_id and k.active
    cross join lateral (
      select h.start_minute as at where h.start_minute >= v_first
      union
      select g.at from generate_series(((greatest(h.start_minute, v_first) + 29) / 30) * 30, h.end_minute - v_duration, 30) as g(at)
    ) c
    where h.weekday = extract(isodow from p_date)::int
      and (h.service_ids is null or v_service.id = any (h.service_ids))
      and c.at + v_duration <= h.end_minute
    order by c.at
  loop
    if exists (select 1 from private.place_visit(v_service, p_date, m, m + 1, v_duration, v_dogs, null, v_exclude)) then
      minute := m;
      window_id := private.window_containing(m);
      return next;
    end if;
  end loop;
end;
$$;

-- Books one or more visits (several dates = a weekly series).
-- Clients book for themselves; admins can book for anyone (or a guest), pick the walker, pin an
-- exact arrival time and go past the walker's hours with p_force.
-- Returns { series_id, status, created: [{id, date, walker_id}], skipped: [{date, reason}] }.
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
  v_dogs int;
  v_dates date[];
  v_date date;
  v_last date;
  v_series uuid;
  v_status text;
  v_reason text;
  v_walker uuid;
  v_planned int;
  v_from int;
  v_until int;
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
    -- Appointments are filed under the arrival window their start time falls in, if any.
    if p_arrival_minute is not null and (p_window_id is null or (v_kind = 'time' and not v_admin)) then
      p_window_id := private.window_containing(p_arrival_minute);
    end if;
    if p_window_id is not null then
      select * into v_window from public.booking_windows where id = p_window_id;
      if not found or (not v_admin and not v_window.active) then raise exception 'Pick a time of day.'; end if;
    elsif p_arrival_minute is null then
      raise exception 'Pick a time of day.';
    end if;
    v_arrival := case when p_arrival_minute is not null then time '00:00' + make_interval(mins => p_arrival_minute) end;
    -- An exact time is tried as is; a window visit can start anywhere in its window.
    v_from := coalesce(p_arrival_minute, v_window.start_minute);
    v_until := case when p_arrival_minute is not null then p_arrival_minute + 1 else v_window.end_minute end;
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
  if p_walker_id is not null and not exists (select 1 from public.walkers where profile_id = p_walker_id) then
    raise exception 'Walker not found.';
  end if;
  v_dogs := private.visit_dogs(v_service, cardinality(v_pets));

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
    v_planned := null;
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
      v_reason := private.timing_problem(v_date, v_from);
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

    -- Who walks it, and when in the window?
    if v_reason is null then
      if v_kind in ('day', 'stay') then
        v_walker := coalesce(case when v_admin then p_walker_id end, private.pick_walker_range(v_date, v_last, v_client));
      else
        select p.walker_id, p.minute into v_walker, v_planned
        from private.place_visit(v_service, v_date, v_from, v_until, v_duration, v_dogs, v_client, null,
                                 case when v_admin then p_walker_id end) p;
        if v_walker is null then
          if v_admin and p_force then
            v_walker := p_walker_id;
          elsif v_admin and p_walker_id is not null then
            v_reason := 'walker_full';
          else
            v_reason := private.no_room_reason(v_service, v_date, v_from, v_until, v_duration);
          end if;
        end if;
        if p_arrival_minute is not null then v_planned := null; end if;
      end if;
    end if;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('date', v_date, 'reason', v_reason);
      continue;
    end if;

    insert into public.bookings (
      user_id, service_id, title, kind, start_time, end_time, status, source, walker_id, window_id,
      service_date, end_date, arrival_time, planned_minute, duration_minutes, series_id, client_note, notes, answers,
      invitee_name, invitee_email, created_by, handoff
    ) values (
      v_client, v_service.id, v_service.name, v_kind, v_start, v_end, v_status,
      case when v_admin then 'manual' else 'portal' end,
      v_walker, v_window.id, v_date, v_last,
      case when v_kind in ('window', 'time') then v_arrival end,
      case when v_kind = 'window' then v_planned end,
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
      when 'walker_full' then 'That walker isn’t free then. Choose another walker or allow overbooking.'
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

-- Moves a visit. Clients pick a new date and window (or time); it has to fit someone's hours.
-- Admins can also pin an exact arrival time (p_arrival_minute, picks the matching window), clear it
-- again (p_clear_arrival) and reassign the walker, without the hours getting in the way.
-- p_notify null = email the client only if the day or window changed.
create or replace function public.move_booking(
  p_booking_id uuid,
  p_date date,
  p_window_id uuid default null,
  p_arrival_minute int default null,
  p_walker_id uuid default null,
  p_notify boolean default null,
  p_clear_arrival boolean default false,
  p_end_date date default null
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
  b public.bookings;
  v_service public.services;
  v_window public.booking_windows;
  v_window_id uuid;
  v_arrival time;
  v_walker uuid;
  v_planned int;
  v_dogs int;
  v_from int;
  v_until int;
  v_last date;
  v_start timestamptz;
  v_end timestamptz;
  v_problem text;
  v_changed boolean;
begin
  if v_uid is null then raise exception 'Please log in.'; end if;
  if p_date is null then raise exception 'Pick a date.'; end if;
  select * into s from public.booking_settings where id = 1;

  perform pg_advisory_xact_lock(hashtext('wfp:bookings'));

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or (not v_admin and b.user_id is distinct from v_uid) then raise exception 'Visit not found.'; end if;
  select * into v_service from public.services where id = b.service_id;
  v_dogs := private.visit_dogs(v_service, (select count(*)::int from public.booking_pets where booking_id = b.id));

  if not v_admin then
    if not s.booking_enabled then
      raise exception 'Online booking is paused right now — please message us to make changes.';
    end if;
    if b.status not in ('requested', 'scheduled') then raise exception 'This visit can’t be changed anymore.'; end if;
    if p_walker_id is not null or (p_arrival_minute is not null and b.kind <> 'time') then
      raise exception 'Only the Waiting for Paws team can do that.';
    end if;
    if b.start_time < now() + make_interval(hours => s.cancel_cutoff_hours) then
      raise exception 'This visit is less than % hours away — please message us to change it.', s.cancel_cutoff_hours;
    end if;
  end if;
  if p_arrival_minute is not null and (p_arrival_minute < 0 or p_arrival_minute > 1439) then
    raise exception 'Pick a valid time.';
  end if;

  if b.kind in ('day', 'stay') then
    -- Keep the length (or take the new check-out) and the drop-off / pick-up times.
    v_last := case
      when b.kind = 'stay' then coalesce(p_end_date, p_date + (b.end_date - b.service_date))
      else p_date end;
    if b.kind = 'stay' and v_last <= p_date then raise exception 'Check-out has to be after check-in.'; end if;
    if not v_admin then
      if b.kind = 'stay' and v_service.id is not null
         and (v_last - p_date < v_service.min_nights or v_last - p_date > v_service.max_nights) then
        raise exception 'Stays for this service are % to % nights.', v_service.min_nights, v_service.max_nights;
      end if;
      if v_service.id is not null then
        v_problem := private.range_problem(v_service, p_date, v_last, b.id, true);
      end if;
      if v_problem is not null then
        raise exception '%', case v_problem
          when 'too_soon' then 'That’s too soon to book online.'
          when 'too_far' then 'That’s further out than we book.'
          when 'closed' then 'We’re not taking bookings on one of those days.'
          else 'Sorry — one of those days is full. Please pick other dates.' end;
      end if;
      if exists (
        select 1 from public.bookings x
        join public.booking_pets bp on bp.booking_id = x.id
        where bp.pet_id in (select pet_id from public.booking_pets where booking_id = b.id)
          and x.id <> b.id and x.kind = b.kind and x.status in ('requested', 'scheduled')
          and x.service_date < case when b.kind = 'stay' then v_last else v_last + 1 end
          and p_date < case when x.kind = 'stay' then x.end_date else x.end_date + 1 end
      ) then
        raise exception 'Your pup already has a booking then.';
      end if;
    end if;
    v_window_id := null;
    v_arrival := null;
    v_start := private.local_ts(p_date, private.local_minute(b.start_time));
    v_end := private.local_ts(v_last, private.local_minute(b.end_time));
    -- Admins keep whoever is assigned (even nobody); clients keep their walker if free, else the next best.
    v_walker := case when v_admin then coalesce(p_walker_id, b.walker_id) else coalesce(
      case when b.walker_id is not null and not exists (
          select 1 from public.time_off t
          where t.walker_id = b.walker_id and t.window_id is null and t.start_date <= v_last and t.end_date >= p_date
        ) then b.walker_id end,
      private.pick_walker_range(p_date, v_last, b.user_id, b.id)) end;
  elsif not v_admin then
    v_last := p_date;
    if b.kind = 'time' then
      if p_arrival_minute is null then raise exception 'Pick a time.'; end if;
      v_window_id := private.window_containing(p_arrival_minute);
      v_from := p_arrival_minute;
      v_until := p_arrival_minute + 1;
      v_arrival := time '00:00' + make_interval(mins => p_arrival_minute);
    else
      select * into v_window from public.booking_windows where id = p_window_id;
      if not found or not v_window.active then raise exception 'Pick a time of day.'; end if;
      v_window_id := v_window.id;
      v_from := v_window.start_minute;
      v_until := v_window.end_minute;
      v_arrival := null;
    end if;
    v_problem := private.timing_problem(p_date, v_from);
    if v_problem is null then
      -- Their walker if they're free then, else whoever is.
      if exists (select 1 from public.walkers where profile_id = b.walker_id and active) then
        select p.walker_id, p.minute into v_walker, v_planned
        from private.place_visit(v_service, p_date, v_from, v_until, b.duration_minutes, v_dogs, b.user_id, b.id, b.walker_id) p;
      end if;
      if v_walker is null then
        select p.walker_id, p.minute into v_walker, v_planned
        from private.place_visit(v_service, p_date, v_from, v_until, b.duration_minutes, v_dogs, b.user_id, b.id) p;
      end if;
      if v_walker is null then
        v_problem := private.no_room_reason(v_service, p_date, v_from, v_until, b.duration_minutes);
      end if;
    end if;
    if v_problem is not null then
      raise exception '%', case v_problem
        when 'too_soon' then 'That time is too soon to book online.'
        when 'too_far' then 'That’s further out than we book.'
        when 'closed' then 'We’re not taking visits at that time.'
        else 'Sorry — that time is full. Please pick another.' end;
    end if;
    if b.kind = 'time' then v_planned := null; end if;
  else
    v_last := p_date;
    v_window_id := case
      when p_window_id is not null then p_window_id
      when p_arrival_minute is not null then private.window_containing(p_arrival_minute)
      else b.window_id
    end;
    v_arrival := case
      when p_arrival_minute is not null then time '00:00' + make_interval(mins => p_arrival_minute)
      when p_clear_arrival or v_window_id is distinct from b.window_id then null
      else b.arrival_time
    end;
    if v_window_id is null and v_arrival is null then raise exception 'Pick a time of day.'; end if;
    if v_window_id is not null then
      select * into v_window from public.booking_windows where id = v_window_id;
      if not found then raise exception 'Pick a time of day.'; end if;
    end if;
    v_walker := coalesce(p_walker_id, b.walker_id);
    if p_walker_id is not null and not exists (select 1 from public.walkers where profile_id = p_walker_id) then
      raise exception 'Walker not found.';
    end if;
    -- An unpinned window visit takes the walker's first free spot in its window (if there is one).
    if b.kind = 'window' and v_arrival is null and v_window.id is not null and v_walker is not null then
      select p.minute into v_planned
      from private.place_visit(v_service, p_date, v_window.start_minute, v_window.end_minute, b.duration_minutes, v_dogs,
                               b.user_id, b.id, v_walker) p;
    end if;
  end if;

  if b.kind in ('window', 'time') then
    if b.kind = 'window' and v_window.id is not null then
      v_start := private.local_ts(p_date, v_window.start_minute);
      v_end := private.local_ts(p_date, v_window.end_minute);
    else
      v_start := private.local_ts(p_date, coalesce((extract(epoch from v_arrival) / 60)::int, v_window.start_minute));
      v_end := v_start + make_interval(mins => b.duration_minutes);
    end if;
    -- The same pup can't be in two places at once (same rule as book_visits).
    if not v_admin and exists (
      select 1 from public.bookings x
      join public.booking_pets bp on bp.booking_id = x.id
      where bp.pet_id in (select pet_id from public.booking_pets where booking_id = b.id)
        and x.id <> b.id and x.status in ('requested', 'scheduled')
        and x.service_date = p_date and x.kind in ('window', 'time')
        and x.start_time < v_end and v_start < x.end_time
    ) then
      raise exception 'Your pup already has a visit at that time.';
    end if;
  end if;

  v_changed := p_date is distinct from b.service_date or v_last is distinct from b.end_date
    or v_window_id is distinct from b.window_id
    or ((v_window_id is null or b.kind = 'time') and v_arrival is distinct from b.arrival_time);

  update public.bookings
  set service_date = p_date,
      end_date = v_last,
      window_id = v_window_id,
      arrival_time = v_arrival,
      planned_minute = case when b.kind = 'window' and v_arrival is null then v_planned end,
      start_time = v_start,
      end_time = v_end,
      walker_id = v_walker,
      -- A client moving something that needs approval sends it back for approval.
      status = case when not v_admin and v_changed and v_service.confirmation = 'request' then 'requested' else status end,
      reminder_sent_at = case when p_date is distinct from b.service_date then null else reminder_sent_at end
  where id = b.id;

  if v_admin then
    if coalesce(p_notify, v_changed) and b.status in ('requested', 'scheduled') then
      perform private.notify('moved', array[b.id], true, true);
    end if;
  else
    perform private.notify('moved', array[b.id], false, true);
  end if;

  return jsonb_build_object('id', b.id, 'walker_id', v_walker, 'window_id', v_window_id, 'notified', v_changed);
end;
$$;

-- Existing window visits get their spot in the hours (oldest booking first).
do $$
declare
  r record;
  v_minute int;
begin
  for r in
    select b.id, b.service_date, b.duration_minutes, b.walker_id, b.user_id, s as service, w.start_minute, w.end_minute,
           (select count(*)::int from public.booking_pets bp where bp.booking_id = b.id) as pets
    from public.bookings b
    join public.booking_windows w on w.id = b.window_id
    left join public.services s on s.id = b.service_id
    where b.kind = 'window' and b.arrival_time is null and b.planned_minute is null and b.walker_id is not null
      and b.status in ('requested', 'scheduled') and b.service_date >= private.local_today()
    order by b.created_at
  loop
    select p.minute into v_minute
    from private.place_visit(r.service, r.service_date, r.start_minute, r.end_minute, r.duration_minutes,
                             private.visit_dogs(r.service, r.pets), r.user_id, r.id, r.walker_id) p;
    update public.bookings set planned_minute = coalesce(v_minute, r.start_minute) where id = r.id;
  end loop;
end;
$$;

revoke execute on function private.booking_availability_v1(date, date) from public, anon, authenticated;
revoke execute on function private.time_slots_v2(uuid, date, int) from public, anon, authenticated;
revoke execute on function private.visit_minute(time, int, timestamptz) from public, anon, authenticated;
revoke execute on function private.visit_dogs(public.services, int) from public, anon, authenticated;
revoke execute on function private.walker_fits(uuid, date, int, int, int, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.place_visit(public.services, date, int, int, int, int, uuid, uuid, uuid, int) from public, anon, authenticated;
revoke execute on function private.no_room_reason(public.services, date, int, int, int) from public, anon, authenticated;
revoke execute on function private.timing_problem(date, int) from public, anon, authenticated;
revoke execute on function private.first_bookable_minute(date) from public, anon, authenticated;
revoke execute on function public.booking_availability(date, date, uuid, int, int, uuid) from public, anon;
grant execute on function public.booking_availability(date, date, uuid, int, int, uuid) to authenticated, service_role;
revoke execute on function public.time_slots(uuid, date, int, int, uuid) from public, anon;
grant execute on function public.time_slots(uuid, date, int, int, uuid) to authenticated, service_role;
