-- Saved meeting places: the team names spots they use often ("OB Dog Park") with an address and picks
-- one for a meet & greet in a tap. A booking keeps its own copy of the name and address, so editing or
-- removing a place never changes a visit that's already set. Emails link the spot to Google Maps.

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint places_name_length check (char_length(btrim(name)) between 1 and 80),
  address text not null default '' constraint places_address_length check (char_length(address) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.places is 'Named spots the team meets clients at (meet & greets), with an address.';
alter table public.places enable row level security;
create policy "places: admins manage" on public.places for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();

alter table public.bookings add column if not exists meeting_address text
  constraint bookings_meeting_address_length check (meeting_address is null or char_length(meeting_address) <= 300);
alter table public.bookings add column if not exists meeting_place_id uuid references public.places (id) on delete set null;
comment on column public.bookings.meeting_address is 'Address of the meeting spot (copied from the saved place, if any).';
comment on column public.bookings.meeting_place_id is 'The saved place the meeting spot came from, if any.';

-- Percent-encodes text for a URL query value.
create or replace function private.url_encode(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
    case when ch ~ '^[A-Za-z0-9_.~-]$' then ch
      else upper(regexp_replace(encode(convert_to(ch, 'UTF8'), 'hex'), '(..)', '%\1', 'g')) end,
    '' order by i), '')
  from regexp_split_to_table(coalesce(p, ''), '') with ordinality as t(ch, i)
$$;

-- A Google Maps search link for a spot.
create or replace function private.maps_url(p_place text, p_address text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'https://www.google.com/maps/search/?api=1&query='
    || private.url_encode(concat_ws(', ', nullif(btrim(p_place), ''), nullif(btrim(p_address), '')))
$$;

-- Where to meet: a saved place (p_place_id) or a one-off name and address. Confirmed visits are emailed
-- the new spot; requests get it in their confirmation email.
create or replace function public.set_meeting_spot(
  p_booking_id uuid,
  p_name text,
  p_address text default null,
  p_place_id uuid default null,
  p_notify boolean default true
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(left(btrim(coalesce(p_name, '')), 300), '');
  v_address text := nullif(left(btrim(coalesce(p_address, '')), 300), '');
  v_place uuid := p_place_id;
  b public.bookings;
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  if v_place is not null then
    select p.name, nullif(p.address, '') into v_name, v_address from public.places p where p.id = v_place;
    if not found then raise exception 'That place was removed. Pick another one.'; end if;
  end if;
  if v_name is null then
    v_address := null;
    v_place := null;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Visit not found.'; end if;
  if v_name is not distinct from b.meeting_place and v_address is not distinct from b.meeting_address then
    if v_place is distinct from b.meeting_place_id then
      update public.bookings set meeting_place_id = v_place where id = p_booking_id;
    end if;
    return false;
  end if;

  update public.bookings
  set meeting_place = v_name, meeting_address = v_address, meeting_place_id = v_place
  where id = p_booking_id;
  if p_notify and v_name is not null and b.status = 'scheduled' then
    perform private.notify('place', array[p_booking_id], true);
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.set_meeting_spot(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.set_meeting_spot(uuid, text, text, uuid, boolean) to authenticated;

-- The older name-only version, kept for app builds still running while a deploy rolls out.
create or replace function public.set_meeting_place(p_booking_id uuid, p_place text, p_notify boolean default true)
returns boolean
language sql
volatile
set search_path = ''
as $$
  select public.set_meeting_spot(p_booking_id, p_place, null, null, p_notify)
$$;

CREATE OR REPLACE FUNCTION private.visit_cards(p_ids uuid[], p_for text, p_limit integer DEFAULT 10)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  r record;
  v_html text := '';
  v_total int := coalesce(cardinality(p_ids), 0);
  v_line2 text;
  v_line3 text;
  v_where text;
begin
  for r in
    select b.id, b.title, b.status, b.client_note, b.notes, b.invitee_name,
           k.display_name as walker_name, p.full_name as client_name, p.address, p.phone,
           private.pet_names(b.id) as pets, vw.day_label, vw.time_label,
           private.answers_text(b.answers) as answers,
           case when b.kind in ('window', 'time') and jsonb_array_length(coalesce(sv.duration_options, '[]'::jsonb)) > 1
             then private.length_label(b.duration_minutes) end as length,
           b.handoff, b.meeting_place, b.meeting_address, sv.audience
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
    v_where := case
      when r.meeting_place is not null then '📍 ' || case when p_for = 'admin' then 'Meet at ' else 'Meeting at ' end
        || concat_ws(', ', r.meeting_place, r.meeting_address)
      when r.audience = 'everyone' then '📍 ' || case when p_for = 'admin'
        then 'Meeting spot not picked yet'
        else 'We’ll meet at a public spot nearby and let you know where' end
    end;
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
      || case when v_where is not null then '<div style="margin-top:4px;font-size:14px;font-weight:700;color:#0F2B3F">' || private.html(v_where)
           || case when r.meeting_place is not null then ' &middot; <a href="' || private.html(private.maps_url(r.meeting_place, r.meeting_address))
                || '" style="color:#1A6FA0">Map</a>' else '' end
           || '</div>' else '' end
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
$function$;

CREATE OR REPLACE FUNCTION public.calendar_feed(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'address', coalesce(nullif(concat_ws(', ', b.meeting_place, b.meeting_address), ''), p.address),
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
$function$;
