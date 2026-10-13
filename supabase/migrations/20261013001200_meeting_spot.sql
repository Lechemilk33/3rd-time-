-- Meet & greets happen at a public spot the team picks (clients don't choose, though they can ask in
-- their note). The spot is saved on the booking, shown to the client in their visits, emails and
-- reminders, and emailed to them when it's set or changed on a confirmed visit. A request gets it in
-- its confirmation email instead.

alter table public.bookings add column if not exists meeting_place text
  constraint bookings_meeting_place_length check (meeting_place is null or char_length(meeting_place) <= 300);
comment on column public.bookings.meeting_place is
  'Where we meet the client (meet & greets happen at a public spot the team picks). Set with set_meeting_place.';

create or replace function public.set_meeting_place(p_booking_id uuid, p_place text, p_notify boolean default true)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_place text := nullif(left(btrim(coalesce(p_place, '')), 300), '');
  b public.bookings;
begin
  if not private.is_admin() then raise exception 'Only the Waiting for Paws team can do that.'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Visit not found.'; end if;
  if v_place is not distinct from b.meeting_place then return false; end if;

  update public.bookings set meeting_place = v_place where id = p_booking_id;
  -- Confirmed visits hear about a new spot right away. Requests get it in their confirmation email.
  if p_notify and v_place is not null and b.status = 'scheduled' then
    perform private.notify('place', array[p_booking_id], true);
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.set_meeting_place(uuid, text, boolean) from public, anon;
grant execute on function public.set_meeting_place(uuid, text, boolean) to authenticated;

CREATE OR REPLACE FUNCTION private.notify(p_event text, p_ids uuid[], p_by_admin boolean, p_notify_client boolean DEFAULT true, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_noun text;
  v_nouns text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  select * into s from public.booking_settings where id = 1;
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
      v_noun := case v_first.kind when 'stay' then 'stay' when 'day' then 'day' else 'visit' end;
      v_nouns := case v_first.kind when 'stay' then 'stays' when 'day' then 'days' else 'visits' end;
      v_what := case
        when v_n = 1 and v_first.kind = 'stay' then v_first.title || ' from ' || v_first.short_day
        when v_n = 1 then v_first.title || ' on ' || v_first.short_day
        else v_n || ' ' || v_nouns || ' starting ' || v_first.short_day end;
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
          v_intro := 'Sorry, ' || c.first_name || ' — we’re not able to take this ' || v_noun || '. Reply to this email and we’ll find another time.';
        when 'canceled' then
          v_subject := 'Canceled: ' || v_what;
          v_heading := initcap(v_noun) || ' canceled';
          v_intro := case when p_by_admin
            then 'Hi ' || c.first_name || ', we had to cancel ' || case when v_n = 1 then 'this ' || v_noun else 'these ' || v_nouns end || '.'
            else 'You’re all set, ' || c.first_name || ' — ' || case when v_n = 1 then 'this ' || v_noun || ' is' else 'these ' || v_nouns || ' are' end || ' canceled.' end;
        when 'place' then
          v_subject := 'Where we’ll meet: ' || v_what;
          v_heading := 'Where we’ll meet 📍';
          v_intro := 'Hi ' || c.first_name || '! Here’s where we’ll meet. Bring '
            || coalesce(v_first.pets, 'your pup') || ' on a leash, and we’ll see you there.';
        when 'moved' then
          v_subject := 'Updated: ' || v_what;
          v_heading := case when v_first.kind = 'stay' then 'New dates ✨' else 'New time ✨' end;
          v_intro := case when p_by_admin
            then 'Hi ' || c.first_name || ', we updated the ' || case when v_first.kind = 'stay' then 'dates' else 'time' end
                 || ' for this ' || v_noun || '.'
            else 'You’re all set, ' || c.first_name || ' — here’s the new '
                 || case when v_first.kind = 'stay' then 'plan.' else 'time.' end end
            || case when c.any_requested then ' We’ll confirm it shortly.' else '' end;
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
  if not p_by_admin and s.admin_alerts and p_event in ('booked', 'canceled', 'moved') then
    select array_agg(distinct email) into v_admins
    from public.profiles where role = 'admin' and email is not null;
    if cardinality(v_admins) > 0 then
      v_n := cardinality(p_ids);
      select b.id, b.title, b.kind, b.status, b.service_date, private.pet_names(b.id) as pets, vw.short_day,
             coalesce(p.full_name, p.email, b.invitee_name, 'A client') as client_name, sv.audience
      into v_first
      from public.bookings b
      cross join lateral private.visit_when(b.id) vw
      left join public.profiles p on p.id = b.user_id
      left join public.services sv on sv.id = b.service_id
      where b.id = any (p_ids)
      order by b.service_date, b.start_time
      limit 1;
      v_noun := case v_first.kind when 'stay' then 'stay' when 'day' then 'day' else 'visit' end;
      v_nouns := case v_first.kind when 'stay' then 'stays' when 'day' then 'days' else 'visits' end;
      v_what := coalesce(v_first.pets, v_first.title) || ' · '
        || case when v_n = 1 then v_first.short_day else v_n || ' ' || v_nouns || ' from ' || v_first.short_day end;
      case p_event
        when 'booked' then
          if v_first.status = 'requested' then
            v_subject := 'New request: ' || v_first.title || ' · ' || v_first.client_name || ' · ' || v_first.short_day;
            v_heading := 'New request';
            v_intro := v_first.client_name || ' requested a ' || v_first.title || '.'
              || case when v_first.audience = 'everyone'
                   then ' Pick a public spot to meet, then confirm it from the calendar.'
                   else ' Confirm or decline it from the calendar.' end;
          else
            v_subject := 'New booking: ' || v_what;
            v_heading := 'New booking';
            v_intro := v_first.client_name || ' just booked through the portal.';
          end if;
        when 'canceled' then
          v_subject := 'Canceled by ' || v_first.client_name || ': ' || v_what;
          v_heading := initcap(v_noun) || ' canceled';
          v_intro := v_first.client_name || ' canceled ' || case when v_n = 1 then 'this ' || v_noun else 'these ' || v_nouns end || '.';
        when 'moved' then
          v_subject := 'Rescheduled: ' || v_what;
          v_heading := initcap(v_noun) || ' rescheduled';
          v_intro := v_first.client_name || ' moved this ' || v_noun || ' to '
            || case when v_first.kind = 'stay' then 'new dates.' else 'a new time.' end
            || case when v_first.status = 'requested' then ' It needs your OK again.' else '' end;
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
$function$;

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
           b.handoff, b.meeting_place, sv.audience
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
      when r.meeting_place is not null then '📍 ' || case when p_for = 'admin' then 'Meet at ' else 'Meeting at ' end || r.meeting_place
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
      || case when v_where is not null then '<div style="margin-top:4px;font-size:14px;font-weight:700;color:#0F2B3F">' || private.html(v_where) || '</div>' else '' end
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

CREATE OR REPLACE FUNCTION private.send_client_reminders(p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           array_agg(b.id order by b.start_time) as ids,
           coalesce(bool_and(sv.audience = 'everyone'), false) as meet_greet
    from public.bookings b
    left join public.profiles p on p.id = b.user_id
    left join public.services sv on sv.id = b.service_id
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
        case when c.meet_greet
          then 'Hi ' || c.first_name || ', just a reminder about your meet & greet tomorrow. Bring '
               || coalesce(v_first.pets, 'your pup') || ' on a leash, and we’ll see you there!'
          else 'Hi ' || c.first_name || ', just a reminder about tomorrow. Please make sure we can get in and the leash is easy to find.' end,
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
        'address', coalesce(b.meeting_place, p.address),
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
