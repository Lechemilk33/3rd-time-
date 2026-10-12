-- Tighten function security per Supabase's database linter.

-- Pin search_path on trigger helpers.
alter function public.set_updated_at() set search_path = '';
alter function public.protect_profile_role() set search_path = '';

-- Trigger functions should never be callable through the REST API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_update() from public, anon, authenticated;

-- Move is_admin() out of the exposed `public` schema. RLS policies reference
-- the function itself (not its name), so they keep working after the move.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;
alter function public.is_admin() set schema private;
grant execute on function private.is_admin() to anon, authenticated, service_role;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not private.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;
