-- Waiting for Paws — Instagram feed
--
-- The "Instagram feed" section on the website shows the latest posts from the business account,
-- read with Instagram's official API (Instagram API with Instagram Login). An admin connects the
-- account once from Admin → Integrations. Its long-lived access token is kept in Supabase Vault as
-- `instagram_access_token`, and the website's server renews it every few days so it never reaches
-- its 60-day expiry.
--
-- Admins can connect, disconnect and see who's connected, but never read the token back; only the
-- server (service role) can. Posts themselves aren't stored: Instagram's image links expire after a
-- few days, so the site fetches them fresh and caches them for about an hour.

create table private.instagram_account (
  id int primary key default 1 check (id = 1),
  ig_user_id text not null check (ig_user_id ~ '^[0-9]{1,30}$'),
  username text not null check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  expires_at timestamptz,
  refreshed_at timestamptz not null default now(),
  connected_at timestamptz not null default now(),
  connected_by uuid references public.profiles (id) on delete set null
);

comment on column private.instagram_account.expires_at is
  'When the current token stops working. Null for a pasted token until its first renewal.';

alter table private.instagram_account enable row level security;
revoke all on private.instagram_account from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admins: status, connect, disconnect
-- ---------------------------------------------------------------------------

create or replace function public.instagram_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a private.instagram_account;
begin
  if not private.is_admin() then return null; end if;
  select * into a from private.instagram_account where id = 1;
  if not found then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object(
    'connected', true,
    'username', a.username,
    'expires_at', a.expires_at,
    'refreshed_at', a.refreshed_at,
    'connected_at', a.connected_at
  );
end;
$$;

-- p_expires_at is null when an admin pasted a token (Instagram doesn't say); the first renewal fills it in.
create or replace function public.connect_instagram(
  p_token text,
  p_user_id text,
  p_username text,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  if coalesce(p_token, '') !~ '^\S+$' or char_length(p_token) not between 20 and 2048 then
    raise exception 'That doesn’t look like an Instagram access token.';
  end if;

  select id into v_secret from vault.secrets where name = 'instagram_access_token';
  if v_secret is null then
    perform vault.create_secret(p_token, 'instagram_access_token', 'Instagram feed on the website (renewed automatically)');
  else
    perform vault.update_secret(v_secret, p_token);
  end if;

  insert into private.instagram_account (id, ig_user_id, username, expires_at, refreshed_at, connected_at, connected_by)
  values (1, p_user_id, p_username, p_expires_at, now(), now(), (select auth.uid()))
  on conflict (id) do update set
    ig_user_id = excluded.ig_user_id,
    username = excluded.username,
    expires_at = excluded.expires_at,
    refreshed_at = excluded.refreshed_at,
    connected_at = excluded.connected_at,
    connected_by = excluded.connected_by;
end;
$$;

create or replace function public.disconnect_instagram()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  delete from vault.secrets where name = 'instagram_access_token';
  delete from private.instagram_account where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- The website's server (service role only): read and renew the token
-- ---------------------------------------------------------------------------

create or replace function public.instagram_credentials()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'token', s.decrypted_secret,
    'username', a.username,
    'expires_at', a.expires_at,
    'refreshed_at', a.refreshed_at
  )
  from private.instagram_account a
  join vault.decrypted_secrets s on s.name = 'instagram_access_token'
  where a.id = 1 and coalesce(s.decrypted_secret, '') <> '';
$$;

-- Only replaces the token that was renewed, so a renewal racing a reconnect can't bring back the
-- old account's token.
create or replace function public.instagram_token_renewed(p_old_token text, p_token text, p_expires_at timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if coalesce(p_token, '') !~ '^\S+$' or char_length(p_token) not between 20 and 2048 then return false; end if;
  select s.id into v_secret
  from vault.decrypted_secrets s
  where s.name = 'instagram_access_token' and s.decrypted_secret = p_old_token;
  if v_secret is null then return false; end if;

  if p_token <> p_old_token then perform vault.update_secret(v_secret, p_token); end if;
  update private.instagram_account set expires_at = p_expires_at, refreshed_at = now() where id = 1;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.instagram_status() from public, anon;
revoke execute on function public.connect_instagram(text, text, text, timestamptz) from public, anon;
revoke execute on function public.disconnect_instagram() from public, anon;
grant execute on function public.instagram_status() to authenticated, service_role;
grant execute on function public.connect_instagram(text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.disconnect_instagram() to authenticated, service_role;

revoke execute on function public.instagram_credentials() from public, anon, authenticated;
revoke execute on function public.instagram_token_renewed(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.instagram_credentials() to service_role;
grant execute on function public.instagram_token_renewed(text, text, timestamptz) to service_role;
