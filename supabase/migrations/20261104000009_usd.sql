-- =============================================================================
-- VBEATS — US dollars
--
-- Adds USD next to EUR and PLN:
-- * Every license gets a USD price. Existing licenses are converted from the
--   euro price at the EUR → USD rate (Admin → Settings, 1.15 to start) and
--   rounded to a tidy price, e.g. €29.99 → $34.99, €99.99 → $119.
--   Producers can change them in the beat editor.
-- * Beats get a "from" price in USD for cards, search, filters and sorting.
-- * Buyers can pay in USD; the admin and producer dashboards count USD sales.
-- * Producer transfers now record what was actually sent, because Stripe
--   converts a sale into the platform's currency when it doesn't hold USD.
--
-- Run after files 1–8. Safe to run more than once.
-- =============================================================================

-- --------------------------------------------------------------- currency --
alter type public.currency_code add value if not exists 'usd';

-- Admin → Settings: suggestion rate for USD prices.
alter table public.platform_settings
  add column if not exists eur_to_usd numeric(8, 4) not null default 1.15
  constraint platform_settings_eur_to_usd_check check (eur_to_usd > 0);

-- Suggests a dollar price from a euro price: converts at the given rate,
-- then rounds up to a .99 price under $100 (€29.99 → $34.99) or to whole
-- dollars ending in 9 above (€99.99 → $119, €999 → $1,149).
create or replace function public.suggest_usd_price(p_eur integer, p_rate numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_eur, 0) <= 0 then 0
    when d.whole <= 100 then d.whole * 100 - 1
    else (d.whole + (19 - d.whole % 10) % 10) * 100
  end
  from (select ceil(coalesce(p_eur, 0) * coalesce(nullif(p_rate, 0), 1.15) / 100.0)::integer as whole) as d;
$$;

grant execute on function public.suggest_usd_price(integer, numeric) to anon, authenticated, service_role;

-- -------------------------------------------------------- beats & licenses --
alter table public.beats add column if not exists min_price_usd integer;
create index if not exists beats_min_price_usd_idx on public.beats (min_price_usd) where status = 'published';

alter table public.beat_licenses add column if not exists price_usd integer;

-- Producers can't set the USD "from" price themselves (it's computed from
-- their licenses), just like the euro and złoty ones.
create or replace function public.beats_protect_usd_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_context() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.min_price_usd := null;
  elsif new.min_price_usd is distinct from old.min_price_usd then
    raise exception 'permission denied: protected beat fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists beats_protect_usd_summary on public.beats;
create trigger beats_protect_usd_summary
  before insert or update on public.beats
  for each row execute function public.beats_protect_usd_summary();

create or replace function public.refresh_beat_price_summary(p_beat_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.beats b set
    min_price_eur = s.min_eur,
    min_price_pln = s.min_pln,
    min_price_usd = s.min_usd,
    has_free = s.has_free,
    has_exclusive = s.has_excl
  from (
    select
      min(l.price_eur) filter (where l.enabled) as min_eur,
      min(l.price_pln) filter (where l.enabled) as min_pln,
      min(l.price_usd) filter (where l.enabled) as min_usd,
      coalesce(bool_or(l.type = 'free' and l.enabled), false) as has_free,
      coalesce(bool_or(l.type = 'exclusive' and l.enabled), false) as has_excl
    from public.beat_licenses l
    where l.beat_id = p_beat_id
  ) as s
  where b.id = p_beat_id
    and (b.min_price_eur is distinct from s.min_eur
      or b.min_price_pln is distinct from s.min_pln
      or b.min_price_usd is distinct from s.min_usd
      or b.has_free is distinct from s.has_free
      or b.has_exclusive is distinct from s.has_excl);
$$;

create or replace function public.beat_licenses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sold timestamptz;
begin
  select b.exclusive_sold_at into v_sold from public.beats b where b.id = new.beat_id;
  if v_sold is not null and new.enabled and not public.is_trusted_context() then
    raise exception 'This beat was sold under an exclusive license' using errcode = 'P0001';
  end if;

  new.name := btrim(new.name);
  -- No dollar price given (e.g. a license saved by an older version of the
  -- site): suggest one from the euro price.
  if new.price_usd is null then
    new.price_usd := public.suggest_usd_price(
      new.price_eur,
      (select s.eur_to_usd from public.platform_settings s where s.id)
    );
  end if;
  if new.type = 'free' then
    new.price_eur := 0;
    new.price_pln := 0;
    new.price_usd := 0;
    new.includes_mp3 := false;
    new.includes_wav := false;
    new.includes_stems := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Give every existing license a dollar price.
update public.beat_licenses l
set price_usd = case when l.type = 'free' then 0
                     else public.suggest_usd_price(l.price_eur, (select s.eur_to_usd from public.platform_settings s where s.id)) end
where l.price_usd is null;

alter table public.beat_licenses alter column price_usd set not null;

alter table public.beat_licenses drop constraint if exists beat_licenses_price_usd_range;
alter table public.beat_licenses add constraint beat_licenses_price_usd_range check (price_usd between 0 and 10000000);

-- Paid licenses cost at least $0.50 (Stripe's minimum), free ones nothing.
alter table public.beat_licenses drop constraint if exists beat_licenses_price_rules;
alter table public.beat_licenses add constraint beat_licenses_price_rules check (
  (type = 'free' and price_eur = 0 and price_pln = 0 and price_usd = 0)
  or (type <> 'free' and price_eur >= 50 and price_pln >= 200 and price_usd >= 50)
);

do $$
begin
  perform public.refresh_beat_price_summary(b.id) from public.beats b;
end $$;

create or replace view public.beat_cards
with (security_invoker = true)
as
select
  b.id,
  b.slug,
  b.title,
  b.genre,
  g.name as genre_name,
  b.moods,
  b.tags,
  b.bpm,
  b.key_note,
  b.key_mode,
  b.key_group,
  b.cover_path,
  b.preview_path,
  b.duration_seconds,
  b.waveform,
  b.status,
  b.is_featured,
  b.featured_at,
  b.plays_count,
  b.favorites_count,
  b.sales_count,
  b.rating_avg,
  b.rating_count,
  b.min_price_eur,
  b.min_price_pln,
  b.has_free,
  b.has_exclusive,
  b.exclusive_sold_at,
  b.published_at,
  b.created_at,
  b.search_vector,
  b.producer_id,
  p.username as producer_username,
  coalesce(nullif(p.producer_name, ''), nullif(p.display_name, ''), p.username) as producer_name,
  p.avatar_path as producer_avatar_path,
  p.is_verified as producer_verified,
  -- added in file 9 (new columns must come last)
  b.min_price_usd
from public.beats b
join public.profiles p on p.id = b.producer_id
left join public.genres g on g.slug = b.genre;

-- ---------------------------------------------------------------- payouts --
-- What each producer transfer actually sent for this sale, in the currency
-- Stripe settled the payment in (refunds reverse exactly this amount).
alter table public.seller_earnings
  add column if not exists transfer_amount integer
  constraint seller_earnings_transfer_amount_check check (transfer_amount is null or transfer_amount >= 0);
alter table public.seller_earnings
  add column if not exists transfer_currency text
  constraint seller_earnings_transfer_currency_check check (transfer_currency is null or transfer_currency ~ '^[a-z]{3}$');

-- -------------------------------------------------------------- functions --
-- Unchanged from files 1 and 3 except for the USD parts.

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
      case p_currency when 'pln' then c.min_price_pln when 'usd' then c.min_price_usd else c.min_price_eur end as sort_price,
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
      and (p_price_min is null or (case p_currency when 'pln' then c.min_price_pln when 'usd' then c.min_price_usd else c.min_price_eur end) >= p_price_min)
      and (p_price_max is null or (case p_currency when 'pln' then c.min_price_pln when 'usd' then c.min_price_usd else c.min_price_eur end) <= p_price_max)
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
      beat_id, type, name, price_eur, price_pln, price_usd, enabled, includes_mp3, includes_wav, includes_stems,
      distribution_limit, streams_limit, music_videos, radio_stations,
      allow_live_performances, allow_for_profit, terms, sort_order
    ) values (
      v_id,
      (v_lic ->> 'type')::public.license_type,
      v_lic ->> 'name',
      coalesce((v_lic ->> 'price_eur')::integer, 0),
      coalesce((v_lic ->> 'price_pln')::integer, 0),
      nullif(v_lic ->> 'price_usd', '')::integer,
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
      price_usd = excluded.price_usd,
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

    v_price := case p_currency when 'pln' then r.price_pln when 'usd' then r.price_usd else r.price_eur end;
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
      select jsonb_agg(jsonb_build_object('earning_id', se.id, 'transfer_id', se.stripe_transfer_id, 'amount', coalesce(se.transfer_amount, se.net)))
      from public.seller_earnings se
      where se.order_id = p_order_id and se.status = 'paid' and se.stripe_transfer_id is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

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
          coalesce(sum(se.net) filter (where se.currency = 'usd'), 0)::bigint as usd,
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
      'eur', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'eur' and status <> 'reversed'), 0),
      'pln', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'pln' and status <> 'reversed'), 0),
      'usd', coalesce((select sum(platform_fee + case when status = 'retained' then net else 0 end) from public.seller_earnings where currency = 'usd' and status <> 'reversed'), 0)
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

notify pgrst, 'reload schema';
