-- Terms of Service and Privacy Policy.
--
-- Clients agree to both by ticking a box when they sign up; existing clients are asked once in the
-- portal. Each profile records which version they agreed to and when, so a later update to the
-- terms can ask everyone again. The Terms page reads the live cancellation window, so it always
-- matches the rule set in Admin → Schedule.

alter table public.profiles
  add column terms_version text check (char_length(terms_version) <= 40),
  add column terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is 'Version of the Terms of Service and Privacy Policy the client agreed to.';
comment on column public.profiles.terms_accepted_at is 'When they agreed to it.';

-- New accounts: the sign-up form sends the version the client agreed to.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), 40), '');
begin
  insert into public.profiles (id, email, full_name, phone, terms_version, terms_accepted_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    v_terms,
    case when v_terms is not null then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A signed-in client agreeing to the current terms (accounts made before there were terms, or
-- after they change).
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Please log in.'; end if;
  if coalesce(p_version, '') !~ '^[0-9A-Za-z._-]{1,40}$' then raise exception 'Unknown terms version.'; end if;
  update public.profiles
  set terms_version = p_version, terms_accepted_at = now()
  where id = (select auth.uid());
end;
$$;

-- The booking rules quoted in the Terms of Service. Anyone can read them.
create or replace function public.booking_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cancel_cutoff_hours', s.cancel_cutoff_hours,
    'min_notice_hours', s.min_notice_hours
  )
  from public.booking_settings s
  where s.id = 1;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated, service_role;
revoke execute on function public.booking_policy() from public;
grant execute on function public.booking_policy() to anon, authenticated, service_role;
