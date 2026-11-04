-- =============================================================================
-- RPC functions
-- =============================================================================

-- ---------------------------------------------------------------- accounts ---
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1 from public.profiles p
      where p.username = lower(btrim(p_username))
        and p.id is distinct from (select auth.uid())
    );
$$;

create or replace function public.become_seller(p_producer_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_open boolean;
  v_name text := nullif(btrim(coalesce(p_producer_name, '')), '');
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'You must be signed in to become a seller' using errcode = '28000';
  end if;

  select s.seller_signups_open into v_open from public.platform_settings s where s.id;
  if not coalesce(v_open, false) then
    raise exception 'Seller registrations are currently closed' using errcode = 'P0001';
  end if;

  if v_name is null or char_length(v_name) > 60 then
    raise exception 'Please choose a producer name (1–60 characters)' using errcode = '22023';
  end if;

  update public.profiles set
    role = case when role = 'buyer' then 'seller'::public.user_role else role end,
    producer_name = v_name,
    seller_since = coalesce(seller_since, now())
  where id = v_uid
  returning * into v_profile;

  return v_profile;
end;
$$;

-- ------------------------------------------------------------------- plays ---
create or replace function public.record_play(p_beat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.beats set plays_count = plays_count + 1
  where id = p_beat_id and status = 'published';

  if found then
    insert into public.beat_daily_stats (beat_id, day, plays)
    values (p_beat_id, current_date, 1)
    on conflict (beat_id, day) do update set plays = public.beat_daily_stats.plays + 1;
  end if;
end;
$$;

-- ------------------------------------------------------------ marketplace ---
-- Full marketplace search. SECURITY DEFINER so trending can read aggregate
-- stats, but it ONLY ever returns published beats.
create or replace function public.search_beats(
  p_query text default null,
  p_genres text[] default null,
  p_moods text[] default null,
  p_keys integer[] default null,
  p_bpm_min integer default 40,
  p_bpm_max integer default 220,
  p_price_min integer default null,
  p_price_max integer default null,
  p_currency public.currency_code default 'eur',
  p_free_only boolean default false,
  p_exclusive_only boolean default false,
  p_featured_only boolean default false,
  p_producer_id uuid default null,
  p_exclude_id uuid default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_tsq tsquery;
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_sort text := coalesce(p_sort, 'newest');
  v_result jsonb;
begin
  if v_q is not null then
    v_q := left(v_q, 100);
    v_tsq := public.prefix_tsquery(v_q);
    v_like := '%' || public.escape_like(v_q) || '%';
  end if;

  with recent as (
    select s.beat_id, sum(s.plays)::numeric as plays7, sum(s.sales)::numeric as sales7
    from public.beat_daily_stats s
    where v_sort = 'trending' and s.day > current_date - 7
    group by s.beat_id
  ),
  recent_favs as (
    select f.beat_id, count(*)::numeric as favs7
    from public.favorites f
    where v_sort = 'trending' and f.created_at > now() - interval '7 days'
    group by f.beat_id
  ),
  filtered as (
    select
      c.*,
      case when p_currency = 'pln' then c.min_price_pln else c.min_price_eur end as sort_price,
      case when v_sort = 'trending' then
        coalesce(r.plays7, 0) + 8 * coalesce(r.sales7, 0) + 3 * coalesce(rf.favs7, 0)
        + 2.0 / (1 + extract(epoch from (now() - coalesce(c.published_at, c.created_at))) / 86400.0)
      when v_sort = 'relevance' and v_tsq is not null then
        ts_rank(c.search_vector, v_tsq) + case when c.title ilike v_like then 1 else 0 end
      else 0 end as score
    from public.beat_cards c
    left join recent r on r.beat_id = c.id
    left join recent_favs rf on rf.beat_id = c.id
    where c.status = 'published'
      and c.bpm between coalesce(p_bpm_min, 40) and coalesce(p_bpm_max, 220)
      and (p_genres is null or cardinality(p_genres) = 0 or c.genre = any (p_genres))
      and (p_moods is null or cardinality(p_moods) = 0 or c.moods && p_moods)
      and (p_keys is null or cardinality(p_keys) = 0 or c.key_group = any (p_keys))
      and (not coalesce(p_free_only, false) or c.has_free)
      and (not coalesce(p_exclusive_only, false) or (c.has_exclusive and c.exclusive_sold_at is null))
      and (not coalesce(p_featured_only, false) or c.is_featured)
      and (p_producer_id is null or c.producer_id = p_producer_id)
      and (p_exclude_id is null or c.id <> p_exclude_id)
      and (p_price_min is null or (case when p_currency = 'pln' then c.min_price_pln else c.min_price_eur end) >= p_price_min)
      and (p_price_max is null or (case when p_currency = 'pln' then c.min_price_pln else c.min_price_eur end) <= p_price_max)
      and (
        v_q is null
        or (v_tsq is not null and c.search_vector @@ v_tsq)
        or c.title ilike v_like
        or c.producer_name ilike v_like
        or c.producer_username ilike v_like
      )
  ),
  paged as (
    select f.*,
      row_number() over (
        order by
          case when v_sort in ('trending', 'relevance') then f.score end desc nulls last,
          case when v_sort = 'popular' then f.plays_count end desc nulls last,
          case when v_sort = 'best_selling' then f.sales_count end desc nulls last,
          case when v_sort = 'best_selling' then f.plays_count end desc nulls last,
          case when v_sort = 'price_asc' then f.sort_price end asc nulls last,
          case when v_sort = 'price_desc' then f.sort_price end desc nulls last,
          case when v_sort = 'featured' then f.featured_at end desc nulls last,
          case when v_sort = 'oldest' then f.published_at end asc nulls last,
          f.published_at desc nulls last,
          f.id
      ) as rn
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) - 'search_vector' - 'score' - 'sort_price' - 'rn' order by p.rn)
      from paged p
      where p.rn > v_offset and p.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_genre_stats()
returns table (slug text, name text, sort_order integer, beats_count bigint, cover_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.slug,
    g.name,
    g.sort_order,
    count(b.id) as beats_count,
    (
      select b2.cover_path from public.beats b2
      where b2.genre = g.slug and b2.status = 'published' and b2.cover_path is not null
      order by b2.plays_count desc, b2.published_at desc
      limit 1
    ) as cover_path
  from public.genres g
  left join public.beats b on b.genre = g.slug and b.status = 'published'
  group by g.slug, g.name, g.sort_order
  order by g.sort_order, g.name;
$$;

create or replace function public.get_marketplace_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'beats', (select count(*) from public.beats where status = 'published'),
    'producers', (select count(distinct producer_id) from public.beats where status = 'published'),
    'plays', (select coalesce(sum(plays_count), 0) from public.beats where status = 'published')
  );
$$;

create or replace function public.get_producers(
  p_query text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_like text := case when nullif(btrim(coalesce(p_query, '')), '') is null then null
                      else '%' || public.escape_like(btrim(p_query)) || '%' end;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  with prod as (
    select
      p.id,
      p.username,
      coalesce(nullif(p.producer_name, ''), nullif(p.display_name, ''), p.username) as name,
      p.avatar_path,
      p.banner_path,
      left(p.bio, 240) as bio,
      p.location,
      p.is_verified,
      p.is_featured,
      count(b.id)::int as beats_count,
      coalesce(sum(b.plays_count), 0)::bigint as plays,
      coalesce(sum(b.sales_count), 0)::bigint as sales,
      coalesce((array_agg(b.cover_path order by b.plays_count desc) filter (where b.cover_path is not null))[1:4], '{}') as covers,
      coalesce(array_agg(distinct b.genre) filter (where b.genre is not null), '{}') as genres
    from public.profiles p
    left join public.beats b on b.producer_id = p.id and b.status = 'published'
    where p.role in ('seller', 'admin')
      and (v_like is null or p.username ilike v_like or p.producer_name ilike v_like or p.display_name ilike v_like)
    group by p.id
    having count(b.id) > 0 or p.is_featured
  ),
  ranked as (
    select prod.*, row_number() over (
      order by is_featured desc, sales desc, plays desc, beats_count desc, username
    ) as rn
    from prod
  )
  select jsonb_build_object(
    'total', (select count(*) from prod),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
      from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_producer_stats(p_producer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'beats', count(*),
    'plays', coalesce(sum(plays_count), 0),
    'sales', coalesce(sum(sales_count), 0),
    'favorites', coalesce(sum(favorites_count), 0)
  )
  from public.beats
  where producer_id = p_producer_id and status = 'published';
$$;

-- -------------------------------------------------------------- beat save ---
-- Saves a beat and its licenses atomically, as the caller (RLS applies).
-- Publishability is validated at commit by deferred constraint triggers.
create or replace function public.save_beat(
  p_beat jsonb,
  p_licenses jsonb,
  p_status public.beat_status default null,
  p_save_defaults boolean default false
)
returns public.beats
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid := nullif(p_beat ->> 'id', '')::uuid;
  v_row public.beats;
  v_lic jsonb;
  v_types public.license_type[] := '{}';
  v_moods text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_beat -> 'moods', '[]'::jsonb))), '{}');
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_beat -> 'tags', '[]'::jsonb))), '{}');
  v_sort smallint := 0;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  if p_licenses is null or jsonb_typeof(p_licenses) <> 'array' then
    raise exception 'Licenses must be an array' using errcode = '22023';
  end if;
  if v_id is null then
    v_id := gen_random_uuid();
  end if;

  if not exists (select 1 from public.beats where id = v_id) then
    begin
    insert into public.beats (
      id, producer_id, title, description, genre, moods, tags, bpm, key_note, key_mode,
      cover_path, preview_path, mp3_path, wav_path, stems_path, duration_seconds, waveform, status
    ) values (
      v_id,
      v_uid,
      p_beat ->> 'title',
      nullif(p_beat ->> 'description', ''),
      p_beat ->> 'genre',
      v_moods,
      v_tags,
      (p_beat ->> 'bpm')::smallint,
      (p_beat ->> 'key_note')::smallint,
      p_beat ->> 'key_mode',
      nullif(p_beat ->> 'cover_path', ''),
      nullif(p_beat ->> 'preview_path', ''),
      nullif(p_beat ->> 'mp3_path', ''),
      nullif(p_beat ->> 'wav_path', ''),
      nullif(p_beat ->> 'stems_path', ''),
      nullif(p_beat ->> 'duration_seconds', '')::integer,
      case when jsonb_typeof(p_beat -> 'waveform') = 'array' then p_beat -> 'waveform' else null end,
      'draft'
    )
    returning * into v_row;
    exception when unique_violation then
      -- The id exists but is not visible to the caller (someone else's beat).
      raise exception 'Beat not found or you do not have permission to edit it' using errcode = '42501';
    end;
  else
    update public.beats set
      title = p_beat ->> 'title',
      description = nullif(p_beat ->> 'description', ''),
      genre = p_beat ->> 'genre',
      moods = v_moods,
      tags = v_tags,
      bpm = (p_beat ->> 'bpm')::smallint,
      key_note = (p_beat ->> 'key_note')::smallint,
      key_mode = p_beat ->> 'key_mode',
      cover_path = nullif(p_beat ->> 'cover_path', ''),
      preview_path = nullif(p_beat ->> 'preview_path', ''),
      mp3_path = nullif(p_beat ->> 'mp3_path', ''),
      wav_path = nullif(p_beat ->> 'wav_path', ''),
      stems_path = nullif(p_beat ->> 'stems_path', ''),
      duration_seconds = coalesce(nullif(p_beat ->> 'duration_seconds', '')::integer, duration_seconds),
      waveform = case when jsonb_typeof(p_beat -> 'waveform') = 'array' then p_beat -> 'waveform' else waveform end
    where id = v_id
    returning * into v_row;

    if not found then
      raise exception 'Beat not found or you do not have permission to edit it' using errcode = '42501';
    end if;
  end if;

  for v_lic in select value from jsonb_array_elements(p_licenses) loop
    v_types := v_types || (v_lic ->> 'type')::public.license_type;
    v_sort := v_sort + 1;
    insert into public.beat_licenses as l (
      beat_id, type, name, price_eur, price_pln, enabled, includes_mp3, includes_wav, includes_stems,
      distribution_limit, streams_limit, music_videos, radio_stations,
      allow_live_performances, allow_for_profit, terms, sort_order
    ) values (
      v_id,
      (v_lic ->> 'type')::public.license_type,
      v_lic ->> 'name',
      coalesce((v_lic ->> 'price_eur')::integer, 0),
      coalesce((v_lic ->> 'price_pln')::integer, 0),
      coalesce((v_lic ->> 'enabled')::boolean, true),
      coalesce((v_lic ->> 'includes_mp3')::boolean, false),
      coalesce((v_lic ->> 'includes_wav')::boolean, false),
      coalesce((v_lic ->> 'includes_stems')::boolean, false),
      nullif(v_lic ->> 'distribution_limit', '')::integer,
      nullif(v_lic ->> 'streams_limit', '')::integer,
      nullif(v_lic ->> 'music_videos', '')::integer,
      nullif(v_lic ->> 'radio_stations', '')::integer,
      coalesce((v_lic ->> 'allow_live_performances')::boolean, true),
      coalesce((v_lic ->> 'allow_for_profit')::boolean, true),
      nullif(v_lic ->> 'terms', ''),
      v_sort
    )
    on conflict (beat_id, type) do update set
      name = excluded.name,
      price_eur = excluded.price_eur,
      price_pln = excluded.price_pln,
      enabled = excluded.enabled,
      includes_mp3 = excluded.includes_mp3,
      includes_wav = excluded.includes_wav,
      includes_stems = excluded.includes_stems,
      distribution_limit = excluded.distribution_limit,
      streams_limit = excluded.streams_limit,
      music_videos = excluded.music_videos,
      radio_stations = excluded.radio_stations,
      allow_live_performances = excluded.allow_live_performances,
      allow_for_profit = excluded.allow_for_profit,
      terms = excluded.terms,
      sort_order = excluded.sort_order;
  end loop;

  delete from public.beat_licenses where beat_id = v_id and not (type = any (v_types));

  if p_status is not null and p_status is distinct from v_row.status then
    update public.beats set status = p_status where id = v_id returning * into v_row;
  else
    select * into v_row from public.beats where id = v_id;
  end if;

  if coalesce(p_save_defaults, false) and v_row.producer_id = v_uid then
    update public.profiles set license_defaults = p_licenses where id = v_uid;
  end if;

  return v_row;
end;
$$;

-- --------------------------------------------------------- seller studio ---
create or replace function public.seller_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null or not public.is_seller() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'earnings', coalesce((
      select jsonb_agg(e) from (
        select se.currency, se.status, sum(se.net)::bigint as net, sum(se.gross)::bigint as gross, count(*)::int as count
        from public.seller_earnings se
        where se.seller_id = v_uid
        group by se.currency, se.status
      ) e
    ), '[]'::jsonb),
    'sales_count', (
      select count(*) from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.seller_id = v_uid and o.status in ('paid', 'partially_refunded') and oi.price > 0
    ),
    'free_downloads', (
      select count(*) from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.seller_id = v_uid and o.status in ('paid', 'partially_refunded') and oi.price = 0
    ),
    'beats', coalesce((
      select jsonb_object_agg(s.status, s.cnt) from (
        select b.status::text as status, count(*) as cnt from public.beats b
        where b.producer_id = v_uid group by b.status
      ) s
    ), '{}'::jsonb),
    'plays', (select coalesce(sum(plays_count), 0) from public.beats where producer_id = v_uid),
    'favorites', (select coalesce(sum(favorites_count), 0) from public.beats where producer_id = v_uid),
    'monthly', (
      select coalesce(jsonb_agg(m order by m.month), '[]'::jsonb) from (
        select
          to_char(mo.month, 'YYYY-MM') as month,
          coalesce(sum(se.net) filter (where se.currency = 'eur'), 0)::bigint as eur,
          coalesce(sum(se.net) filter (where se.currency = 'pln'), 0)::bigint as pln,
          count(se.id)::int as sales
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as mo(month)
        left join public.seller_earnings se
          on date_trunc('month', se.created_at) = mo.month
          and se.seller_id = v_uid
          and se.status <> 'reversed'
        group by mo.month
      ) m
    ),
    'daily_plays', (
      select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) from (
        select to_char(dd.day, 'YYYY-MM-DD') as day, coalesce(sum(s.plays), 0)::int as plays
        from generate_series(current_date - 29, current_date, interval '1 day') as dd(day)
        left join public.beat_daily_stats s on s.day = dd.day::date
          and s.beat_id in (select id from public.beats where producer_id = v_uid)
        group by dd.day
      ) d
    ),
    'top_beats', coalesce((
      select jsonb_agg(t) from (
        select b.id, b.title, b.slug, b.cover_path, b.status, b.plays_count, b.sales_count, b.favorites_count
        from public.beats b where b.producer_id = v_uid
        order by b.plays_count desc, b.created_at desc limit 5
      ) t
    ), '[]'::jsonb),
    'recent_sales', coalesce((
      select jsonb_agg(r) from (
        select oi.id, oi.beat_title, oi.license_name, oi.license_type, oi.price, oi.currency, oi.seller_amount,
               oi.created_at, o.status as order_status, p.username as buyer_username
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        left join public.profiles p on p.id = oi.buyer_id
        where oi.seller_id = v_uid and o.status in ('paid', 'partially_refunded', 'refunded')
        order by oi.created_at desc limit 8
      ) r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Seller-facing sales ledger: only fields a seller needs (never buyer emails).
create or replace function public.seller_sales(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_uid is null or not public.is_seller() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with s as (
    select
      oi.id, oi.created_at, oi.beat_id, oi.beat_title, oi.license_name, oi.license_type,
      oi.price, oi.platform_fee, oi.seller_amount, oi.currency,
      o.status as order_status, o.order_number,
      p.username as buyer_username,
      se.status as earning_status, se.paid_at,
      b.slug as beat_slug, b.cover_path
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.profiles p on p.id = oi.buyer_id
    left join public.seller_earnings se on se.order_item_id = oi.id
    left join public.beats b on b.id = oi.beat_id
    where oi.seller_id = v_uid
      and o.status in ('paid', 'partially_refunded', 'refunded')
  ),
  ranked as (
    select s.*, row_number() over (order by s.created_at desc, s.id) as rn from s
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
      from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ------------------------------------------------------------------ admin ---
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
      'pln', coalesce((select sum(total - refunded_amount) from paid_orders where currency = 'pln'), 0)
    ),
    'platform_earnings', jsonb_build_object(
      'eur', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'eur' and status <> 'reversed'), 0),
      'pln', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'pln' and status <> 'reversed'), 0)
    ),
    'pending_payouts', jsonb_build_object(
      'eur', coalesce((select sum(net) from public.seller_earnings where currency = 'eur' and status = 'pending'), 0),
      'pln', coalesce((select sum(net) from public.seller_earnings where currency = 'pln' and status = 'pending'), 0)
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

create or replace function public.admin_list_users(
  p_query text default null,
  p_role public.user_role default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_like text := case when nullif(btrim(coalesce(p_query, '')), '') is null then null
                      else '%' || public.escape_like(btrim(p_query)) || '%' end;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with u as (
    select
      p.id, p.username, p.display_name, p.producer_name, p.avatar_path, p.role, p.is_featured, p.is_verified,
      p.created_at, p.seller_since, au.email::text as email, au.last_sign_in_at, au.email_confirmed_at,
      (select count(*) from public.beats b where b.producer_id = p.id)::int as beats_count,
      (select count(*) from public.purchases pu where pu.buyer_id = p.id and pu.revoked_at is null)::int as purchases_count
    from public.profiles p
    join auth.users au on au.id = p.id
    where (p_role is null or p.role = p_role)
      and (v_like is null or p.username ilike v_like or au.email ilike v_like or p.producer_name ilike v_like or p.display_name ilike v_like)
  ),
  ranked as (
    select u.*, row_number() over (order by u.created_at desc, u.id) as rn from u
  )
  select jsonb_build_object(
    'total', (select count(*) from u),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
      from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================================
-- Order lifecycle — callable ONLY by the service role (server-side code).
-- ============================================================================
create or replace function public.create_pending_order(
  p_buyer_id uuid,
  p_buyer_email text,
  p_currency public.currency_code,
  p_license_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_license_ids, '{}')) as x where x is not null);
  v_fee_pct numeric;
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
  if cardinality(v_ids) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'Too many items in one order (max 50)' using errcode = 'P0001';
  end if;

  if (select count(distinct l.beat_id) from public.beat_licenses l where l.id = any (v_ids))
     <> (select count(*) from public.beat_licenses l where l.id = any (v_ids)) then
    raise exception 'Choose only one license per beat' using errcode = 'P0001';
  end if;

  select s.platform_fee_percent into v_fee_pct from public.platform_settings s where s.id;
  v_fee_pct := coalesce(v_fee_pct, 20);

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

    v_price := case when p_currency = 'pln' then r.price_pln else r.price_eur end;
    v_fee := case when r.producer_role = 'admin' then 0 else round(v_price * v_fee_pct / 100.0)::integer end;

    insert into public.order_items (
      order_id, buyer_id, beat_id, license_id, seller_id, license_type, license_name, beat_title, producer_name,
      license_snapshot, currency, price, platform_fee, seller_amount
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
      p_currency, v_price, v_fee, v_price - v_fee
    );

    v_total := v_total + v_price;
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_ids) then
    raise exception 'Some items in your cart are no longer available' using errcode = 'P0001';
  end if;

  update public.orders set subtotal = v_total, total = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total', v_total,
    'currency', p_currency,
    'items', (
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'beat_id', oi.beat_id, 'license_id', oi.license_id, 'beat_title', oi.beat_title,
        'license_name', oi.license_name, 'license_type', oi.license_type, 'producer_name', oi.producer_name,
        'price', oi.price, 'cover_path', oi.license_snapshot ->> 'cover_path'
      ) order by oi.created_at)
      from public.order_items oi where oi.order_id = v_order_id
    )
  );
end;
$$;

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
    -- The beat was deleted while the buyer was paying: refund that item.
    if it.beat_id is null then
      v_conflicts := v_conflicts || jsonb_build_object(
        'order_item_id', it.id, 'amount', it.price, 'beat_title', it.beat_title, 'reason', 'unavailable'
      );
      continue;
    end if;

    select * into v_beat from public.beats where id = it.beat_id for update;

    if it.license_type = 'exclusive' then
      if v_beat.exclusive_sold_at is not null then
        v_conflicts := v_conflicts || jsonb_build_object(
          'order_item_id', it.id, 'amount', it.price, 'beat_title', it.beat_title, 'reason', 'exclusive_sold'
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

create or replace function public.mark_order_failed(p_order_id uuid, p_status public.order_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set status = p_status
  where id = p_order_id and status = 'pending' and p_status in ('failed', 'canceled');
$$;

create or replace function public.apply_order_refund(p_order_id uuid, p_refunded_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_full boolean;
  r record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status not in ('paid', 'partially_refunded', 'refunded') then
    return jsonb_build_object('ok', false);
  end if;

  v_full := p_refunded_amount >= v_order.total;

  update public.orders set
    refunded_amount = least(greatest(p_refunded_amount, 0), total),
    status = case when v_full then 'refunded'::public.order_status else 'partially_refunded'::public.order_status end
  where id = p_order_id;

  if v_full then
    for r in
      select pu.*, oi.price from public.purchases pu
      join public.order_items oi on oi.id = pu.order_item_id
      where pu.order_id = p_order_id and pu.revoked_at is null
    loop
      update public.purchases set revoked_at = now() where id = r.id;
      if r.license_type = 'exclusive' then
        update public.beats set exclusive_sold_at = null, exclusive_buyer_id = null, status = 'draft'
        where id = r.beat_id and exclusive_buyer_id = r.buyer_id;
      end if;
      if r.price > 0 then
        update public.beats set sales_count = greatest(sales_count - 1, 0) where id = r.beat_id;
      end if;
    end loop;

    -- Earnings that were never transferred are simply cancelled. Transferred
    -- ones are returned below so the server can reverse the Stripe transfer.
    update public.seller_earnings set status = 'reversed'
    where order_id = p_order_id and status in ('pending', 'retained');
  end if;

  return jsonb_build_object(
    'ok', true,
    'full', v_full,
    'transfers_to_reverse', case when v_full then coalesce((
      select jsonb_agg(jsonb_build_object('earning_id', se.id, 'transfer_id', se.stripe_transfer_id, 'amount', se.net))
      from public.seller_earnings se
      where se.order_id = p_order_id and se.status = 'paid' and se.stripe_transfer_id is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------- grants ---
-- Internal / server-only functions must not be callable from the browser.
revoke execute on function public.create_pending_order(uuid, text, public.currency_code, uuid[]) from public, anon, authenticated;
revoke execute on function public.fulfill_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_order_failed(uuid, public.order_status) from public, anon, authenticated;
revoke execute on function public.apply_order_refund(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refresh_beat_price_summary(uuid) from public, anon, authenticated;
revoke execute on function public.assert_beat_publishable(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.create_pending_order(uuid, text, public.currency_code, uuid[]) to service_role;
grant execute on function public.fulfill_order(uuid, text, text, text) to service_role;
grant execute on function public.mark_order_failed(uuid, public.order_status) to service_role;
grant execute on function public.apply_order_refund(uuid, integer) to service_role;

-- Signed-in only
revoke execute on function public.become_seller(text) from public, anon;
revoke execute on function public.save_beat(jsonb, jsonb, public.beat_status, boolean) from public, anon;
revoke execute on function public.seller_dashboard() from public, anon;
revoke execute on function public.seller_sales(integer, integer) from public, anon;
revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.admin_list_users(text, public.user_role, integer, integer) from public, anon;
grant execute on function public.become_seller(text) to authenticated;
grant execute on function public.save_beat(jsonb, jsonb, public.beat_status, boolean) to authenticated;
grant execute on function public.seller_dashboard() to authenticated;
grant execute on function public.seller_sales(integer, integer) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_list_users(text, public.user_role, integer, integer) to authenticated;
