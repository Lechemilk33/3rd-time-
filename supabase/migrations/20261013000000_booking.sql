-- Waiting for Paws — native booking
--
-- Clients book an arrival window ("Midday, 11 AM – 2 PM") from the portal. Each walker sets how
-- many visits they can take per window per weekday. Admins see everything on a calendar, pin
-- exact arrival times, move and reassign visits.
--
-- Every booking write goes through the security-definer functions below, so capacity is checked
-- atomically (no double booking) and the right emails go out no matter who made the change.
-- Emails are sent with Resend through pg_net; the API key lives in Supabase Vault as
-- `resend_api_key`. Reminders and the walkers' evening digest run hourly with pg_cron.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Booking settings (single row)
-- ---------------------------------------------------------------------------

create table public.booking_settings (
  id int primary key default 1 check (id = 1),
  booking_enabled boolean not null default true,
  timezone text not null default 'America/Los_Angeles',
  min_notice_hours int not null default 12 check (min_notice_hours between 0 and 336),
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  cancel_cutoff_hours int not null default 12 check (cancel_cutoff_hours between 0 and 336),
  admin_alerts boolean not null default true,
  client_reminders boolean not null default true,
  walker_digest boolean not null default true,
  reminder_hour int not null default 18 check (reminder_hour between 0 and 23),
  reply_to text not null default 'hello@waitingforpaws.com'
    check (reply_to ~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$'),
  from_address text not null default 'Waiting for Paws <noreply@waitingforpaws.com>',
  site_url text not null default 'https://waitingforpaws.com',
  updated_at timestamptz not null default now()
);

insert into public.booking_settings (id) values (1);

create trigger booking_settings_updated_at before update on public.booking_settings
  for each row execute function public.set_updated_at();

-- Arrival windows clients pick from, e.g. Morning 8–11.
create table public.booking_windows (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 40),
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 1 and 1440),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

-- Admins who walk. Created automatically for every admin.
create table public.walkers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null default '#1A6FA0' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- How many visits each walker can take in a window on a weekday (ISO: 1 = Monday).
create table public.walker_availability (
  walker_id uuid not null references public.walkers (profile_id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  window_id uuid not null references public.booking_windows (id) on delete cascade,
  capacity smallint not null default 0 check (capacity between 0 and 50),
  primary key (walker_id, weekday, window_id)
);

-- Days off. walker_id null = the whole business is closed; window_id null = all day.
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid references public.walkers (profile_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  window_id uuid references public.booking_windows (id) on delete cascade,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index time_off_dates_idx on public.time_off (start_date, end_date);

-- Private calendar subscription links (one per admin).
create table public.calendar_feeds (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Services, profiles and bookings
-- ---------------------------------------------------------------------------

alter table public.services
  add column bookable boolean not null default true,
  add column audience text not null default 'approved' check (audience in ('everyone', 'approved')),
  add column confirmation text not null default 'instant' check (confirmation in ('instant', 'request')),
  add column max_pets smallint not null default 3 check (max_pets between 1 and 10);

comment on column public.services.audience is
  'everyone: any client can book (meet & greet); approved: only clients an admin has approved';
comment on column public.services.confirmation is
  'instant: booked right away; request: an admin confirms or declines';

-- How each service is booked:
--   window = a visit in an arrival window (walks, drop-ins)
--   time   = an appointment at a set time (meet & greets, pet taxi)
--   day    = a full day (daycare, adventure days)
--   stay   = overnight, check-in to check-out (house sitting, boarding)
alter table public.services
  add column kind text not null default 'window' check (kind in ('window', 'time', 'day', 'stay')),
  add column price_unit text not null default 'visit' check (price_unit in ('visit', 'hour', 'day', 'night', 'flat')),
  add column daily_capacity smallint check (daily_capacity between 1 and 100),
  add column start_minute int check (start_minute between 0 and 1439),
  add column end_minute int check (end_minute between 0 and 1439),
  add column min_nights smallint not null default 1 check (min_nights between 1 and 60),
  add column max_nights smallint not null default 14 check (max_nights between 1 and 90);

comment on column public.services.daily_capacity is
  'Full-day and overnight services: how many can be booked per day/night (null = no limit)';
comment on column public.services.start_minute is 'Full day: drop-off time. Overnight: check-in time.';
comment on column public.services.end_minute is 'Full day: pick-up time. Overnight: check-out time.';

-- Meet & greets are open to new clients, happen at a set time and need a quick confirmation.
update public.services
set audience = 'everyone', confirmation = 'request', max_pets = 5, kind = 'time'
where name ilike 'meet%greet%';

-- Approved clients can book regular visits (set by an admin).
alter table public.profiles add column booking_approved boolean not null default false;

-- The services each client signed up for. Intake questions can be tied to services, so clients
-- only answer what applies to them (and get asked the rest when they add a service).
alter table public.form_submissions add column service_ids uuid[] not null default '{}';

-- Clients can't set their own review status. New or changed answers go back to "submitted" for
-- review; adding a service without new answers keeps the current status.
create or replace function private.protect_submission_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'submitted';
    elsif new.answers is distinct from old.answers then
      new.status := 'submitted';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger form_submissions_protect_status
  before insert or update on public.form_submissions
  for each row execute function private.protect_submission_status();

alter policy "submissions: insert own" on public.form_submissions
  with check (user_id = (select auth.uid()));
alter policy "submissions: update own" on public.form_submissions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- New statuses/sources and the Calendly cleanup are in 20261013000100_booking_statuses.sql.
alter table public.bookings alter column source set default 'portal';

alter table public.bookings
  add column walker_id uuid references public.walkers (profile_id) on delete set null,
  add column window_id uuid references public.booking_windows (id) on delete set null,
  add column service_date date,
  add column arrival_time time,
  add column duration_minutes int not null default 30 check (duration_minutes between 5 and 1440),
  add column series_id uuid,
  add column client_note text check (char_length(client_note) <= 1000),
  add column cancel_reason text check (char_length(cancel_reason) <= 500),
  add column canceled_at timestamptz,
  add column canceled_by uuid references public.profiles (id) on delete set null,
  add column created_by uuid references public.profiles (id) on delete set null,
  add column reminder_sent_at timestamptz;

comment on column public.bookings.start_time is 'Start of the booked arrival window (or the exact time if there is no window)';
comment on column public.bookings.arrival_time is 'Exact local arrival time an admin pinned, if any';
comment on column public.bookings.notes is 'Visit notes from the team. Visible to the client.';
comment on column public.bookings.client_note is 'What the client wrote when booking';
comment on column public.bookings.invitee_name is 'Guest name for bookings without a client account';

create index bookings_slot_idx on public.bookings (service_date, window_id) where status in ('requested', 'scheduled');
create index bookings_walker_date_idx on public.bookings (walker_id, service_date);
create index bookings_series_idx on public.bookings (series_id) where series_id is not null;
create index bookings_status_start_idx on public.bookings (status, start_time);

-- Full days and overnight stays: end_date is the last day (check-out day for stays).
-- answers holds the intake questions asked on every booking of a service.
alter table public.bookings
  add column kind text not null default 'window' check (kind in ('window', 'time', 'day', 'stay')),
  add column end_date date,
  add column answers jsonb not null default '{}'::jsonb;

create index bookings_range_idx on public.bookings (service_id, service_date, end_date)
  where status in ('requested', 'scheduled');

create or replace function private.bookings_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.end_date is null or new.end_date < new.service_date then
    new.end_date := new.service_date;
  end if;
  return new;
end;
$$;

create trigger bookings_defaults before insert or update on public.bookings
  for each row execute function private.bookings_defaults();

create table public.booking_pets (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  primary key (booking_id, pet_id)
);

create index booking_pets_pet_idx on public.booking_pets (pet_id);

-- Which walker digests have gone out (so the hourly job never sends twice).
create table private.digest_log (
  walker_id uuid not null,
  service_date date not null,
  sent_at timestamptz not null default now(),
  primary key (walker_id, service_date)
);

-- ---------------------------------------------------------------------------
-- Profiles: approval is admin-only; every admin gets a walker row
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.booking_approved is distinct from old.booking_approved)
     and current_user in ('authenticated', 'anon')
     and not private.is_admin() then
    raise exception 'Only admins can change roles or approvals';
  end if;
  return new;
end;
$$;

alter policy "profiles: insert own" on public.profiles
  with check (id = (select auth.uid()) and role = 'client' and not booking_approved);

create or replace function private.sync_walker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  palette text[] := array['#1A6FA0', '#F2711C', '#0E9F6E', '#7C3AED', '#DB2777', '#0891B2', '#CA8A04'];
begin
  if new.role = 'admin' then
    insert into public.walkers (profile_id, display_name, color, position)
    values (
      new.id,
      coalesce(
        nullif(split_part(trim(coalesce(new.full_name, '')), ' ', 1), ''),
        initcap(split_part(coalesce(new.email, 'walker'), '@', 1))
      ),
      coalesce(
        (select c from unnest(palette) with ordinality as u(c, i)
         where c not in (select color from public.walkers) order by i limit 1),
        palette[1]
      ),
      coalesce((select max(position) + 1 from public.walkers), 0)
    )
    on conflict (profile_id) do update set active = true;
  elsif tg_op = 'UPDATE' and old.role = 'admin' then
    update public.walkers set active = false where profile_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_walker
  after insert or update of role on public.profiles
  for each row execute function private.sync_walker();

-- ---------------------------------------------------------------------------
-- Time helpers
-- ---------------------------------------------------------------------------

create or replace function private.booking_tz()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select timezone from public.booking_settings where id = 1), 'America/Los_Angeles');
$$;

-- Local date + minutes after midnight -> absolute time.
create or replace function private.local_ts(p_date date, p_minute int)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_date::timestamp + make_interval(mins => p_minute)) at time zone private.booking_tz();
$$;

create or replace function private.local_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone private.booking_tz())::date;
$$;

-- 480 -> '8 AM', 690 -> '11:30 AM'
create or replace function private.minute_label(p_minute int)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(timestamp '2000-01-01' + make_interval(mins => p_minute % 1440), 'FMHH12:MI AM'), ':00 ', ' ');
$$;

create or replace function private.window_containing(p_minute int)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.booking_windows
  where active and p_minute >= start_minute and p_minute < end_minute
  order by position, start_minute
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Capacity
-- ---------------------------------------------------------------------------

-- Visits a walker can take in a window on a date (0 on time off).
create or replace function private.walker_capacity(p_walker uuid, p_date date, p_window uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.time_off t
      where (t.walker_id is null or t.walker_id = p_walker)
        and p_date between t.start_date and t.end_date
        and (t.window_id is null or t.window_id = p_window)
    ) then 0
    else coalesce((
      select a.capacity from public.walker_availability a
      where a.walker_id = p_walker
        and a.window_id = p_window
        and a.weekday = extract(isodow from p_date)::int
    ), 0)
  end;
$$;

create or replace function private.walker_booked(p_walker uuid, p_date date, p_window uuid, p_exclude uuid default null)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.bookings b
  where b.walker_id = p_walker
    and b.service_date = p_date
    and b.window_id = p_window
    and b.status in ('requested', 'scheduled')
    and b.id is distinct from p_exclude;
$$;

-- Best walker for a visit: keep clients with the walker they know, then spread the load.
create or replace function private.pick_walker(p_date date, p_window uuid, p_client uuid, p_exclude uuid default null)
returns uuid
language sql
stable
set search_path = ''
as $$
  select k.profile_id
  from public.walkers k
  cross join lateral (
    select private.walker_capacity(k.profile_id, p_date, p_window)
         - private.walker_booked(k.profile_id, p_date, p_window, p_exclude) as remaining
  ) r
  where k.active and r.remaining > 0
  order by
    (select max(b.service_date) from public.bookings b
     where p_client is not null and b.user_id = p_client and b.walker_id = k.profile_id
       and b.status in ('scheduled', 'completed')) desc nulls last,
    r.remaining desc,
    k.position,
    k.profile_id
  limit 1;
$$;

-- Why a client can't book a window on a date, or null if they can.
create or replace function private.slot_problem(p_date date, p_window public.booking_windows, p_exclude uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_capacity int;
  v_remaining int;
begin
  select * into s from public.booking_settings where id = 1;
  if not p_window.active then return 'closed'; end if;
  if private.local_ts(p_date, p_window.start_minute) < now() + make_interval(hours => s.min_notice_hours) then
    return 'too_soon';
  end if;
  if p_date > private.local_today() + s.max_days_ahead then return 'too_far'; end if;

  select coalesce(sum(c.capacity), 0), coalesce(sum(greatest(c.capacity - c.booked, 0)), 0)
  into v_capacity, v_remaining
  from (
    select private.walker_capacity(k.profile_id, p_date, p_window.id) as capacity,
           private.walker_booked(k.profile_id, p_date, p_window.id, p_exclude) as booked
    from public.walkers k
    where k.active
  ) c;

  if v_capacity = 0 then return 'closed'; end if;
  if v_remaining = 0 then return 'full'; end if;
  return null;
end;
$$;

-- Minutes after midnight (business time) of an absolute time.
create or replace function private.local_minute(p_ts timestamptz)
returns int
language sql
stable
set search_path = ''
as $$
  select (extract(hour from p_ts at time zone private.booking_tz()) * 60
        + extract(minute from p_ts at time zone private.booking_tz()))::int;
$$;

-- Default drop-off / check-in and pick-up / check-out times for full-day and overnight services.
create or replace function private.service_start_minute(p_service public.services)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_service.start_minute, case when p_service.kind = 'stay' then 17 * 60 else 8 * 60 end);
$$;

create or replace function private.service_end_minute(p_service public.services)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_service.end_minute, case when p_service.kind = 'stay' then 10 * 60 else 17 * 60 end);
$$;

-- Closed for everyone that day (business-wide all-day time off, or every walker is off).
create or replace function private.day_closed(p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.time_off t
      where t.walker_id is null and t.window_id is null and p_date between t.start_date and t.end_date
    )
    or not exists (
      select 1 from public.walkers k
      where k.active
        and not exists (
          select 1 from public.time_off t
          where t.walker_id = k.profile_id and t.window_id is null and p_date between t.start_date and t.end_date
        )
    );
$$;

-- Bookings of a full-day/overnight service that use a given day (stays use nights: check-in up to,
-- not including, check-out).
create or replace function private.service_booked(p_service uuid, p_date date, p_exclude uuid default null)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.bookings b
  where b.service_id = p_service
    and b.status in ('requested', 'scheduled')
    and b.id is distinct from p_exclude
    and p_date >= b.service_date
    and p_date < case when b.kind = 'stay' then greatest(b.end_date, b.service_date + 1) else b.end_date + 1 end;
$$;

-- Why a full day / stay can't be booked (or null). p_timing = false skips notice/limits (admins).
create or replace function private.range_problem(
  p_service public.services,
  p_start date,
  p_end date,
  p_exclude uuid default null,
  p_timing boolean default true
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_last date := case when p_service.kind = 'stay' then p_end - 1 else p_start end;
  d date;
begin
  select * into s from public.booking_settings where id = 1;
  if p_timing then
    if private.local_ts(p_start, private.service_start_minute(p_service)) < now() + make_interval(hours => s.min_notice_hours) then
      return 'too_soon';
    end if;
    if p_start > private.local_today() + s.max_days_ahead then return 'too_far'; end if;
  end if;
  for d in select p_start + i from generate_series(0, greatest(v_last - p_start, 0)) as g(i) loop
    if private.day_closed(d) then return 'closed'; end if;
    if p_service.daily_capacity is not null
       and private.service_booked(p_service.id, d, p_exclude) >= p_service.daily_capacity then
      return 'full';
    end if;
  end loop;
  return null;
end;
$$;

-- A walker with room in the window who isn't already busy at that exact time.
create or replace function private.pick_walker_at(
  p_date date,
  p_window uuid,
  p_client uuid,
  p_minute int,
  p_duration int,
  p_exclude uuid default null
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select k.profile_id
  from public.walkers k
  cross join lateral (
    select private.walker_capacity(k.profile_id, p_date, p_window)
         - private.walker_booked(k.profile_id, p_date, p_window, p_exclude) as remaining
  ) r
  where k.active and r.remaining > 0
    and not exists (
      select 1 from public.bookings b
      where b.walker_id = k.profile_id
        and b.service_date = p_date
        and b.status in ('requested', 'scheduled')
        and b.arrival_time is not null
        and b.id is distinct from p_exclude
        and (extract(epoch from b.arrival_time) / 60)::int < p_minute + p_duration
        and p_minute < (extract(epoch from b.arrival_time) / 60)::int + b.duration_minutes
    )
  order by
    (select max(b.service_date) from public.bookings b
     where p_client is not null and b.user_id = p_client and b.walker_id = k.profile_id
       and b.status in ('scheduled', 'completed')) desc nulls last,
    r.remaining desc,
    k.position,
    k.profile_id
  limit 1;
$$;

-- Walker for a full day or stay: not off that day, client's usual walker first, then least busy.
create or replace function private.pick_walker_range(p_start date, p_last date, p_client uuid, p_exclude uuid default null)
returns uuid
language sql
stable
set search_path = ''
as $$
  select k.profile_id
  from public.walkers k
  where k.active
    and not exists (
      select 1 from public.time_off t
      where t.walker_id = k.profile_id and t.window_id is null
        and t.start_date <= p_last and t.end_date >= p_start
    )
  order by
    (select max(b.service_date) from public.bookings b
     where p_client is not null and b.user_id = p_client and b.walker_id = k.profile_id
       and b.status in ('scheduled', 'completed')) desc nulls last,
    (select count(*) from public.bookings b
     where b.walker_id = k.profile_id and b.kind in ('day', 'stay') and b.status in ('requested', 'scheduled')
       and b.id is distinct from p_exclude and b.service_date <= p_last and b.end_date >= p_start),
    k.position,
    k.profile_id
  limit 1;
$$;

-- Why a client can't book an appointment at p_minute (or null).
create or replace function private.time_problem(
  p_date date,
  p_window public.booking_windows,
  p_minute int,
  p_duration int,
  p_exclude uuid default null
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  s public.booking_settings;
begin
  select * into s from public.booking_settings where id = 1;
  if p_window.id is null or not p_window.active then return 'closed'; end if;
  if private.local_ts(p_date, p_minute) < now() + make_interval(hours => s.min_notice_hours) then return 'too_soon'; end if;
  if p_date > private.local_today() + s.max_days_ahead then return 'too_far'; end if;
  if private.pick_walker_at(p_date, p_window.id, null, p_minute, p_duration, p_exclude) is null then
    return case when exists (
      select 1 from public.walkers k
      where k.active and private.walker_capacity(k.profile_id, p_date, p_window.id) > 0
    ) then 'full' else 'closed' end;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email (Resend via pg_net)
-- ---------------------------------------------------------------------------

create or replace function private.html(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function private.email_layout(
  p_heading text,
  p_intro text,
  p_body text,
  p_cta_label text default null,
  p_cta_url text default null,
  p_note text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    || '<body style="margin:0;padding:0;background:#FFF7EA;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#0F2B3F">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EA;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">'
    || '<tr><td style="padding:4px 8px 16px;font-size:18px;font-weight:800;color:#1A6FA0">&#128062; Waiting for Paws</td></tr>'
    || '<tr><td style="background:#FFFFFF;border-radius:24px;padding:28px 24px;border:1px solid #E6EEF3">'
    || '<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:#0F2B3F">' || private.html(p_heading) || '</h1>'
    || '<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#3D5566">' || private.html(p_intro) || '</p>'
    || coalesce(p_body, '')
    || case when coalesce(p_note, '') <> '' then
         '<p style="margin:16px 0 0;padding:12px 14px;background:#FFF3D1;border-radius:14px;font-size:14px;line-height:1.5;color:#0F2B3F;white-space:pre-line">'
         || private.html(p_note) || '</p>'
       else '' end
    || case when p_cta_url is not null then
         '<p style="margin:24px 0 4px"><a href="' || private.html(p_cta_url)
         || '" style="display:inline-block;background:#FFC845;color:#0F2B3F;font-weight:800;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:999px">'
         || private.html(p_cta_label) || '</a></p>'
       else '' end
    || '</td></tr>'
    || '<tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:#6B7F8E;text-align:center">'
    || 'Waiting for Paws &middot; Dog walking in Ocean Beach, San Diego<br>Questions? Just reply to this email.</td></tr>'
    || '</table></td></tr></table></body></html>';
$$;

-- "Tuesday, October 14" + "Midday · 11 AM – 2 PM" or "Around 12:15 PM"
create or replace function private.visit_when(p_booking_id uuid)
returns table (day_label text, short_day text, time_label text)
language sql
stable
set search_path = ''
as $$
  select
    case when b.kind = 'stay' and b.end_date > b.service_date
      then to_char(b.service_date::timestamp, 'Dy, Mon FMDD') || ' → ' || to_char(b.end_date::timestamp, 'Dy, Mon FMDD')
      else to_char(b.service_date::timestamp, 'FMDay, FMMonth FMDD') end,
    to_char(b.service_date::timestamp, 'Dy, Mon FMDD'),
    case
      when b.kind = 'stay' then
        (b.end_date - b.service_date) || ' night' || case when b.end_date - b.service_date = 1 then '' else 's' end
        || ' · check-in ' || private.minute_label(private.local_minute(b.start_time))
        || ', check-out ' || private.minute_label(private.local_minute(b.end_time))
      when b.kind = 'day' then
        'All day · ' || private.minute_label(private.local_minute(b.start_time))
        || ' – ' || private.minute_label(private.local_minute(b.end_time))
      when b.kind = 'time' and b.arrival_time is not null then
        'At ' || private.minute_label((extract(epoch from b.arrival_time) / 60)::int)
      when b.arrival_time is not null and w.id is not null then
        w.label || ' · around ' || private.minute_label((extract(epoch from b.arrival_time) / 60)::int)
      when b.arrival_time is not null then
        'Around ' || private.minute_label((extract(epoch from b.arrival_time) / 60)::int)
      when w.id is not null then
        w.label || ' · ' || private.minute_label(w.start_minute) || ' – ' || private.minute_label(w.end_minute)
      else private.minute_label(private.local_minute(b.start_time))
    end
  from public.bookings b
  left join public.booking_windows w on w.id = b.window_id
  where b.id = p_booking_id;
$$;

-- Per-booking intake answers as "Question: answer" lines, labelled from the intake form.
create or replace function private.answers_text(p_answers jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(
    coalesce(f.label, a.key) || ': ' ||
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
    where fm.slug = 'intake' and e ->> 'id' = a.key
    limit 1
  ) f on true
  where coalesce(a.value #>> '{}', '') <> '' and a.value <> '[]'::jsonb;
$$;

create or replace function private.pet_names(p_booking_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(p.name, ' & ' order by p.name)
  from public.booking_pets bp
  join public.pets p on p.id = bp.pet_id
  where bp.booking_id = p_booking_id;
$$;

-- Visit cards for an email. p_for = 'client' shows the walker; 'admin' shows the client and address.
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
           private.answers_text(b.answers) as answers
    from public.bookings b
    cross join lateral private.visit_when(b.id) vw
    left join public.walkers k on k.profile_id = b.walker_id
    left join public.profiles p on p.id = b.user_id
    where b.id = any (p_ids)
    order by b.service_date, coalesce(b.arrival_time, (b.start_time at time zone private.booking_tz())::time), b.start_time
    limit p_limit
  loop
    v_line2 := concat_ws(' · ', r.title, r.pets);
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

-- Queues emails (a JSON array of Resend email objects). Never raises: a mail hiccup must not
-- undo a booking. HTTP requests only go out after the transaction commits.
create or replace function private.send_emails(p_emails jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_batch jsonb;
  i int := 0;
begin
  if p_emails is null or jsonb_typeof(p_emails) <> 'array' or jsonb_array_length(p_emails) = 0 then
    return;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if coalesce(v_key, '') = '' then
    raise log 'resend_api_key is not set; skipped % email(s)', jsonb_array_length(p_emails);
    return;
  end if;

  while i < jsonb_array_length(p_emails) loop
    select jsonb_agg(e) into v_batch
    from (select e from jsonb_array_elements(p_emails) with ordinality as t(e, n)
          where n > i and n <= i + 100) x;
    perform net.http_post(
      url := 'https://api.resend.com/emails/batch',
      body := v_batch,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
    i := i + 100;
  end loop;
exception when others then
  raise warning 'Could not queue booking emails: %', sqlerrm;
end;
$$;

create or replace function private.email(p_to text[], p_subject text, p_html text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'from', s.from_address,
    'to', to_jsonb(p_to),
    'reply_to', s.reply_to,
    'subject', left(p_subject, 200),
    'html', p_html
  )
  from public.booking_settings s
  where s.id = 1;
$$;

-- Sends the emails for a booking event.
--   p_event: booked | confirmed | declined | canceled | moved
--   p_by_admin: an admin made the change (clients get emails; admins don't get alerts)
create or replace function private.notify(
  p_event text,
  p_ids uuid[],
  p_by_admin boolean,
  p_notify_client boolean default true,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  c record;
  v_first record;
  v_emails jsonb := '[]'::jsonb;
  v_admins text[];
  v_n int;
  v_subject text;
  v_heading text;
  v_intro text;
  v_what text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  select * into s from public.booking_settings where id = 1;

  -- One email per client.
  if p_notify_client then
    for c in
      select coalesce(p.email, b.invitee_email) as email,
             coalesce(nullif(split_part(trim(coalesce(p.full_name, b.invitee_name, '')), ' ', 1), ''), 'there') as first_name,
             array_agg(b.id order by b.service_date, b.start_time) as ids,
             bool_or(b.status = 'requested') as any_requested
      from public.bookings b
      left join public.profiles p on p.id = b.user_id
      where b.id = any (p_ids)
      group by 1, 2
    loop
      continue when c.email is null or c.email !~ '@';
      v_n := cardinality(c.ids);
      select b.title, b.kind, private.pet_names(b.id) as pets, vw.short_day
      into v_first
      from public.bookings b cross join lateral private.visit_when(b.id) vw
      where b.id = c.ids[1];
      v_what := case
        when v_n = 1 and v_first.kind = 'stay' then v_first.title || ' from ' || v_first.short_day
        when v_n = 1 then v_first.title || ' on ' || v_first.short_day
        else v_n || ' visits starting ' || v_first.short_day end;

      case p_event
        when 'booked' then
          if c.any_requested then
            v_subject := 'Request received: ' || v_what;
            v_heading := 'Request received';
            v_intro := 'Thanks, ' || c.first_name || '! We got your request and will confirm it shortly.';
          else
            v_subject := 'You’re booked! ' || v_what;
            v_heading := 'You’re booked! 🐾';
            v_intro := case when p_by_admin
              then 'Hi ' || c.first_name || '! We added this to your calendar.'
              else 'Thanks, ' || c.first_name || '! Here’s what’s on the calendar.' end
              || case when s.client_reminders then ' We’ll send a reminder the evening before.' else '' end;
          end if;
        when 'confirmed' then
          v_subject := 'Confirmed: ' || v_what;
          v_heading := 'You’re confirmed ✅';
          v_intro := 'Good news, ' || c.first_name || '! See you then.';
        when 'declined' then
          v_subject := 'About your request for ' || v_first.short_day;
          v_heading := 'We can’t make this one work';
          v_intro := 'Sorry, ' || c.first_name || ' — we’re not able to take this visit. Reply to this email and we’ll find another time.';
        when 'canceled' then
          v_subject := 'Canceled: ' || v_what;
          v_heading := 'Visit canceled';
          v_intro := case when p_by_admin
            then 'Hi ' || c.first_name || ', we had to cancel ' || case when v_n = 1 then 'this visit.' else 'these visits.' end
            else 'You’re all set, ' || c.first_name || ' — ' || case when v_n = 1 then 'this visit is' else 'these visits are' end || ' canceled.' end;
        when 'moved' then
          v_subject := 'Updated: ' || v_what;
          v_heading := 'New time ✨';
          v_intro := case when p_by_admin
            then 'Hi ' || c.first_name || ', we updated the time for this visit.'
            else 'You’re all set, ' || c.first_name || ' — here’s the new time.' end;
        else
          continue;
      end case;

      v_emails := v_emails || private.email(
        array[c.email],
        v_subject,
        private.email_layout(
          v_heading,
          v_intro,
          private.visit_cards(c.ids, 'client'),
          'View my visits',
          s.site_url || '/portal/visits',
          case when p_event in ('declined', 'canceled') and p_by_admin then v_reason end
        )
      );
    end loop;
  end if;

  -- Heads-up to the team when a client books, cancels or moves something.
  if not p_by_admin and s.admin_alerts and p_event in ('booked', 'canceled', 'moved') then
    select array_agg(distinct email) into v_admins
    from public.profiles where role = 'admin' and email is not null;

    if cardinality(v_admins) > 0 then
      v_n := cardinality(p_ids);
      select b.id, b.title, b.status, b.service_date, private.pet_names(b.id) as pets, vw.short_day,
             coalesce(p.full_name, p.email, b.invitee_name, 'A client') as client_name
      into v_first
      from public.bookings b
      cross join lateral private.visit_when(b.id) vw
      left join public.profiles p on p.id = b.user_id
      where b.id = any (p_ids)
      order by b.service_date, b.start_time
      limit 1;

      v_what := coalesce(v_first.pets, v_first.title) || ' · '
        || case when v_n = 1 then v_first.short_day else v_n || ' visits from ' || v_first.short_day end;

      case p_event
        when 'booked' then
          if v_first.status = 'requested' then
            v_subject := 'New request: ' || v_first.title || ' · ' || v_first.client_name || ' · ' || v_first.short_day;
            v_heading := 'New request';
            v_intro := v_first.client_name || ' requested a ' || v_first.title || '. Confirm or decline it from the calendar.';
          else
            v_subject := 'New booking: ' || v_what;
            v_heading := 'New booking';
            v_intro := v_first.client_name || ' just booked through the portal.';
          end if;
        when 'canceled' then
          v_subject := 'Canceled by ' || v_first.client_name || ': ' || v_what;
          v_heading := 'Visit canceled';
          v_intro := v_first.client_name || ' canceled ' || case when v_n = 1 then 'this visit.' else 'these visits.' end;
        when 'moved' then
          v_subject := 'Rescheduled: ' || v_what;
          v_heading := 'Visit rescheduled';
          v_intro := v_first.client_name || ' moved this visit to a new time.';
      end case;

      v_emails := v_emails || private.email(
        v_admins,
        v_subject,
        private.email_layout(
          v_heading,
          v_intro,
          private.visit_cards(p_ids, 'admin'),
          case when v_first.status = 'requested' then 'Review request' else 'Open calendar' end,
          s.site_url || '/admin/calendar?date=' || v_first.service_date || '&b=' || v_first.id,
          case when p_event = 'canceled' then v_reason end
        )
      );
    end if;
  end if;

  perform private.send_emails(v_emails);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking API (called from the app with the signed-in user's session)
-- ---------------------------------------------------------------------------

-- Open spots per day and window. Rows are only returned for times that can still be booked.
create or replace function public.booking_availability(p_from date, p_to date)
returns table (service_date date, window_id uuid, capacity int, remaining int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_admin boolean := private.is_admin();
  v_from date;
  v_to date;
begin
  if (select auth.uid()) is null then raise exception 'Please log in to book.'; end if;
  select * into s from public.booking_settings where id = 1;
  if not s.booking_enabled and not v_admin then return; end if;

  -- Admins see every open spot; clients only what they can still book.
  v_from := case when v_admin then p_from else greatest(p_from, private.local_today()) end;
  v_to := least(p_to, v_from + 120, case when v_admin then p_to else private.local_today() + s.max_days_ahead end);
  if v_from is null or v_to is null or v_to < v_from then return; end if;

  return query
    select d.day, w.id,
           sum(c.capacity)::int,
           sum(greatest(c.capacity - c.booked, 0))::int
    from (select v_from + i as day from generate_series(0, v_to - v_from) as g(i)) d
    cross join public.booking_windows w
    cross join public.walkers k
    cross join lateral (
      select private.walker_capacity(k.profile_id, d.day, w.id) as capacity,
             private.walker_booked(k.profile_id, d.day, w.id) as booked
    ) c
    where w.active
      and k.active
      and (v_admin or private.local_ts(d.day, w.start_minute) >= now() + make_interval(hours => s.min_notice_hours))
    group by d.day, w.id
    having sum(c.capacity) > 0
    order by d.day, min(w.start_minute);
end;
$$;

-- Full-day and overnight services: open spots per day (nights for stays).
create or replace function public.service_availability(p_service_id uuid, p_from date, p_to date)
returns table (service_date date, capacity int, remaining int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  v_admin boolean := private.is_admin();
  v_service public.services;
  v_from date;
  v_to date;
begin
  if (select auth.uid()) is null then raise exception 'Please log in to book.'; end if;
  select * into s from public.booking_settings where id = 1;
  select * into v_service from public.services where id = p_service_id;
  if not found or v_service.kind not in ('day', 'stay') then return; end if;
  if not v_admin and (not s.booking_enabled or not v_service.active or not v_service.bookable) then return; end if;

  v_from := case when v_admin then p_from else greatest(p_from, private.local_today()) end;
  v_to := least(p_to, v_from + 180,
    case when v_admin then p_to else private.local_today() + s.max_days_ahead + v_service.max_nights end);
  if v_from is null or v_to is null or v_to < v_from then return; end if;

  return query
    select d.day,
           coalesce(v_service.daily_capacity, 99)::int,
           greatest(coalesce(v_service.daily_capacity, 99) - private.service_booked(v_service.id, d.day), 0)::int
    from (select v_from + i as day from generate_series(0, v_to - v_from) as g(i)) d
    where not private.day_closed(d.day)
      and (v_admin or private.local_ts(d.day, private.service_start_minute(v_service))
                      >= now() + make_interval(hours => s.min_notice_hours))
    order by d.day;
end;
$$;

-- Set-time services: the start times still open on a day.
create or replace function public.time_slots(p_service_id uuid, p_date date)
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
  v_duration := coalesce(v_service.duration_minutes, 30);

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

-- Books one or more visits (several dates = a weekly series).
-- Clients book for themselves; admins can book for anyone (or a guest), pick the walker, pin an
-- exact arrival time and go over capacity with p_force.
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
  p_answers jsonb default null
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
  v_duration := coalesce(v_service.duration_minutes, 30);
  if not v_admin and p_arrival_minute is not null and v_kind <> 'time' then
    raise exception 'Only the Waiting for Paws team can do that.';
  end if;

  -- When
  if p_arrival_minute is not null and (p_arrival_minute < 0 or p_arrival_minute > 1439) then
    raise exception 'Pick a valid time.';
  end if;
  if v_kind in ('window', 'time') then
    if v_kind = 'time' and p_arrival_minute is null then raise exception 'Pick a time.'; end if;
    if p_window_id is null and p_arrival_minute is not null then
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
      invitee_name, invitee_email, created_by
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
      v_uid
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

-- Cancels a visit (p_scope = 'following' also cancels the rest of its weekly series).
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_scope text default 'one',
  p_reason text default null,
  p_notify boolean default true
)
returns int
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
  v_ids uuid[];
begin
  if v_uid is null then raise exception 'Please log in.'; end if;
  select * into s from public.booking_settings where id = 1;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or (not v_admin and b.user_id is distinct from v_uid) then raise exception 'Visit not found.'; end if;
  if b.status not in ('requested', 'scheduled') then raise exception 'This visit is already %.', b.status; end if;
  if not v_admin and b.start_time < now() + make_interval(hours => s.cancel_cutoff_hours) then
    raise exception 'This visit is less than % hours away — please message us to cancel.', s.cancel_cutoff_hours;
  end if;

  v_ids := array(
    select x.id from public.bookings x
    where x.status in ('requested', 'scheduled')
      and (v_admin or x.user_id = v_uid)
      and (x.id = b.id or (p_scope = 'following' and b.series_id is not null
                           and x.series_id = b.series_id and x.service_date >= b.service_date))
  );

  update public.bookings
  set status = 'canceled',
      canceled_at = now(),
      canceled_by = v_uid,
      cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
  where id = any (v_ids);

  perform private.notify('canceled', v_ids, v_admin, (not v_admin) or p_notify, p_reason);
  return cardinality(v_ids);
end;
$$;

-- Admins: confirm (scheduled), complete or decline visits.
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status text,
  p_scope text default 'one',
  p_notify boolean default true,
  p_reason text default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  b public.bookings;
  v_from text[];
  v_ids uuid[];
  v_announce uuid[];
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  v_from := case p_status
    when 'scheduled' then array['requested', 'completed', 'canceled', 'declined']
    when 'completed' then array['scheduled', 'requested']
    when 'declined' then array['requested']
  end;
  if v_from is null then raise exception 'Unknown status.'; end if;

  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Visit not found.'; end if;

  v_ids := array(
    select x.id from public.bookings x
    where x.status = any (v_from)
      and (x.id = b.id or (p_scope = 'following' and b.series_id is not null
                           and x.series_id = b.series_id and x.service_date >= b.service_date))
  );
  if cardinality(v_ids) = 0 then return 0; end if;

  -- Clients hear about confirmations, restored visits and declines.
  v_announce := array(
    select x.id from public.bookings x
    where x.id = any (v_ids)
      and ((p_status = 'scheduled' and x.status in ('requested', 'canceled', 'declined')) or p_status = 'declined')
  );

  update public.bookings
  set status = p_status,
      canceled_at = case when p_status = 'declined' then now() end,
      canceled_by = case when p_status = 'declined' then v_uid end,
      cancel_reason = case when p_status = 'declined' then nullif(left(trim(coalesce(p_reason, '')), 500), '') end
  where id = any (v_ids);

  if p_notify and cardinality(v_announce) > 0 then
    perform private.notify(case when p_status = 'declined' then 'declined' else 'confirmed' end,
                           v_announce, true, true, p_reason);
  end if;
  return cardinality(v_ids);
end;
$$;

-- Moves a visit. Clients pick a new date and window (capacity rules apply). Admins can also pin an
-- exact arrival time (p_arrival_minute, picks the matching window), clear it again
-- (p_clear_arrival) and reassign the walker.
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

  if not v_admin then
    if b.status not in ('requested', 'scheduled') then raise exception 'This visit can’t be changed anymore.'; end if;
    if p_walker_id is not null or (p_arrival_minute is not null and b.kind <> 'time') then
      raise exception 'Only the Waiting for Paws team can do that.';
    end if;
    if b.start_time < now() + make_interval(hours => s.cancel_cutoff_hours) then
      raise exception 'This visit is less than % hours away — please message us to change it.', s.cancel_cutoff_hours;
    end if;
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
    v_walker := coalesce(p_walker_id,
      case when b.walker_id is not null and not exists (
          select 1 from public.time_off t
          where t.walker_id = b.walker_id and t.window_id is null and t.start_date <= v_last and t.end_date >= p_date
        ) then b.walker_id end,
      case when v_admin then b.walker_id end,
      private.pick_walker_range(p_date, v_last, b.user_id, b.id));
  elsif not v_admin then
    v_last := p_date;
    if b.kind = 'time' then
      if p_arrival_minute is null then raise exception 'Pick a time.'; end if;
      select * into v_window from public.booking_windows where id = private.window_containing(p_arrival_minute);
      v_problem := private.time_problem(p_date, v_window, p_arrival_minute, b.duration_minutes, b.id);
    else
      select * into v_window from public.booking_windows where id = p_window_id;
      if not found then raise exception 'Pick a time of day.'; end if;
      v_problem := private.slot_problem(p_date, v_window, b.id);
    end if;
    if v_problem is not null then
      raise exception '%', case v_problem
        when 'too_soon' then 'That time is too soon to book online.'
        when 'too_far' then 'That’s further out than we book.'
        when 'closed' then 'We’re not taking visits at that time.'
        else 'Sorry — that time is full. Please pick another.' end;
    end if;
    if exists (
      select 1 from public.bookings x
      join public.booking_pets bp on bp.booking_id = x.id
      where bp.pet_id in (select pet_id from public.booking_pets where booking_id = b.id)
        and x.id <> b.id and x.service_date = p_date and x.window_id = v_window.id and x.kind = b.kind
        and x.status in ('requested', 'scheduled')
    ) then
      raise exception 'Your pup already has a visit at that time.';
    end if;
    if b.kind = 'time' then
      v_walker := private.pick_walker_at(p_date, v_window.id, b.user_id, p_arrival_minute, b.duration_minutes, b.id);
      v_arrival := time '00:00' + make_interval(mins => p_arrival_minute);
    else
      v_walker := case
        when b.walker_id is not null
             and private.walker_capacity(b.walker_id, p_date, v_window.id)
                 - private.walker_booked(b.walker_id, p_date, v_window.id, b.id) > 0
          then b.walker_id
        else private.pick_walker(p_date, v_window.id, b.user_id, b.id)
      end;
      v_arrival := null;
    end if;
    if v_walker is null then raise exception 'Sorry — that time is full. Please pick another.'; end if;
    v_window_id := v_window.id;
  else
    v_last := p_date;
    if p_arrival_minute is not null and (p_arrival_minute < 0 or p_arrival_minute > 1439) then
      raise exception 'Pick a valid time.';
    end if;
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
  end if;

  if b.kind in ('window', 'time') then
    if b.kind = 'window' and v_window.id is not null then
      v_start := private.local_ts(p_date, v_window.start_minute);
      v_end := private.local_ts(p_date, v_window.end_minute);
    else
      v_start := private.local_ts(p_date, coalesce((extract(epoch from v_arrival) / 60)::int, v_window.start_minute));
      v_end := v_start + make_interval(mins => b.duration_minutes);
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
      start_time = v_start,
      end_time = v_end,
      walker_id = v_walker,
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

-- Admins: private calendar subscription link (Google / Apple Calendar).
create or replace function public.reset_calendar_feed()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  insert into public.calendar_feeds (profile_id, token) values ((select auth.uid()), v_token)
  on conflict (profile_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;

-- Everything a calendar app needs, looked up by the secret feed token. No session needed.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select f.profile_id into v_profile
  from public.calendar_feeds f
  join public.profiles p on p.id = f.profile_id
  where f.token = p_token and p.role = 'admin';
  if v_profile is null then return null; end if;

  return jsonb_build_object(
    'walker_id', v_profile,
    'timezone', private.booking_tz(),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'status', b.status,
        'title', b.title,
        'kind', b.kind,
        'service_date', b.service_date,
        'end_date', b.end_date,
        'start_time', b.start_time,
        'end_time', b.end_time,
        -- Pinned visits use the exact arrival; window visits span the window.
        'visit_start', case when b.arrival_time is not null
          then private.local_ts(b.service_date, (extract(epoch from b.arrival_time) / 60)::int)
          else b.start_time end,
        'visit_end', case when b.arrival_time is not null
          then private.local_ts(b.service_date, (extract(epoch from b.arrival_time) / 60)::int) + make_interval(mins => b.duration_minutes)
          else coalesce(b.end_time, b.start_time + make_interval(mins => b.duration_minutes)) end,
        'arrival_time', b.arrival_time,
        'duration_minutes', b.duration_minutes,
        'window_label', w.label,
        'window_start', w.start_minute,
        'window_end', w.end_minute,
        'walker_id', b.walker_id,
        'walker_name', k.display_name,
        'client_name', coalesce(p.full_name, b.invitee_name),
        'client_phone', p.phone,
        'address', p.address,
        'pets', private.pet_names(b.id),
        'notes', b.notes,
        'client_note', b.client_note,
        'updated_at', b.updated_at
      ) order by b.start_time)
      from public.bookings b
      left join public.booking_windows w on w.id = b.window_id
      left join public.walkers k on k.profile_id = b.walker_id
      left join public.profiles p on p.id = b.user_id
      where b.status in ('requested', 'scheduled', 'completed')
        and b.start_time >= now() - interval '60 days'
        and b.start_time < now() + interval '365 days'
    ), '[]'::jsonb)
  );
end;
$$;

-- Admins: is email set up, and a test message to yourself.
create or replace function public.email_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then return null; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'resend_api_key' and coalesce(decrypted_secret, '') <> '');
end;
$$;

create or replace function public.send_test_email()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
  s public.booking_settings;
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  select email into v_email from public.profiles where id = (select auth.uid());
  select * into s from public.booking_settings where id = 1;
  perform private.send_emails(jsonb_build_array(private.email(
    array[v_email],
    'Test email from your booking system 🐾',
    private.email_layout(
      'It works! 🐾',
      'This is a test from the Waiting for Paws booking system. Booking confirmations, reminders and alerts will look like this.',
      '',
      'Open calendar',
      s.site_url || '/admin/calendar'
    )
  )));
  return v_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hourly jobs: reminders, walker digest, tidy up past visits
-- ---------------------------------------------------------------------------

create or replace function private.send_client_reminders(p_date date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  c record;
  v_emails jsonb := '[]'::jsonb;
  v_first record;
  v_sent int := 0;
begin
  select * into s from public.booking_settings where id = 1;
  for c in
    select coalesce(p.email, b.invitee_email) as email,
           coalesce(nullif(split_part(trim(coalesce(p.full_name, b.invitee_name, '')), ' ', 1), ''), 'there') as first_name,
           array_agg(b.id order by b.start_time) as ids
    from public.bookings b
    left join public.profiles p on p.id = b.user_id
    where b.service_date = p_date and b.status = 'scheduled' and b.reminder_sent_at is null
    group by 1, 2
  loop
    continue when c.email is null or c.email !~ '@';
    select private.pet_names(b.id) as pets, b.title, vw.time_label into v_first
    from public.bookings b cross join lateral private.visit_when(b.id) vw where b.id = c.ids[1];

    v_emails := v_emails || private.email(
      array[c.email],
      case when cardinality(c.ids) = 1
        then 'Tomorrow: ' || coalesce(v_first.pets || '’s ', '') || lower(v_first.title) || ' · ' || v_first.time_label
        else 'Tomorrow: ' || cardinality(c.ids) || ' visits' end,
      private.email_layout(
        'See you tomorrow! 🐾',
        'Hi ' || c.first_name || ', just a reminder about tomorrow. Please make sure we can get in and the leash is easy to find.',
        private.visit_cards(c.ids, 'client'),
        'View my visits',
        s.site_url || '/portal/visits'
      )
    );
    update public.bookings set reminder_sent_at = now() where id = any (c.ids);
    v_sent := v_sent + 1;
  end loop;
  perform private.send_emails(v_emails);
  return v_sent;
end;
$$;

create or replace function private.send_walker_digests(p_date date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  k record;
  v_emails jsonb := '[]'::jsonb;
  v_sent int := 0;
begin
  select * into s from public.booking_settings where id = 1;
  for k in
    select w.profile_id, w.display_name, p.email,
           array_agg(b.id order by coalesce(b.arrival_time, (b.start_time at time zone private.booking_tz())::time)) as ids
    from public.walkers w
    join public.profiles p on p.id = w.profile_id
    join public.bookings b on b.walker_id = w.profile_id
    where b.service_date = p_date and b.status in ('scheduled', 'requested') and p.email is not null
      and not exists (select 1 from private.digest_log d where d.walker_id = w.profile_id and d.service_date = p_date)
    group by w.profile_id, w.display_name, p.email
  loop
    v_emails := v_emails || private.email(
      array[k.email],
      'Tomorrow: ' || cardinality(k.ids) || ' visit' || case when cardinality(k.ids) = 1 then '' else 's' end
        || ' · ' || to_char(p_date::timestamp, 'Dy, Mon FMDD'),
      private.email_layout(
        'Tomorrow’s schedule',
        'Hi ' || k.display_name || '! Here’s your day for ' || to_char(p_date::timestamp, 'FMDay, FMMonth FMDD') || '.',
        private.visit_cards(k.ids, 'admin', 30),
        'Open calendar',
        s.site_url || '/admin/calendar?view=day&date=' || p_date
      )
    );
    insert into private.digest_log (walker_id, service_date) values (k.profile_id, p_date) on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;
  perform private.send_emails(v_emails);
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
begin
  select * into s from public.booking_settings where id = 1;
  v_local := now() at time zone s.timezone;

  -- Visits are marked done a few hours after their window ends (admins can undo it).
  update public.bookings set status = 'completed'
  where status = 'scheduled' and coalesce(end_time, start_time) < now() - interval '3 hours';

  -- Requests nobody confirmed in time quietly expire.
  update public.bookings
  set status = 'declined', cancel_reason = 'Request expired', canceled_at = now()
  where status = 'requested' and start_time < now();

  if extract(hour from v_local) = s.reminder_hour then
    if s.client_reminders then perform private.send_client_reminders(v_local::date + 1); end if;
    if s.walker_digest then perform private.send_walker_digests(v_local::date + 1); end if;
  end if;

  delete from private.digest_log where service_date < v_local::date - 30;
end;
$$;

select cron.schedule('wfp-booking-hourly', '7 * * * *', 'select private.run_hourly_jobs()');

-- ---------------------------------------------------------------------------
-- Seed: three windows, a walker per admin, weekdays open
-- ---------------------------------------------------------------------------

insert into public.booking_windows (label, start_minute, end_minute, position) values
  ('Morning', 480, 660, 0),
  ('Midday', 660, 840, 1),
  ('Afternoon', 840, 1020, 2);

insert into public.walkers (profile_id, display_name, color, position)
select p.id,
       coalesce(nullif(split_part(trim(coalesce(p.full_name, '')), ' ', 1), ''), initcap(split_part(p.email, '@', 1))),
       (array['#1A6FA0', '#F2711C', '#0E9F6E', '#7C3AED', '#DB2777', '#0891B2', '#CA8A04'])
         [1 + ((row_number() over (order by p.created_at) - 1) % 7)::int],
       (row_number() over (order by p.created_at) - 1)::int
from public.profiles p
where p.role = 'admin'
on conflict (profile_id) do nothing;

insert into public.walker_availability (walker_id, weekday, window_id, capacity)
select k.profile_id, d, w.id, 3
from public.walkers k
cross join generate_series(1, 5) as d
cross join public.booking_windows w
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Grants and row level security
-- ---------------------------------------------------------------------------

grant select on public.booking_windows to anon;
grant select, insert, update, delete on public.booking_settings, public.booking_windows, public.walkers,
  public.walker_availability, public.time_off, public.calendar_feeds, public.booking_pets to authenticated;
grant all on public.booking_settings, public.booking_windows, public.walkers, public.walker_availability,
  public.time_off, public.calendar_feeds, public.booking_pets to service_role;

alter table public.booking_settings enable row level security;
alter table public.booking_windows enable row level security;
alter table public.walkers enable row level security;
alter table public.walker_availability enable row level security;
alter table public.time_off enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.booking_pets enable row level security;
alter table private.digest_log enable row level security;

create policy "booking_settings: signed-in read" on public.booking_settings
  for select to authenticated using (true);
create policy "booking_settings: admins manage" on public.booking_settings
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "booking_windows: public read" on public.booking_windows
  for select to anon, authenticated using (true);
create policy "booking_windows: admins manage" on public.booking_windows
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "walkers: signed-in read" on public.walkers
  for select to authenticated using (true);
create policy "walkers: admins manage" on public.walkers
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "walker_availability: admins manage" on public.walker_availability
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "time_off: admins manage" on public.time_off
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "calendar_feeds: admins manage own" on public.calendar_feeds
  for all to authenticated
  using (profile_id = (select auth.uid()) and private.is_admin())
  with check (profile_id = (select auth.uid()) and private.is_admin());

create policy "booking_pets: read own" on public.booking_pets
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid())));
create policy "booking_pets: admins manage" on public.booking_pets
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Helpers are internal; only the booking API above (and RLS's is_admin) are callable.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname <> 'is_admin'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;

  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('booking_availability', 'book_visits', 'cancel_booking', 'set_booking_status',
                        'move_booking', 'reset_calendar_feed', 'calendar_feed', 'email_status', 'send_test_email',
                        'service_availability', 'time_slots')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
    if f.proname = 'calendar_feed' then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end;
$$;

-- Live calendar updates for admins (row level security still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;
