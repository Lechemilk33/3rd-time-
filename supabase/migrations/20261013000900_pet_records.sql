-- Vaccine records.
--
-- Clients add a photo or PDF of their pup's shot records whenever it suits them (when they add the
-- pup, or later). The team looks them over, notes how long each vaccine is good for, and the client
-- gets one friendly reminder a few weeks before one runs out. Nothing here blocks signing up or
-- booking a meet & greet; approving a client stays the team's call.
--
-- Files live in a private bucket. Only the client who added them and the team can open them, and
-- links to them are short-lived.

-- ---------------------------------------------------------------------------
-- What the team found when they checked (clients can read it, only the team can set it)
-- ---------------------------------------------------------------------------

alter table public.pets
  add column rabies_until date,
  add column distemper_until date,
  add column bordetella_until date,
  add column records_checked_at timestamptz,
  add column records_note text check (char_length(records_note) <= 300),
  add column records_reminded_for date;

comment on column public.pets.rabies_until is 'Rabies vaccine good through (from the checked records). Required by California law.';
comment on column public.pets.distemper_until is 'Distemper & parvo (DHPP/DAPP) good through.';
comment on column public.pets.bordetella_until is 'Kennel cough (Bordetella) good through.';
comment on column public.pets.records_checked_at is 'When the team last checked this pup''s vaccine records.';
comment on column public.pets.records_note is 'Note from the team about the records, e.g. "Titer test instead of DHPP". The client sees it.';
comment on column public.pets.records_reminded_for is 'Latest expiry date covered by the last reminder email (so nobody is reminded twice about the same shot).';

create or replace function private.protect_pet_records()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_admin() then
    if tg_op = 'INSERT' then
      if num_nonnulls(new.rabies_until, new.distemper_until, new.bordetella_until, new.records_checked_at,
                      new.records_note, new.records_reminded_for) > 0 then
        raise exception 'Only the team can mark vaccine records as checked';
      end if;
    elsif (new.rabies_until, new.distemper_until, new.bordetella_until, new.records_checked_at, new.records_note,
           new.records_reminded_for)
          is distinct from
          (old.rabies_until, old.distemper_until, old.bordetella_until, old.records_checked_at, old.records_note,
           old.records_reminded_for) then
      raise exception 'Only the team can mark vaccine records as checked';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_pet_records() from public;

create trigger pets_protect_records before insert or update on public.pets
  for each row execute function private.protect_pet_records();

-- ---------------------------------------------------------------------------
-- The files
-- ---------------------------------------------------------------------------

create table public.pet_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- <owner id>/<random id>.<ext> in the pet-records bucket
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  file_name text not null default '' check (char_length(file_name) <= 200),
  content_type text not null default '' check (char_length(content_type) <= 100),
  size_bytes int not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = owner_id::text)
);

comment on table public.pet_records is 'Vaccine records and other vet paperwork clients add for their pups.';

create index pet_records_pet_idx on public.pet_records (pet_id, created_at);
create index pet_records_owner_idx on public.pet_records (owner_id);

alter table public.pet_records enable row level security;
revoke all on public.pet_records from anon;

create policy "pet_records: owners manage" on public.pet_records
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid()))
  );
create policy "pet_records: admins manage" on public.pet_records
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Private bucket: 15 MB per file, photos and PDFs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-records',
  'pet-records',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Clients keep their files under pet-records/<their user id>/...
create policy "pet-records: owners manage own files" on storage.objects
  for all to authenticated
  using (bucket_id = 'pet-records' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pet-records' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "pet-records: admins manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'pet-records' and private.is_admin())
  with check (bucket_id = 'pet-records' and private.is_admin());

-- ---------------------------------------------------------------------------
-- Reminders: one email a few weeks before a checked vaccine runs out
-- ---------------------------------------------------------------------------

create or replace function private.send_record_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.booking_settings;
  r record;
  v_today date;
  v_sent int := 0;
begin
  select * into s from public.booking_settings where id = 1;
  v_today := (now() at time zone s.timezone)::date;

  for r in
    select p.id, p.name, pr.email,
           coalesce(nullif(split_part(trim(coalesce(pr.full_name, '')), ' ', 1), ''), 'there') as first_name,
           due.first_date, due.last_date, due.names
    from public.pets p
    join public.profiles pr on pr.id = p.owner_id
    cross join lateral (
      select min(v.until) as first_date, max(v.until) as last_date,
             string_agg(v.label || ' (' || to_char(v.until, 'FMMon FMDD') || ')', ', ' order by v.until) as names
      from (values
        ('rabies', p.rabies_until),
        ('distemper & parvo', p.distemper_until),
        ('kennel cough', p.bordetella_until)
      ) v(label, until)
      where v.until between v_today and v_today + 30
    ) due
    where pr.role = 'client'
      and coalesce(pr.email, '') <> ''
      and due.first_date is not null
      -- Something's coming due that the last reminder didn't cover.
      and (p.records_reminded_for is null or due.last_date > p.records_reminded_for)
      -- Only clients we're still seeing.
      and exists (
        select 1 from public.bookings b
        where b.user_id = pr.id and b.status in ('requested', 'scheduled', 'completed')
          and coalesce(b.end_time, b.start_time) > now() - interval '120 days'
      )
    order by due.first_date
    limit 50
  loop
    perform private.send_emails(jsonb_build_array(private.email(
      array[r.email],
      r.name || '’s shots are due soon 💉',
      private.email_layout(
        'Time for a vet visit, ' || r.first_name || '?',
        'Our records show ' || r.name || '’s ' || r.names || ' coming due. Once your vet updates them, snap a photo of the new record and add it to '
          || r.name || '’s profile. It takes a few seconds.',
        '',
        'Add the new record',
        s.site_url || '/portal/pets/' || r.id || '#records',
        'Already done? Reply with a photo of the record and we’ll update it for you.'
      )
    )));
    update public.pets set records_reminded_for = r.last_date where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function private.send_record_reminders() from public, anon, authenticated;

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

  -- Review requests and vaccine reminders go out in the late morning, never overnight.
  if extract(hour from v_local) = 10 then
    perform private.send_review_requests();
    perform private.send_record_reminders();
  end if;
end;
$$;
