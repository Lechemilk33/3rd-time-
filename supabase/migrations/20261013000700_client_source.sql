-- Where each client first found the site: a flyer or sticker QR code (?src=flyer), Google,
-- Instagram, Nextdoor… The browser remembers it from their first visit and the sign-up form sends
-- it along, so the admin can see which marketing actually brings in clients.

alter table public.profiles
  add column source text check (char_length(source) <= 40);

comment on column public.profiles.source is 'How the client first found the site (flyer, google, instagram…), from their first visit.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), 40), '');
begin
  insert into public.profiles (id, email, full_name, phone, terms_version, terms_accepted_at, source)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    v_terms,
    case when v_terms is not null then now() end,
    nullif(left(lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'source', ''), '[^a-zA-Z0-9. _-]', '', 'g')), 40), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
