-- Waiting for Paws — initial schema
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  access_notes text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_lower_idx on public.profiles (lower(email));

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their login email.
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_update();

-- Clients can edit their own profile but never their own role.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Private notes the admin keeps about a client (never visible to the client).
create table public.client_notes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create trigger client_notes_updated_at before update on public.client_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Website content (edited from the admin portal)
-- ---------------------------------------------------------------------------

-- Single row holding business info, theme colors, booking link, etc.
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  nav_label text,
  show_in_nav boolean not null default true,
  published boolean not null default true,
  position int not null default 0,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pages_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

-- Ordered blocks that make up each page (hero, services, FAQ, gallery, ...).
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null,
  position int not null default 0,
  visible boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sections_page_position_idx on public.sections (page_id, position);

create trigger sections_updated_at before update on public.sections
  for each row execute function public.set_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents int check (price_cents is null or price_cents >= 0),
  price_label text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  image_url text,
  booking_url text,
  active boolean not null default true,
  allow_online_payment boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  storage_path text,
  caption text,
  position int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- Intake (and future) forms built in the admin portal.
create table public.forms (
  slug text primary key,
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger forms_updated_at before update on public.forms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Client data
-- ---------------------------------------------------------------------------

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  breed text,
  sex text,
  birthday date,
  weight_lbs numeric(5, 1),
  spayed_neutered boolean,
  photo_url text,
  temperament text,
  walking_notes text,
  medical_notes text,
  medications text,
  feeding_notes text,
  vet_name text,
  vet_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pets_owner_idx on public.pets (owner_id);

create trigger pets_updated_at before update on public.pets
  for each row execute function public.set_updated_at();

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_slug text not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_slug, user_id)
);

create trigger form_submissions_updated_at before update on public.form_submissions
  for each row execute function public.set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  pet_id uuid references public.pets (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled')),
  source text not null default 'manual' check (source in ('manual', 'calendly')),
  external_id text unique,
  invitee_name text,
  invitee_email text,
  cancel_url text,
  reschedule_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_user_idx on public.bookings (user_id);
create index bookings_start_idx on public.bookings (start_time);

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  description text,
  amount_cents int not null,
  currency text not null default 'usd',
  quantity int not null default 1,
  status text not null,
  customer_email text,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text not null check (char_length(message) <= 5000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grants (RLS below decides which rows each role can touch)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on public.site_settings, public.pages, public.sections, public.services,
  public.gallery_photos, public.forms to anon;
grant insert on public.contact_messages to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.client_notes enable row level security;
alter table public.site_settings enable row level security;
alter table public.pages enable row level security;
alter table public.sections enable row level security;
alter table public.services enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.forms enable row level security;
alter table public.pets enable row level security;
alter table public.form_submissions enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.contact_messages enable row level security;

-- Profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()) and role = 'client');
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admins manage" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Client notes (admin only)
create policy "client_notes: admins manage" on public.client_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public website content
create policy "site_settings: public read" on public.site_settings
  for select to anon, authenticated using (true);
create policy "site_settings: admins manage" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pages: public read published" on public.pages
  for select to anon, authenticated using (published or public.is_admin());
create policy "pages: admins manage" on public.pages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "sections: public read visible" on public.sections
  for select to anon, authenticated using (visible or public.is_admin());
create policy "sections: admins manage" on public.sections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "services: public read active" on public.services
  for select to anon, authenticated using (active or public.is_admin());
create policy "services: admins manage" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "gallery: public read visible" on public.gallery_photos
  for select to anon, authenticated using (visible or public.is_admin());
create policy "gallery: admins manage" on public.gallery_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "forms: public read" on public.forms
  for select to anon, authenticated using (true);
create policy "forms: admins manage" on public.forms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pets
create policy "pets: owners manage" on public.pets
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "pets: admins manage" on public.pets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Form submissions: clients submit/edit their own, only admins change status
create policy "submissions: read own" on public.form_submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "submissions: insert own" on public.form_submissions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'submitted');
create policy "submissions: update own" on public.form_submissions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'submitted');
create policy "submissions: admins manage" on public.form_submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bookings and payments: clients read their own; webhooks write with the service role
create policy "bookings: read own" on public.bookings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bookings: admins manage" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "payments: read own" on public.payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "payments: admins manage" on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Contact form: anyone can send, only admins read
create policy "contact: anyone can send" on public.contact_messages
  for insert to anon, authenticated with check (handled = false);
create policy "contact: admins manage" on public.contact_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for site photos and pet photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;

create policy "media: admins manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- Clients may upload pet photos into media/pets/<their user id>/...
create policy "media: clients manage own pet photos" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pets'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pets'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
