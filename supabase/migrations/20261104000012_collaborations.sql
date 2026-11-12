-- =============================================================================
-- VBEATS — collaborations between producers
--
-- A producer can invite another producer to collaborate on one of their beats.
-- The invite shows up in the other producer's studio; once accepted:
-- * every sale of the beat is split in half: each producer earns 50 % of what
--   the sale pays producers (after the platform fee), paid out to their own
--   payout account. In a beat pack, each beat is an equal part of the pack
--   and a collaborated beat's part is split the same way;
-- * the beat credits both producers and is listed on both profiles.
-- One collaborator per beat. The beat's owner can cancel an invite that's still
-- open, but only the collaborator (or an administrator) can end an accepted
-- collaboration, so nobody can be cut out of their share. Sales made before a
-- collaboration was accepted or after it ended aren't split.
--
-- Run after files 1–11. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- ------------------------------------------------------------------- table --
do $$ begin
  create type public.collab_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'ended');
exception when duplicate_object then null;
end $$;

create table if not exists public.beat_collaborations (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  collaborator_id uuid not null references public.profiles (id) on delete cascade,
  status public.collab_status not null default 'pending',
  -- The collaborator's share of the producers' money from each sale.
  share_percent smallint not null default 50 check (share_percent between 1 and 99),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  constraint beat_collaborations_not_self check (owner_id <> collaborator_id)
);

-- One open invite or active collaboration per beat.
create unique index if not exists beat_collaborations_one_active
  on public.beat_collaborations (beat_id) where status in ('pending', 'accepted');
create index if not exists beat_collaborations_collaborator_idx on public.beat_collaborations (collaborator_id, status);
create index if not exists beat_collaborations_owner_idx on public.beat_collaborations (owner_id, status);

alter table public.beat_collaborations enable row level security;

drop policy if exists "both producers see their collaborations" on public.beat_collaborations;
create policy "both producers see their collaborations"
  on public.beat_collaborations for select
  to authenticated
  using (owner_id = (select auth.uid()) or collaborator_id = (select auth.uid()) or (select public.is_admin()));

-- Who co-produced a beat is public, like the beat itself.
drop policy if exists "accepted collaborations on visible beats are public" on public.beat_collaborations;
create policy "accepted collaborations on visible beats are public"
  on public.beat_collaborations for select
  to anon, authenticated
  using (status = 'accepted' and exists (select 1 from public.beats b where b.id = beat_collaborations.beat_id));

drop policy if exists require_two_factor on public.beat_collaborations;
create policy require_two_factor on public.beat_collaborations as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Changes only go through the functions below.
revoke all on public.beat_collaborations from anon, authenticated;
grant select on public.beat_collaborations to anon, authenticated;
grant all on public.beat_collaborations to service_role;

-- --------------------------------------------------------------- functions --
-- The beat's producer invites another producer (by username) to collaborate.
create or replace function public.invite_collaborator(p_beat_id uuid, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_beat public.beats;
  v_target public.profiles;
  v_row public.beat_collaborations;
begin
  if v_uid is null or not public.is_seller() then
    raise exception 'Only producers can invite collaborators' using errcode = '42501';
  end if;
  select * into v_beat from public.beats where id = p_beat_id;
  if not found or v_beat.producer_id <> v_uid then
    raise exception 'Beat not found or you don''t have permission to change it' using errcode = '42501';
  end if;
  if v_beat.admin_locked then
    raise exception 'This beat has been locked by an administrator' using errcode = 'P0001';
  end if;
  if v_beat.exclusive_sold_at is not null then
    raise exception 'This beat was sold under an exclusive license' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles
  where username = lower(btrim(ltrim(btrim(coalesce(p_username, '')), '@')));
  if not found or v_target.role not in ('seller', 'admin') then
    raise exception 'There''s no producer with that username' using errcode = 'P0001';
  end if;
  if v_target.id = v_uid then
    raise exception 'You can''t invite yourself' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_target.id and ub.blocked_id = v_uid) or (ub.blocker_id = v_uid and ub.blocked_id = v_target.id)
  ) then
    raise exception 'You can''t invite this producer' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.beat_collaborations c where c.beat_id = p_beat_id and c.status in ('pending', 'accepted')) then
    raise exception 'This beat already has a collaborator or an open invite' using errcode = 'P0001';
  end if;
  if (select count(*) from public.beat_collaborations c where c.owner_id = v_uid and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You''ve sent a lot of invites today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  begin
    insert into public.beat_collaborations (beat_id, owner_id, collaborator_id)
    values (p_beat_id, v_uid, v_target.id)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This beat already has a collaborator or an open invite' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'collaborator_id', v_target.id,
    'collaborator_username', v_target.username
  );
end;
$$;

-- The invited producer accepts or declines.
create or replace function public.respond_to_collaboration(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.beat_collaborations;
begin
  if v_uid is null or not public.mfa_satisfied() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_row from public.beat_collaborations where id = p_id for update;
  if not found or v_row.collaborator_id <> v_uid then
    raise exception 'Invite not found' using errcode = 'P0001';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This invite isn''t open any more' using errcode = 'P0001';
  end if;
  if coalesce(p_accept, false) and not public.is_seller() then
    raise exception 'Only producers can accept a collaboration' using errcode = '42501';
  end if;

  update public.beat_collaborations
  set status = case when coalesce(p_accept, false) then 'accepted'::public.collab_status else 'declined'::public.collab_status end,
      responded_at = now()
  where id = p_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'beat_id', v_row.beat_id, 'owner_id', v_row.owner_id);
end;
$$;

-- Ends a collaboration: the owner cancels an open invite (the invited producer
-- can decline it), the collaborator leaves an accepted one, an administrator
-- can end any. The owner can't end an accepted collaboration on their own.
create or replace function public.end_collaboration(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := public.is_admin();
  v_row public.beat_collaborations;
  v_status public.collab_status;
begin
  if v_uid is null or not public.mfa_satisfied() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_row from public.beat_collaborations where id = p_id for update;
  if not found or not (v_row.owner_id = v_uid or v_row.collaborator_id = v_uid or v_admin) then
    raise exception 'Collaboration not found' using errcode = 'P0001';
  end if;

  if v_row.status = 'pending' then
    v_status := case when v_row.collaborator_id = v_uid then 'declined' else 'cancelled' end;
  elsif v_row.status = 'accepted' then
    if not (v_row.collaborator_id = v_uid or v_admin) then
      raise exception 'Only your collaborator (or an administrator) can end an accepted collaboration' using errcode = 'P0001';
    end if;
    v_status := 'ended';
  else
    raise exception 'This collaboration has already ended' using errcode = 'P0001';
  end if;

  update public.beat_collaborations
  set status = v_status,
      responded_at = case when v_status = 'declined' then now() else responded_at end,
      ended_at = case when v_status in ('cancelled', 'ended') then now() else ended_at end
  where id = p_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'beat_id', v_row.beat_id,
    'owner_id', v_row.owner_id, 'collaborator_id', v_row.collaborator_id);
end;
$$;

-- The signed-in producer's open invites and collaborations, both ways, with the
-- beat (even while it's a draft) and the other producer.
create or replace function public.my_collaborations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.status,
      c.share_percent,
      c.created_at,
      c.responded_at,
      case when c.owner_id = (select auth.uid()) then 'owner' else 'collaborator' end as role,
      jsonb_build_object(
        'id', b.id, 'title', b.title, 'slug', b.slug, 'cover_path', b.cover_path, 'status', b.status,
        'bpm', b.bpm, 'key_note', b.key_note, 'key_mode', b.key_mode
      ) as beat,
      jsonb_build_object(
        'id', o.id, 'username', o.username, 'avatar_path', o.avatar_path,
        'name', coalesce(nullif(o.producer_name, ''), nullif(o.display_name, ''), o.username)
      ) as other
    from public.beat_collaborations c
    join public.beats b on b.id = c.beat_id
    join public.profiles o on o.id = case when c.owner_id = (select auth.uid()) then c.collaborator_id else c.owner_id end
    where ((select auth.uid()) in (c.owner_id, c.collaborator_id))
      and c.status in ('pending', 'accepted')
      and public.mfa_satisfied()
  ) x;
$$;

revoke all on function public.invite_collaborator(uuid, text) from public, anon;
revoke all on function public.respond_to_collaboration(uuid, boolean) from public, anon;
revoke all on function public.end_collaboration(uuid) from public, anon;
grant execute on function public.invite_collaborator(uuid, text) to authenticated, service_role;
grant execute on function public.respond_to_collaboration(uuid, boolean) to authenticated, service_role;
grant execute on function public.end_collaboration(uuid) to authenticated, service_role;
revoke all on function public.my_collaborations() from public, anon;
grant execute on function public.my_collaborations() to authenticated, service_role;

-- ------------------------------------------------------- splitting a sale --
-- A collaborator gets their own earning for a sale, next to the owner's.
alter table public.seller_earnings
  add column if not exists collab_of uuid references public.seller_earnings (id) on delete cascade;

do $$
declare v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.seller_earnings'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (order_item_id)'
  loop
    execute format('alter table public.seller_earnings drop constraint %I', v_name);
  end loop;
end $$;
create unique index if not exists seller_earnings_item_seller_key on public.seller_earnings (order_item_id, seller_id);

-- When a sale's earning is recorded for a beat with an accepted collaboration,
-- the collaborator's share (50 %) moves into an earning of their own. For a
-- pack, each beat is an equal part of the pack. Rounding favours the owner by
-- at most a cent.
create or replace function public.split_collab_earning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  r record;
  v_gross integer;
  v_net integer;
  v_status public.earning_status;
  v_moved_gross integer := 0;
  v_moved_net integer := 0;
begin
  if new.collab_of is not null or new.net <= 0 then
    return null;
  end if;
  select * into v_item from public.order_items where id = new.order_item_id;
  if not found then
    return null;
  end if;

  for r in
    with sold as (
      select v_item.beat_id as beat_id, 1 as parts
      where v_item.pack_id is null and v_item.beat_id is not null
      union all
      select (e ->> 'id')::uuid, jsonb_array_length(v_item.license_snapshot -> 'beats')
      from jsonb_array_elements(
        case when v_item.pack_id is not null and jsonb_typeof(v_item.license_snapshot -> 'beats') = 'array'
          then v_item.license_snapshot -> 'beats' else '[]'::jsonb end
      ) e
    )
    select c.collaborator_id, c.share_percent, count(*)::int as beats, max(s.parts)::int as parts
    from sold s
    join public.beat_collaborations c on c.beat_id = s.beat_id and c.status = 'accepted'
    where c.collaborator_id <> new.seller_id
    group by c.collaborator_id, c.share_percent
  loop
    v_gross := floor(new.gross::numeric * r.beats / r.parts * r.share_percent / 100);
    v_net := floor(new.net::numeric * r.beats / r.parts * r.share_percent / 100);
    continue when v_net <= 0;
    select case when p.role = 'admin' then 'retained'::public.earning_status else 'pending'::public.earning_status end
    into v_status from public.profiles p where p.id = r.collaborator_id;

    insert into public.seller_earnings (seller_id, order_id, order_item_id, beat_id, currency, gross, platform_fee, net, status, collab_of)
    values (r.collaborator_id, new.order_id, new.order_item_id, new.beat_id, new.currency,
            v_gross, v_gross - v_net, v_net, coalesce(v_status, 'pending'), new.id)
    on conflict (order_item_id, seller_id) do nothing;
    if found then
      v_moved_gross := v_moved_gross + v_gross;
      v_moved_net := v_moved_net + v_net;
    end if;
  end loop;

  if v_moved_net > 0 then
    update public.seller_earnings
    set gross = gross - v_moved_gross,
        net = net - v_moved_net,
        platform_fee = (gross - v_moved_gross) - (net - v_moved_net)
    where id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.split_collab_earning() from public, anon, authenticated;

drop trigger if exists seller_earnings_split_collab on public.seller_earnings;
create trigger seller_earnings_split_collab
  after insert on public.seller_earnings
  for each row execute function public.split_collab_earning();

-- ------------------------------------------------------------- read models --
-- Unchanged from file 9 except for the collaborator columns at the end.
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
  b.min_price_usd,
  -- added in file 12: the accepted collaborator, if any
  bc.collaborator_id,
  cp.username as collaborator_username,
  coalesce(nullif(cp.producer_name, ''), nullif(cp.display_name, ''), cp.username) as collaborator_name,
  cp.avatar_path as collaborator_avatar_path,
  cp.is_verified as collaborator_verified
from public.beats b
join public.profiles p on p.id = b.producer_id
left join public.genres g on g.slug = b.genre
left join public.beat_collaborations bc on bc.beat_id = b.id and bc.status = 'accepted'
left join public.profiles cp on cp.id = bc.collaborator_id;

-- Unchanged from file 11 except that a producer's beats include the ones they
-- co-produced, and searching a collaborator's name finds the beat.
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
      and (p_producer_id is null or c.producer_id = p_producer_id or c.collaborator_id = p_producer_id)
      and (p_exclude_id is null or c.id <> p_exclude_id)
      and (p_price_min is null or (case p_currency when 'pln' then c.min_price_pln when 'usd' then c.min_price_usd else c.min_price_eur end) >= p_price_min)
      and (p_price_max is null or (case p_currency when 'pln' then c.min_price_pln when 'usd' then c.min_price_usd else c.min_price_eur end) <= p_price_max)
      and (
        v_q is null
        or (v_tsq is not null and c.search_vector @@ v_tsq)
        or c.title ilike v_like
        or c.producer_name ilike v_like
        or c.producer_username ilike v_like
        or c.collaborator_name ilike v_like
        or c.collaborator_username ilike v_like
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

-- Unchanged from file 3 except that co-produced beats count for both producers.
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
  where status = 'published'
    and (producer_id = p_producer_id
      or id in (select c.beat_id from public.beat_collaborations c where c.collaborator_id = p_producer_id and c.status = 'accepted'));
$$;

-- Unchanged from file 9 except that sales are counted from each producer's own
-- earnings (a shared sale counts for both, at their share).
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
    -- Paid sales the producer earns from: their own beats and beats they co-produced.
    'sales_count', (
      select count(distinct se.order_item_id) from public.seller_earnings se
      join public.orders o on o.id = se.order_id
      where se.seller_id = v_uid and o.status in ('paid', 'partially_refunded')
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
        -- seller_amount: what this producer earns (their half of a shared sale).
        select oi.id, oi.beat_title, oi.license_name, oi.license_type, oi.price, oi.currency,
               coalesce(se.net, oi.seller_amount) as seller_amount,
               oi.created_at, o.status as order_status, p.username as buyer_username
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        left join public.profiles p on p.id = oi.buyer_id
        left join public.seller_earnings se on se.order_item_id = oi.id and se.seller_id = v_uid
        where (oi.seller_id = v_uid or se.id is not null) and o.status in ('paid', 'partially_refunded', 'refunded')
        order by oi.created_at desc limit 8
      ) r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Unchanged from file 3 except for shared sales (see inside).
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

  -- The producer's own sales and the sales of beats they co-produced.
  -- seller_amount is what this producer earns (their half of a shared sale);
  -- split_with is the other producer of a shared sale.
  with s as (
    select
      oi.id, oi.created_at, oi.beat_id, oi.beat_title, oi.license_name, oi.license_type,
      oi.price, oi.platform_fee,
      coalesce(se.net, case when oi.seller_id = v_uid then oi.seller_amount else 0 end) as seller_amount,
      oi.currency,
      o.status as order_status, o.order_number,
      p.username as buyer_username,
      se.status as earning_status, se.paid_at,
      b.slug as beat_slug, b.cover_path,
      (
        select pr.username from public.seller_earnings x
        join public.profiles pr on pr.id = x.seller_id
        where x.order_item_id = oi.id and x.seller_id <> v_uid
        order by x.created_at limit 1
      ) as split_with
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.profiles p on p.id = oi.buyer_id
    left join public.seller_earnings se on se.order_item_id = oi.id and se.seller_id = v_uid
    left join public.beats b on b.id = oi.beat_id
    where (oi.seller_id = v_uid or se.id is not null)
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

-- Let the API see the new table and functions straight away.
notify pgrst, 'reload schema';
