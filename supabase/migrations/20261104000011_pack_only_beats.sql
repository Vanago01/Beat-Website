-- =============================================================================
-- VBEATS — beats in a pack are only shown inside the pack
--
-- While a pack is on sale (published, with all of its beats available), its
-- beats aren't listed on their own: not on the producer's profile, in
-- Explore, on the homepage, in search or under "more like this". Buyers find
-- them on the pack's page, where they can buy the whole pack or license a
-- single beat at its own price. A beat's own page leads to its pack.
-- When the pack goes off sale (unpublished, or a beat in it is unavailable),
-- its beats are listed on their own again, so nothing disappears from the store.
--
-- Run after files 1–10. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later changes aren't blocked.
set constraints all immediate;

-- --------------------------------------------------------------- the view --
-- The beats of every pack that's on sale (a beat can be in several packs).
create or replace view public.live_pack_beats
with (security_invoker = true)
as
select
  i.beat_id,
  pc.id as pack_id,
  pc.slug as pack_slug,
  pc.title as pack_title,
  pc.published_at,
  pc.producer_id
from public.beat_pack_items i
join public.pack_cards pc on pc.id = i.pack_id
where pc.status = 'published'
  and pc.available;

grant select on public.live_pack_beats to anon, authenticated, service_role;

-- ------------------------------------------------------------------ search --
-- Unchanged from file 9 except that beats of packs on sale are skipped.
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

  with pack_only as materialized (
    -- Beats of a pack that's on sale are only listed inside the pack.
    select distinct lp.beat_id from public.live_pack_beats lp
  ),
  recent as (
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
      and not exists (select 1 from pack_only po where po.beat_id = c.id)
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

-- ------------------------------------------------------------ pack search --
-- Packs on sale whose title or producer matches, or that contain a beat with
-- that title (those beats aren't in the beat results any more).
create or replace function public.search_packs(p_query text, p_limit integer default 3)
returns table (
  id uuid,
  slug text,
  title text,
  cover_path text,
  producer_name text,
  beats_count integer,
  matched_beat text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || public.escape_like(left(btrim(p_query), 100)) || '%' as pat
    where nullif(btrim(coalesce(p_query, '')), '') is not null
  )
  select
    pc.id,
    pc.slug,
    pc.title,
    pc.cover_path,
    pc.producer_name,
    pc.beats_count,
    (
      select b.title
      from public.beat_pack_items i
      join public.beats b on b.id = i.beat_id
      where i.pack_id = pc.id and b.title ilike q.pat
      order by i.position
      limit 1
    ) as matched_beat
  from public.pack_cards pc
  cross join q
  where pc.status = 'published'
    and pc.available
    and (
      pc.title ilike q.pat
      or pc.producer_name ilike q.pat
      or exists (
        select 1
        from public.beat_pack_items i
        join public.beats b on b.id = i.beat_id
        where i.pack_id = pc.id and b.title ilike q.pat
      )
    )
  order by (pc.title ilike q.pat) desc, pc.published_at desc nulls last
  limit least(greatest(coalesce(p_limit, 3), 1), 20);
$$;

grant execute on function public.search_packs(text, integer) to anon, authenticated, service_role;


-- Let the API see the new view and function straight away.
notify pgrst, 'reload schema';
