-- Email map links look up the spot's address when there is one (a nickname like "the usual bench" would
-- throw Google off), and the name otherwise.
create or replace function private.maps_url(p_place text, p_address text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'https://www.google.com/maps/search/?api=1&query='
    || private.url_encode(coalesce(nullif(btrim(p_address), ''), btrim(p_place)))
$$;
