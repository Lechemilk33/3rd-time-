-- Paying for visits online.
--
-- Clients pay for one or more of their visits with Stripe Checkout. Stripe then tells the site
-- (a signed webhook), and this function checks the signature against the signing secret kept in
-- Vault before recording anything: the payment, which visits it covered, and later any refunds.
-- Because the check happens here, the website itself needs no database master key.
--
-- Visits can also be marked paid by the team (cash, Venmo...), and refunded from the calendar.

alter table public.bookings
  add column paid_at timestamptz,
  add column paid_cents int check (paid_cents is null or paid_cents >= 0),
  add column paid_via text check (paid_via in ('card', 'cash', 'other')),
  add column payment_id uuid references public.payments (id),
  add column refunded_cents int not null default 0 check (refunded_cents >= 0);

comment on column public.bookings.paid_at is 'When the visit was paid (by card online, or marked paid by the team).';
comment on column public.bookings.paid_cents is 'What was paid for this visit.';
comment on column public.bookings.paid_via is 'card (online), cash or other (marked by the team).';
comment on column public.bookings.payment_id is 'The online payment that covered this visit.';
comment on column public.bookings.refunded_cents is 'How much of this visit''s payment has been refunded.';

create index bookings_payment_idx on public.bookings (payment_id) where payment_id is not null;

alter table public.payments
  add column booking_ids uuid[] not null default '{}',
  add column refunded_cents int not null default 0 check (refunded_cents >= 0);

comment on column public.payments.booking_ids is 'Visits this payment covered.';

create index payments_intent_idx on public.payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Stripe webhook
-- ---------------------------------------------------------------------------

-- Returns 'ok', 'ignored' (an event we don't need), 'bad signature', 'too old' or 'not configured'.
create or replace function public.stripe_webhook(p_payload text, p_signature text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_time bigint;
  v_sigs text[];
  v_event jsonb;
  v_type text;
  o jsonb;
  v_user uuid;
  v_status text;
  v_payment uuid;
  v_items jsonb;
  v_service uuid;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'stripe_webhook_secret' limit 1;
  if coalesce(v_secret, '') = '' then return 'not configured'; end if;

  -- Stripe-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<payload>">[,v1=...]
  v_time := substring(coalesce(p_signature, '') from '(?:^|,)t=([0-9]{1,12})')::bigint;
  select array_agg(m[1]) into v_sigs from regexp_matches(coalesce(p_signature, ''), 'v1=([0-9a-f]{64})', 'g') as m;
  if v_time is null or v_sigs is null then return 'bad signature'; end if;
  if not (
    encode(extensions.hmac(convert_to(v_time || '.' || p_payload, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex')
    = any (v_sigs)
  ) then
    return 'bad signature';
  end if;
  -- Stripe signs every delivery afresh, so anything older than five minutes is a replay.
  if abs(extract(epoch from now()) - v_time) > 300 then return 'too old'; end if;

  v_event := p_payload::jsonb;
  v_type := v_event ->> 'type';
  o := v_event #> '{data,object}';

  -- A Checkout payment finished (or, for bank payments, settled or failed later).
  if v_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed') then
    if o ->> 'mode' is distinct from 'payment' then return 'ignored'; end if;

    v_user := case when o ->> 'client_reference_id' ~ '^[0-9a-f-]{36}$' then (o ->> 'client_reference_id')::uuid end;
    if v_user is not null and not exists (select 1 from public.profiles p where p.id = v_user) then v_user := null; end if;
    v_service := case when o #>> '{metadata,service_id}' ~ '^[0-9a-f-]{36}$' then (o #>> '{metadata,service_id}')::uuid end;
    if v_service is not null and not exists (select 1 from public.services s where s.id = v_service) then v_service := null; end if;
    v_status := case
      when v_type = 'checkout.session.async_payment_failed' then 'failed'
      else coalesce(o ->> 'payment_status', 'unpaid')
    end;

    -- metadata visits_1, visits_2...: "<booking id>:<cents>,<booking id>:<cents>"
    select coalesce(jsonb_agg(jsonb_build_object('id', split_part(item, ':', 1), 'amount', split_part(item, ':', 2)::int)), '[]'::jsonb)
    into v_items
    from jsonb_each_text(coalesce(o -> 'metadata', '{}'::jsonb)) as m(k, v)
    cross join lateral unnest(string_to_array(m.v, ',')) as item
    where m.k ~ '^visits_[0-9]{1,2}$' and item ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{1,7}$';

    insert into public.payments (
      user_id, service_id, description, amount_cents, currency, quantity, status, customer_email,
      stripe_session_id, stripe_payment_intent_id, booking_ids
    )
    values (
      v_user,
      v_service,
      left(coalesce(nullif(o #>> '{metadata,description}', ''), nullif(o #>> '{metadata,service_name}', ''), 'Online payment'), 200),
      coalesce((o ->> 'amount_total')::int, 0),
      coalesce(o ->> 'currency', 'usd'),
      greatest(1, jsonb_array_length(v_items)),
      v_status,
      coalesce(o #>> '{customer_details,email}', o ->> 'customer_email'),
      o ->> 'id',
      o ->> 'payment_intent',
      coalesce((select array_agg((i ->> 'id')::uuid) from jsonb_array_elements(v_items) i), '{}')
    )
    on conflict (stripe_session_id) do update
      set status = excluded.status,
          amount_cents = excluded.amount_cents,
          stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, public.payments.stripe_payment_intent_id),
          booking_ids = excluded.booking_ids,
          customer_email = coalesce(excluded.customer_email, public.payments.customer_email)
    returning id into v_payment;

    if v_status = 'paid' and v_user is not null then
      update public.bookings b
      set paid_at = now(), paid_cents = x.amount, paid_via = 'card', payment_id = v_payment
      from (select (i ->> 'id')::uuid as id, (i ->> 'amount')::int as amount from jsonb_array_elements(v_items) i) x
      where b.id = x.id and b.user_id = v_user and b.paid_at is null;
    end if;
    return 'ok';
  end if;

  -- Refunds, from the site or the Stripe Dashboard: the payment's running total.
  if v_type = 'charge.refunded' then
    update public.payments
    set refunded_cents = coalesce((o ->> 'amount_refunded')::int, 0),
        status = case when coalesce((o ->> 'refunded')::boolean, false) then 'refunded' else 'partially refunded' end
    where stripe_payment_intent_id = o ->> 'payment_intent';
    return 'ok';
  end if;

  -- Refunds the site made for one visit carry its id, so the visit shows it.
  if v_type in ('refund.created', 'refund.updated', 'refund.failed') then
    if o #>> '{metadata,booking_id}' !~ '^[0-9a-f-]{36}$' then return 'ignored'; end if;
    update public.bookings b
    set refunded_cents = case
      when o ->> 'status' in ('succeeded', 'pending', 'requires_action') then coalesce((o ->> 'amount')::int, 0)
      else 0
    end
    where b.id = (o #>> '{metadata,booking_id}')::uuid
      and b.payment_id in (select p.id from public.payments p where p.stripe_payment_intent_id = o ->> 'payment_intent');
    return 'ok';
  end if;

  return 'ignored';
end;
$$;

revoke all on function public.stripe_webhook(text, text) from public;
grant execute on function public.stripe_webhook(text, text) to anon, authenticated, service_role;

-- For Admin → Integrations: is the webhook's signing secret in place?
create or replace function public.payments_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then return null; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'stripe_webhook_secret' and coalesce(decrypted_secret, '') <> '');
end;
$$;

revoke all on function public.payments_status() from public, anon;
grant execute on function public.payments_status() to authenticated, service_role;
