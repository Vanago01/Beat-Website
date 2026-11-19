-- =============================================================================
-- VBEATS — buyers pay the website fee, and drafts without details
--
-- * Fees: producers keep 100 % of their prices. Buyers pay a website fee on
--   top of every purchase (10 % by default; Admin → Settings), shown in the
--   cart, at checkout, in emails and in the order history. Orders keep it in
--   orders.service_fee and order_items.service_fee.
-- * Drafts: a beat can be saved as a draft before it has a genre or BPM (and
--   without a title: the site then calls it "Untitled beat"). Both are still
--   required to submit it for review or publish it. A draft's address follows
--   its title until it's published for the first time.
--
-- Run after files 1–15. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- ============================================================ website fee ===
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_settings' and column_name = 'buyer_fee_percent'
  ) then
    alter table public.platform_settings
      add column buyer_fee_percent numeric(5, 2) not null default 10
      check (buyer_fee_percent >= 0 and buyer_fee_percent <= 50);
    -- From now on producers keep their whole price. Only done when switching
    -- over, so a later change in Admin → Settings is kept if this file runs again.
    update public.platform_settings set platform_fee_percent = 0;
  end if;
end $$;

alter table public.orders add column if not exists service_fee integer not null default 0 check (service_fee >= 0);
alter table public.order_items add column if not exists service_fee integer not null default 0 check (service_fee >= 0);

-- Unchanged from file 10 except for the website fee (service_fee).
create or replace function public.create_pending_order(
  p_buyer_id uuid,
  p_buyer_email text,
  p_currency public.currency_code,
  p_license_ids uuid[],
  p_pack_license_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_license_ids, '{}')) as x where x is not null);
  v_pack_ids uuid[] := array(select distinct x from unnest(coalesce(p_pack_license_ids, '{}')) as x where x is not null);
  v_beats jsonb;
  v_available integer;
  v_fee_pct numeric;
  v_buyer_pct numeric;
  v_service integer;
  v_fees integer := 0;
  v_order_id uuid;
  v_total integer := 0;
  v_price integer;
  v_fee integer;
  v_count integer := 0;
  r record;
begin
  if p_buyer_id is null then
    raise exception 'You must be signed in to check out' using errcode = '28000';
  end if;
  if cardinality(v_ids) + cardinality(v_pack_ids) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) + cardinality(v_pack_ids) > 50 then
    raise exception 'Too many items in one order (max 50)' using errcode = 'P0001';
  end if;

  if (select count(distinct l.beat_id) from public.beat_licenses l where l.id = any (v_ids))
     <> (select count(*) from public.beat_licenses l where l.id = any (v_ids)) then
    raise exception 'Choose only one license per beat' using errcode = 'P0001';
  end if;
  if (select count(distinct l.pack_id) from public.beat_pack_licenses l where l.id = any (v_pack_ids))
     <> (select count(*) from public.beat_pack_licenses l where l.id = any (v_pack_ids)) then
    raise exception 'Choose only one license per beat pack' using errcode = 'P0001';
  end if;

  -- What producers give up (0 % by default now) and the website fee buyers pay on top.
  select s.platform_fee_percent, s.buyer_fee_percent into v_fee_pct, v_buyer_pct from public.platform_settings s where s.id;
  v_fee_pct := coalesce(v_fee_pct, 0);
  v_buyer_pct := coalesce(v_buyer_pct, 10);

  insert into public.orders (buyer_id, buyer_email, currency, status)
  values (p_buyer_id, p_buyer_email, p_currency, 'pending')
  returning id into v_order_id;

  for r in
    select
      l.*,
      b.title as beat_title, b.slug as beat_slug, b.status as beat_status, b.exclusive_sold_at,
      b.producer_id, b.bpm, b.key_note, b.key_mode, b.genre, b.cover_path,
      pr.role as producer_role, pr.username as producer_username,
      coalesce(nullif(pr.producer_name, ''), nullif(pr.display_name, ''), pr.username) as producer_name
    from public.beat_licenses l
    join public.beats b on b.id = l.beat_id
    join public.profiles pr on pr.id = b.producer_id
    where l.id = any (v_ids)
  loop
    if r.beat_status <> 'published' then
      raise exception '"%" is no longer available', r.beat_title using errcode = 'P0001';
    end if;
    if r.exclusive_sold_at is not null then
      raise exception '"%" has already been sold exclusively', r.beat_title using errcode = 'P0001';
    end if;
    if not r.enabled then
      raise exception 'The % license for "%" is no longer available', r.name, r.beat_title using errcode = 'P0001';
    end if;
    if r.producer_id = p_buyer_id then
      raise exception 'You cannot buy your own beat "%"', r.beat_title using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.purchases pu
      where pu.buyer_id = p_buyer_id and pu.beat_id = r.beat_id and pu.license_type = r.type and pu.revoked_at is null
    ) then
      raise exception 'You already own the % license for "%"', r.name, r.beat_title using errcode = 'P0001';
    end if;

    v_price := case p_currency when 'pln' then r.price_pln when 'usd' then r.price_usd else r.price_eur end;
    v_fee := case when r.producer_role = 'admin' then 0 else round(v_price * v_fee_pct / 100.0)::integer end;
    v_service := round(v_price * v_buyer_pct / 100.0)::integer;

    insert into public.order_items (
      order_id, buyer_id, beat_id, license_id, seller_id, license_type, license_name, beat_title, producer_name,
      license_snapshot, currency, price, platform_fee, seller_amount, service_fee
    ) values (
      v_order_id, p_buyer_id, r.beat_id, r.id, r.producer_id, r.type, r.name, r.beat_title, r.producer_name,
      jsonb_build_object(
        'license_name', r.name,
        'license_type', r.type,
        'includes_mp3', r.includes_mp3,
        'includes_wav', r.includes_wav,
        'includes_stems', r.includes_stems,
        'distribution_limit', r.distribution_limit,
        'streams_limit', r.streams_limit,
        'music_videos', r.music_videos,
        'radio_stations', r.radio_stations,
        'allow_live_performances', r.allow_live_performances,
        'allow_for_profit', r.allow_for_profit,
        'terms', r.terms,
        'beat_title', r.beat_title,
        'beat_slug', r.beat_slug,
        'bpm', r.bpm,
        'key_note', r.key_note,
        'key_mode', r.key_mode,
        'genre', r.genre,
        'cover_path', r.cover_path,
        'producer_id', r.producer_id,
        'producer_name', r.producer_name,
        'producer_username', r.producer_username,
        'price', v_price,
        'currency', p_currency
      ),
      p_currency, v_price, v_fee, v_price - v_fee, v_service
    );

    v_total := v_total + v_price;
    v_fees := v_fees + v_service;
    v_count := v_count + 1;
  end loop;

  -- Beat packs: one order line per pack; the buyer gets a license for every
  -- beat in it (the beats are listed in the snapshot as they are right now).
  for r in
    select
      pl.*,
      p.title as pack_title, p.slug as pack_slug, p.status as pack_status, p.cover_path as pack_cover,
      p.producer_id,
      pr.role as producer_role, pr.username as producer_username,
      coalesce(nullif(pr.producer_name, ''), nullif(pr.display_name, ''), pr.username) as producer_name
    from public.beat_pack_licenses pl
    join public.beat_packs p on p.id = pl.pack_id
    join public.profiles pr on pr.id = p.producer_id
    where pl.id = any (v_pack_ids)
  loop
    if r.pack_status <> 'published' then
      raise exception '"%" is no longer available', r.pack_title using errcode = 'P0001';
    end if;
    if not r.enabled then
      raise exception 'The % license for "%" is no longer available', r.name, r.pack_title using errcode = 'P0001';
    end if;
    if r.producer_id = p_buyer_id then
      raise exception 'You cannot buy your own beat pack "%"', r.pack_title using errcode = 'P0001';
    end if;

    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'title', b.title, 'slug', b.slug, 'bpm', b.bpm, 'key_note', b.key_note,
        'key_mode', b.key_mode, 'genre', b.genre, 'cover_path', b.cover_path
      ) order by i.position, b.title), '[]'::jsonb),
      count(*) filter (where b.status = 'published' and b.exclusive_sold_at is null)
    into v_beats, v_available
    from public.beat_pack_items i
    join public.beats b on b.id = i.beat_id
    where i.pack_id = r.pack_id;

    if v_available < 2 or v_available <> jsonb_array_length(v_beats) then
      raise exception '"%" is no longer available', r.pack_title using errcode = 'P0001';
    end if;

    v_price := case p_currency when 'pln' then r.price_pln when 'usd' then r.price_usd else r.price_eur end;
    v_fee := case when r.producer_role = 'admin' then 0 else round(v_price * v_fee_pct / 100.0)::integer end;
    v_service := round(v_price * v_buyer_pct / 100.0)::integer;

    insert into public.order_items (
      order_id, buyer_id, beat_id, license_id, pack_id, pack_license_id, seller_id, license_type, license_name,
      beat_title, producer_name, license_snapshot, currency, price, platform_fee, seller_amount, service_fee
    ) values (
      v_order_id, p_buyer_id, null, null, r.pack_id, r.id, r.producer_id, r.type, r.name,
      r.pack_title, r.producer_name,
      jsonb_build_object(
        'license_name', r.name,
        'license_type', r.type,
        'includes_mp3', r.includes_mp3,
        'includes_wav', r.includes_wav,
        'includes_stems', r.includes_stems,
        'distribution_limit', r.distribution_limit,
        'streams_limit', r.streams_limit,
        'music_videos', r.music_videos,
        'radio_stations', r.radio_stations,
        'allow_live_performances', r.allow_live_performances,
        'allow_for_profit', r.allow_for_profit,
        'terms', r.terms,
        'pack_id', r.pack_id,
        'pack_title', r.pack_title,
        'pack_slug', r.pack_slug,
        'pack_beats', jsonb_array_length(v_beats),
        'cover_path', r.pack_cover,
        'producer_id', r.producer_id,
        'producer_name', r.producer_name,
        'producer_username', r.producer_username,
        'price', v_price,
        'currency', p_currency,
        'beats', v_beats
      ),
      p_currency, v_price, v_fee, v_price - v_fee, v_service
    );

    v_total := v_total + v_price;
    v_fees := v_fees + v_service;
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_ids) + cardinality(v_pack_ids) then
    raise exception 'Some items in your cart are no longer available' using errcode = 'P0001';
  end if;

  update public.orders set subtotal = v_total, service_fee = v_fees, total = v_total + v_fees where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_total,
    'service_fee', v_fees,
    'service_fee_percent', v_buyer_pct,
    'total', v_total + v_fees,
    'currency', p_currency,
    'items', (
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'beat_id', oi.beat_id, 'pack_id', oi.pack_id,
        'license_id', coalesce(oi.license_id, oi.pack_license_id), 'beat_title', oi.beat_title,
        'license_name', oi.license_name, 'license_type', oi.license_type, 'producer_name', oi.producer_name,
        'price', oi.price, 'service_fee', oi.service_fee, 'cover_path', oi.license_snapshot ->> 'cover_path'
      ) order by oi.created_at)
      from public.order_items oi where oi.order_id = v_order_id
    )
  );
end;
$$;

-- Unchanged from file 10 except that an undeliverable item is refunded with its
-- website fee.
create or replace function public.fulfill_order(
  p_order_id uuid,
  p_payment_intent text default null,
  p_charge_id text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_beat public.beats;
  it record;
  v_conflicts jsonb := '[]'::jsonb;
  v_status public.earning_status;
  v_seller_role public.user_role;
begin
  -- The conditional update makes fulfilment idempotent: only one caller wins.
  update public.orders set
    status = 'paid',
    paid_at = now(),
    stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
    stripe_charge_id = coalesce(p_charge_id, stripe_charge_id),
    stripe_checkout_session_id = coalesce(p_session_id, stripe_checkout_session_id)
  where id = p_order_id and status = 'pending'
  returning * into v_order;

  if not found then
    return jsonb_build_object('fulfilled', false, 'order_id', p_order_id);
  end if;

  for it in select * from public.order_items where order_id = p_order_id order by created_at loop
    -- A beat pack: a license for every beat that was in it at checkout.
    if it.pack_license_id is not null or it.pack_id is not null then
      if jsonb_typeof(it.license_snapshot -> 'beats') is distinct from 'array'
         or jsonb_array_length(it.license_snapshot -> 'beats') = 0
         or exists (
           select 1 from jsonb_array_elements(it.license_snapshot -> 'beats') e
           left join public.beats b on b.id = (e ->> 'id')::uuid
           where b.id is null or b.exclusive_sold_at is not null
         ) then
        v_conflicts := v_conflicts || jsonb_build_object(
          'order_item_id', it.id, 'amount', it.price + it.service_fee, 'beat_title', it.beat_title, 'reason', 'unavailable'
        );
        continue;
      end if;

      insert into public.purchases (
        license_number, buyer_id, order_id, order_item_id, beat_id, license_id, seller_id, license_type,
        includes_mp3, includes_wav, includes_stems, license_snapshot
      )
      select
        'NW-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        v_order.buyer_id, v_order.id, it.id, (e ->> 'id')::uuid, null, it.seller_id, it.license_type,
        coalesce((it.license_snapshot ->> 'includes_mp3')::boolean, false),
        coalesce((it.license_snapshot ->> 'includes_wav')::boolean, false),
        coalesce((it.license_snapshot ->> 'includes_stems')::boolean, false),
        (it.license_snapshot - 'beats') || jsonb_build_object(
          'beat_title', e ->> 'title',
          'beat_slug', e ->> 'slug',
          'bpm', (e ->> 'bpm')::integer,
          'key_note', (e ->> 'key_note')::integer,
          'key_mode', e ->> 'key_mode',
          'genre', e ->> 'genre',
          'cover_path', coalesce(e ->> 'cover_path', it.license_snapshot ->> 'cover_path'),
          'purchased_at', now(),
          'order_number', v_order.order_number
        )
      from jsonb_array_elements(it.license_snapshot -> 'beats') e;

      if it.price > 0 then
        update public.beat_packs set sales_count = sales_count + 1 where id = it.pack_id;
        select role into v_seller_role from public.profiles where id = it.seller_id;
        v_status := case when v_seller_role = 'admin' then 'retained'::public.earning_status else 'pending'::public.earning_status end;
        insert into public.seller_earnings (seller_id, order_id, order_item_id, beat_id, currency, gross, platform_fee, net, status)
        values (it.seller_id, v_order.id, it.id, null, it.currency, it.price, it.platform_fee, it.seller_amount, v_status);
      end if;
      continue;
    end if;

    -- The beat was deleted while the buyer was paying: refund that item.
    if it.beat_id is null then
      v_conflicts := v_conflicts || jsonb_build_object(
        'order_item_id', it.id, 'amount', it.price + it.service_fee, 'beat_title', it.beat_title, 'reason', 'unavailable'
      );
      continue;
    end if;

    select * into v_beat from public.beats where id = it.beat_id for update;

    if it.license_type = 'exclusive' then
      if v_beat.exclusive_sold_at is not null then
        v_conflicts := v_conflicts || jsonb_build_object(
          'order_item_id', it.id, 'amount', it.price + it.service_fee, 'beat_title', it.beat_title, 'reason', 'exclusive_sold'
        );
        continue;
      end if;
      update public.beats set
        exclusive_sold_at = now(),
        exclusive_buyer_id = v_order.buyer_id,
        status = 'archived',
        is_featured = false
      where id = it.beat_id;
      update public.beat_licenses set enabled = false where beat_id = it.beat_id;
    end if;

    insert into public.purchases (
      license_number, buyer_id, order_id, order_item_id, beat_id, license_id, seller_id, license_type,
      includes_mp3, includes_wav, includes_stems, license_snapshot
    ) values (
      'NW-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      v_order.buyer_id, v_order.id, it.id, it.beat_id, it.license_id, it.seller_id, it.license_type,
      coalesce((it.license_snapshot ->> 'includes_mp3')::boolean, false),
      coalesce((it.license_snapshot ->> 'includes_wav')::boolean, false),
      coalesce((it.license_snapshot ->> 'includes_stems')::boolean, false),
      it.license_snapshot || jsonb_build_object('purchased_at', now(), 'order_number', v_order.order_number)
    );

    if it.price > 0 then
      update public.beats set sales_count = sales_count + 1 where id = it.beat_id;
      insert into public.beat_daily_stats (beat_id, day, sales)
      values (it.beat_id, current_date, 1)
      on conflict (beat_id, day) do update set sales = public.beat_daily_stats.sales + 1;

      select role into v_seller_role from public.profiles where id = it.seller_id;
      v_status := case when v_seller_role = 'admin' then 'retained'::public.earning_status else 'pending'::public.earning_status end;

      insert into public.seller_earnings (seller_id, order_id, order_item_id, beat_id, currency, gross, platform_fee, net, status)
      values (it.seller_id, v_order.id, it.id, it.beat_id, it.currency, it.price, it.platform_fee, it.seller_amount, v_status);
    end if;
  end loop;

  return jsonb_build_object(
    'fulfilled', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'conflicts', v_conflicts
  );
end;
$$;

-- Unchanged from file 9 except that platform earnings include website fees.
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with paid_orders as (
    select * from public.orders where status in ('paid', 'partially_refunded')
  ),
  paid_items as (
    select oi.* from public.order_items oi join paid_orders o on o.id = oi.order_id
  )
  select jsonb_build_object(
    'revenue', jsonb_build_object(
      'eur', coalesce((select sum(total - refunded_amount) from paid_orders where currency = 'eur'), 0),
      'pln', coalesce((select sum(total - refunded_amount) from paid_orders where currency = 'pln'), 0),
      'usd', coalesce((select sum(total - refunded_amount) from paid_orders where currency = 'usd'), 0)
    ),
    'platform_earnings', jsonb_build_object(
      'eur', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'eur' and status <> 'reversed'), 0)
        + coalesce((select sum(round(service_fee * (total - refunded_amount)::numeric / total)) from paid_orders where currency = 'eur' and total > 0), 0),
      'pln', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'pln' and status <> 'reversed'), 0)
        + coalesce((select sum(round(service_fee * (total - refunded_amount)::numeric / total)) from paid_orders where currency = 'pln' and total > 0), 0),
      'usd', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'usd' and status <> 'reversed'), 0)
        + coalesce((select sum(round(service_fee * (total - refunded_amount)::numeric / total)) from paid_orders where currency = 'usd' and total > 0), 0)
    ),
    'pending_payouts', jsonb_build_object(
      'eur', coalesce((select sum(net) from public.seller_earnings where currency = 'eur' and status = 'pending'), 0),
      'pln', coalesce((select sum(net) from public.seller_earnings where currency = 'pln' and status = 'pending'), 0),
      'usd', coalesce((select sum(net) from public.seller_earnings where currency = 'usd' and status = 'pending'), 0)
    ),
    'sales_count', (select count(*) from paid_items where price > 0),
    'free_downloads', (select count(*) from paid_items where price = 0),
    'orders_count', (select count(*) from paid_orders),
    'users_count', (select count(*) from public.profiles),
    'sellers_count', (select count(*) from public.profiles where role in ('seller', 'admin')),
    'new_users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'beats', coalesce((
      select jsonb_object_agg(s.status, s.cnt) from (
        select status::text as status, count(*) as cnt from public.beats group by status
      ) s
    ), '{}'::jsonb),
    'total_plays', (select coalesce(sum(plays_count), 0) from public.beats),
    'monthly', (
      select coalesce(jsonb_agg(m order by m.month), '[]'::jsonb) from (
        select
          to_char(mo.month, 'YYYY-MM') as month,
          coalesce(sum(o.total - o.refunded_amount) filter (where o.currency = 'eur'), 0)::bigint as eur,
          coalesce(sum(o.total - o.refunded_amount) filter (where o.currency = 'pln'), 0)::bigint as pln,
          coalesce(sum(o.total - o.refunded_amount) filter (where o.currency = 'usd'), 0)::bigint as usd,
          count(o.id)::int as orders
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as mo(month)
        left join public.orders o
          on date_trunc('month', o.paid_at) = mo.month
          and o.status in ('paid', 'partially_refunded')
        group by mo.month
      ) m
    ),
    'top_played', coalesce((
      select jsonb_agg(t) from (
        select c.id, c.title, c.slug, c.cover_path, c.producer_name, c.plays_count, c.sales_count, c.favorites_count, c.status
        from public.beat_cards c order by c.plays_count desc, c.created_at desc limit 8
      ) t
    ), '[]'::jsonb),
    'top_selling', coalesce((
      select jsonb_agg(t) from (
        select c.id, c.title, c.slug, c.cover_path, c.producer_name, c.plays_count, c.sales_count, c.favorites_count, c.status
        from public.beat_cards c where c.sales_count > 0 order by c.sales_count desc, c.plays_count desc limit 8
      ) t
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      select jsonb_agg(r) from (
        select o.id, o.order_number, o.status, o.currency, o.total, o.refunded_amount, o.created_at, o.paid_at,
               o.buyer_email, p.username as buyer_username,
               (select count(*) from public.order_items oi where oi.order_id = o.id) as items_count,
               (select string_agg(oi.beat_title || ' · ' || oi.license_name, ', ') from public.order_items oi where oi.order_id = o.id) as items_summary
        from public.orders o
        left join public.profiles p on p.id = o.buyer_id
        where o.status in ('paid', 'partially_refunded', 'refunded')
        order by o.paid_at desc nulls last, o.created_at desc
        limit 10
      ) r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ======================================================= drafts ===
-- A draft may not have a genre or BPM yet; anything submitted or live must.
alter table public.beats alter column genre drop not null;
alter table public.beats alter column bpm drop not null;
alter table public.beats drop constraint if exists beats_details_before_publishing;
alter table public.beats add constraint beats_details_before_publishing
  check (status not in ('pending', 'published') or (genre is not null and bpm is not null));

-- Unchanged from file 1 except for the genre and BPM checks (drafts may lack them).
create or replace function public.assert_beat_publishable(p_beat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.beats;
  lic record;
  n integer := 0;
begin
  select * into b from public.beats where id = p_beat_id;
  if not found or b.status not in ('pending', 'published') then
    return;
  end if;

  if b.genre is null then
    raise exception 'Choose a genre for "%" before publishing', b.title using errcode = 'P0001';
  end if;
  if b.bpm is null then
    raise exception 'Set the BPM of "%" before publishing', b.title using errcode = 'P0001';
  end if;

  if b.preview_path is null then
    raise exception 'Upload a preview audio file before publishing "%"', b.title using errcode = 'P0001';
  end if;

  for lic in select * from public.beat_licenses where beat_id = p_beat_id and enabled loop
    n := n + 1;
    if lic.includes_mp3 and b.mp3_path is null then
      raise exception 'The % license requires an MP3 file', lic.name using errcode = 'P0001';
    end if;
    if lic.includes_wav and b.wav_path is null then
      raise exception 'The % license requires a WAV file', lic.name using errcode = 'P0001';
    end if;
    if lic.includes_stems and b.stems_path is null then
      raise exception 'The % license requires a stems / trackout file (ZIP)', lic.name using errcode = 'P0001';
    end if;
  end loop;

  if n = 0 then
    raise exception 'Enable at least one license before publishing "%"', b.title using errcode = 'P0001';
  end if;
end;
$$;

-- A draft that was never published gets a new address when its title changes
-- (e.g. from "Untitled beat" to its real name).
create or replace function public.beats_draft_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'draft' and new.published_at is null and new.title is distinct from old.title then
    new.slug := public.unique_beat_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.beats_draft_slug() from public, anon, authenticated;

drop trigger if exists beats_draft_slug on public.beats;
create trigger beats_draft_slug
  before update of title on public.beats
  for each row execute function public.beats_draft_slug();

-- Let the API see the new columns straight away.
notify pgrst, 'reload schema';
