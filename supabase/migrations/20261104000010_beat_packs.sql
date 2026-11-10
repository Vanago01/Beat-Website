-- =============================================================================
-- VBEATS — beat packs
--
-- Producers can bundle several of their beats into a pack with one cover and
-- one price per license tier. Every beat in a pack stays for sale on its own.
-- * A pack needs at least 2 of the producer's own beats to be published, and
--   every beat must have the files the pack's licenses deliver.
-- * Packs follow the same review rule as beats (Admin → Settings).
-- * Buying a pack gives the buyer a license for every beat in it: each beat
--   appears in their library with its own downloads and license agreement.
-- * A pack is only sold while all of its beats are available.
--
-- Run after files 1–9. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- ------------------------------------------------------------------ tables --
create table if not exists public.beat_packs (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 5000),
  cover_path text check (cover_path is null or char_length(cover_path) <= 512),
  status public.beat_status not null default 'draft',
  rejection_reason text check (char_length(rejection_reason) <= 1000),
  is_featured boolean not null default false,
  sales_count integer not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists beat_packs_producer_idx on public.beat_packs (producer_id, created_at desc);
create index if not exists beat_packs_published_idx on public.beat_packs (published_at desc) where status = 'published';
create index if not exists beat_packs_status_idx on public.beat_packs (status, submitted_at);

create table if not exists public.beat_pack_items (
  pack_id uuid not null references public.beat_packs (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete cascade,
  position smallint not null default 0,
  primary key (pack_id, beat_id)
);

create index if not exists beat_pack_items_beat_idx on public.beat_pack_items (beat_id);

create table if not exists public.beat_pack_licenses (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.beat_packs (id) on delete cascade,
  type public.license_type not null
    constraint beat_pack_licenses_type_check check (type in ('basic', 'premium', 'trackout', 'unlimited')),
  name text not null check (char_length(name) between 1 and 60),
  price_eur integer not null check (price_eur between 50 and 10000000),
  price_pln integer not null check (price_pln between 200 and 50000000),
  price_usd integer not null check (price_usd between 50 and 10000000),
  enabled boolean not null default true,
  includes_mp3 boolean not null default true,
  includes_wav boolean not null default false,
  includes_stems boolean not null default false,
  distribution_limit integer check (distribution_limit is null or distribution_limit >= 0),
  streams_limit integer check (streams_limit is null or streams_limit >= 0),
  music_videos integer check (music_videos is null or music_videos >= 0),
  radio_stations integer check (radio_stations is null or radio_stations >= 0),
  allow_live_performances boolean not null default true,
  allow_for_profit boolean not null default true,
  terms text check (char_length(terms) <= 4000),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, type)
);

create index if not exists beat_pack_licenses_pack_idx on public.beat_pack_licenses (pack_id);

-- Orders: a pack is one order line; the buyer gets one purchase per beat.
alter table public.order_items add column if not exists pack_id uuid references public.beat_packs (id) on delete set null;
alter table public.order_items add column if not exists pack_license_id uuid references public.beat_pack_licenses (id) on delete set null;
create index if not exists order_items_pack_idx on public.order_items (pack_id) where pack_id is not null;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.purchases'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (order_item_id)'
  loop
    execute format('alter table public.purchases drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.purchases drop constraint if exists purchases_order_item_beat_key;
alter table public.purchases add constraint purchases_order_item_beat_key unique (order_item_id, beat_id);

-- ------------------------------------------------------- guards & checks --
create or replace function public.unique_pack_slug(p_title text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base text := left(nullif(public.slugify(p_title), ''), 60);
  hex text := replace(p_id::text, '-', '');
  len integer := 6;
  candidate text;
begin
  if base is null then
    base := 'pack';
  end if;
  base := trim(both '-' from base);
  loop
    candidate := base || '-' || substr(hex, 1, len);
    exit when not exists (select 1 from public.beat_packs where slug = candidate) or len >= 32;
    len := len + 2;
  end loop;
  return candidate;
end;
$$;

-- Producers can edit their packs but not moderation or sales fields; the
-- review rule and status side effects are the same as for beats.
create or replace function public.beat_packs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_privileged boolean := public.is_trusted_context() or public.is_admin();
  v_approval_required boolean;
begin
  select s.require_beat_approval into v_approval_required from public.platform_settings s where s.id;
  v_approval_required := coalesce(v_approval_required, true);

  new.title := btrim(new.title);
  new.updated_at := now();

  if not v_privileged and new.cover_path is not null
     and (split_part(new.cover_path, '/', 1) <> new.producer_id::text or position('..' in new.cover_path) > 0) then
    raise exception 'permission denied: files must be uploaded to your own folder' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.unique_pack_slug(new.title, new.id);
    end if;
    if not v_privileged then
      new.is_featured := false;
      new.sales_count := 0;
      new.rejection_reason := null;
      new.submitted_at := null;
      new.approved_at := null;
      new.published_at := null;
      new.status := 'draft';
    end if;
  else
    if not v_privileged then
      if new.producer_id is distinct from old.producer_id
         or new.slug is distinct from old.slug
         or new.is_featured is distinct from old.is_featured
         or new.sales_count is distinct from old.sales_count
         or new.submitted_at is distinct from old.submitted_at
         or new.approved_at is distinct from old.approved_at
         or new.published_at is distinct from old.published_at
         or new.rejection_reason is distinct from old.rejection_reason then
        raise exception 'permission denied: protected pack fields' using errcode = '42501';
      end if;
      if new.status is distinct from old.status then
        if new.status = 'rejected' then
          raise exception 'permission denied: only administrators can reject packs' using errcode = '42501';
        end if;
        if new.status = 'published' and v_approval_required and old.approved_at is null then
          new.status := 'pending';
        end if;
      end if;
    end if;
  end if;

  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    new.submitted_at := now();
    new.rejection_reason := null;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.approved_at := coalesce(new.approved_at, now());
    new.published_at := coalesce(new.published_at, now());
    new.rejection_reason := null;
  end if;
  -- Only live packs can be featured.
  if new.status <> 'published' then
    new.is_featured := false;
  end if;
  return new;
end;
$$;

drop trigger if exists beat_packs_before_write on public.beat_packs;
create trigger beat_packs_before_write
  before insert or update on public.beat_packs
  for each row execute function public.beat_packs_before_write();

create or replace function public.beat_pack_licenses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists beat_pack_licenses_before_write on public.beat_pack_licenses;
create trigger beat_pack_licenses_before_write
  before insert or update on public.beat_pack_licenses
  for each row execute function public.beat_pack_licenses_before_write();

-- A pack in review or published must be complete. Checked when the transaction
-- ends, so a pack, its beats and its prices can be saved together.
create or replace function public.assert_pack_publishable(p_pack_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.beat_packs;
  lic record;
  n integer;
  missing text;
begin
  select * into p from public.beat_packs where id = p_pack_id;
  if not found or p.status not in ('pending', 'published') then
    return;
  end if;

  select count(*) into n from public.beat_pack_items i where i.pack_id = p_pack_id;
  if n < 2 then
    raise exception 'Add at least 2 beats to the pack "%" before publishing it', p.title using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.beat_pack_items i join public.beats b on b.id = i.beat_id
    where i.pack_id = p_pack_id and b.producer_id <> p.producer_id
  ) then
    raise exception 'permission denied: a pack can only contain your own beats' using errcode = '42501';
  end if;

  -- A published pack only contains live beats; a pack in review may also
  -- contain beats that are in review with it.
  select b.title into missing
  from public.beat_pack_items i join public.beats b on b.id = i.beat_id
  where i.pack_id = p_pack_id
    and (b.exclusive_sold_at is not null
         or not (b.status = 'published' or (p.status = 'pending' and b.status = 'pending')))
  order by i.position
  limit 1;
  if missing is not null then
    raise exception '"%" isn''t available, so the pack can''t be published with it. Publish the beat or remove it from the pack.', missing
      using errcode = 'P0001';
  end if;

  n := 0;
  for lic in select * from public.beat_pack_licenses where pack_id = p_pack_id and enabled loop
    n := n + 1;
    select b.title into missing
    from public.beat_pack_items i join public.beats b on b.id = i.beat_id
    where i.pack_id = p_pack_id
      and ((lic.includes_mp3 and b.mp3_path is null)
        or (lic.includes_wav and b.wav_path is null)
        or (lic.includes_stems and b.stems_path is null))
    order by i.position
    limit 1;
    if missing is not null then
      raise exception 'The pack''s % license delivers files that "%" doesn''t have. Upload them to the beat or turn the license off.', lic.name, missing
        using errcode = 'P0001';
    end if;
  end loop;
  if n = 0 then
    raise exception 'Turn on at least one license before publishing the pack "%"', p.title using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.beat_packs_publishable_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_pack_publishable(new.id);
  return null;
end;
$$;

create or replace function public.beat_pack_parts_publishable_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_pack_publishable(new.pack_id);
  return null;
end;
$$;

drop trigger if exists beat_packs_publishable_check on public.beat_packs;
create constraint trigger beat_packs_publishable_check
  after insert or update on public.beat_packs
  deferrable initially deferred
  for each row execute function public.beat_packs_publishable_check();

-- Only adding or changing parts is checked: removing a beat (for example by
-- deleting it) never blocks; the pack is then simply not on sale.
drop trigger if exists beat_pack_items_publishable_check on public.beat_pack_items;
create constraint trigger beat_pack_items_publishable_check
  after insert or update on public.beat_pack_items
  deferrable initially deferred
  for each row execute function public.beat_pack_parts_publishable_check();

drop trigger if exists beat_pack_licenses_publishable_check on public.beat_pack_licenses;
create constraint trigger beat_pack_licenses_publishable_check
  after insert or update on public.beat_pack_licenses
  deferrable initially deferred
  for each row execute function public.beat_pack_parts_publishable_check();

-- ------------------------------------------------------------ row security --
alter table public.beat_packs enable row level security;
alter table public.beat_pack_items enable row level security;
alter table public.beat_pack_licenses enable row level security;

drop policy if exists "published packs are public; owners and admins see theirs" on public.beat_packs;
create policy "published packs are public; owners and admins see theirs"
  on public.beat_packs for select
  to anon, authenticated
  using (status = 'published' or producer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "sellers create their own packs" on public.beat_packs;
create policy "sellers create their own packs"
  on public.beat_packs for insert
  to authenticated
  with check ((producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()));

drop policy if exists "sellers update their own packs, admins any" on public.beat_packs;
create policy "sellers update their own packs, admins any"
  on public.beat_packs for update
  to authenticated
  using ((producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
  with check ((producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()));

drop policy if exists "sellers delete their own packs, admins any" on public.beat_packs;
create policy "sellers delete their own packs, admins any"
  on public.beat_packs for delete
  to authenticated
  using ((producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()));

drop policy if exists "pack beats are visible with the pack" on public.beat_pack_items;
create policy "pack beats are visible with the pack"
  on public.beat_pack_items for select
  to anon, authenticated
  using (exists (select 1 from public.beat_packs p where p.id = beat_pack_items.pack_id));

drop policy if exists "owners add their own beats to their packs" on public.beat_pack_items;
create policy "owners add their own beats to their packs"
  on public.beat_pack_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.beat_packs p join public.beats b on b.id = beat_pack_items.beat_id
      where p.id = beat_pack_items.pack_id
        and b.producer_id = p.producer_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

drop policy if exists "owners reorder beats in their packs" on public.beat_pack_items;
create policy "owners reorder beats in their packs"
  on public.beat_pack_items for update
  to authenticated
  using (
    exists (
      select 1 from public.beat_packs p
      where p.id = beat_pack_items.pack_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.beat_packs p join public.beats b on b.id = beat_pack_items.beat_id
      where p.id = beat_pack_items.pack_id
        and b.producer_id = p.producer_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

drop policy if exists "owners remove beats from their packs" on public.beat_pack_items;
create policy "owners remove beats from their packs"
  on public.beat_pack_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.beat_packs p
      where p.id = beat_pack_items.pack_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

drop policy if exists "pack licenses are visible with the pack" on public.beat_pack_licenses;
create policy "pack licenses are visible with the pack"
  on public.beat_pack_licenses for select
  to anon, authenticated
  using (exists (select 1 from public.beat_packs p where p.id = beat_pack_licenses.pack_id));

drop policy if exists "owners manage their pack licenses" on public.beat_pack_licenses;
create policy "owners manage their pack licenses"
  on public.beat_pack_licenses for all
  to authenticated
  using (
    exists (
      select 1 from public.beat_packs p
      where p.id = beat_pack_licenses.pack_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.beat_packs p
      where p.id = beat_pack_licenses.pack_id
        and ((p.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

-- Same rule as every other table (file 6).
drop policy if exists require_two_factor on public.beat_packs;
create policy require_two_factor on public.beat_packs as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists require_two_factor on public.beat_pack_items;
create policy require_two_factor on public.beat_pack_items as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists require_two_factor on public.beat_pack_licenses;
create policy require_two_factor on public.beat_pack_licenses as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- ------------------------------------------------------------ read model --
-- Pack cards for lists and pages. Runs with the reader's rights: visitors only
-- count published beats, so "available" is false while any beat is missing.
create or replace view public.pack_cards
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.title,
  p.description,
  p.cover_path,
  p.status,
  p.is_featured,
  p.sales_count,
  p.rejection_reason,
  p.published_at,
  p.created_at,
  p.producer_id,
  pr.username as producer_username,
  coalesce(nullif(pr.producer_name, ''), nullif(pr.display_name, ''), pr.username) as producer_name,
  pr.avatar_path as producer_avatar_path,
  pr.is_verified as producer_verified,
  s.beats_count,
  s.available_count,
  (s.beats_count >= 2 and s.available_count = s.beats_count) as available,
  s.genres,
  l.min_price_eur,
  l.min_price_pln,
  l.min_price_usd
from public.beat_packs p
join public.profiles pr on pr.id = p.producer_id
cross join lateral (
  select
    count(*)::int as beats_count,
    (count(b.id) filter (where b.status = 'published' and b.exclusive_sold_at is null))::int as available_count,
    coalesce(array_agg(distinct g.name) filter (where g.name is not null), '{}') as genres
  from public.beat_pack_items i
  left join public.beats b on b.id = i.beat_id
  left join public.genres g on g.slug = b.genre
  where i.pack_id = p.id
) s
cross join lateral (
  select
    min(pl.price_eur) filter (where pl.enabled) as min_price_eur,
    min(pl.price_pln) filter (where pl.enabled) as min_price_pln,
    min(pl.price_usd) filter (where pl.enabled) as min_price_usd
  from public.beat_pack_licenses pl
  where pl.pack_id = p.id
) l;

-- ------------------------------------------------------------- save_pack --
-- Saves a pack, its beats (in order) and its licenses in one go, as the
-- signed-in producer (Row Level Security and the triggers above apply).
-- p_apply_cover gives every beat in the pack the pack's cover.
-- Publishing a pack also publishes its draft beats (or sends them to review).
create or replace function public.save_pack(
  p_pack jsonb,
  p_beat_ids uuid[],
  p_licenses jsonb,
  p_status public.beat_status default null,
  p_apply_cover boolean default false
)
returns public.beat_packs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid := coalesce(nullif(p_pack ->> 'id', '')::uuid, gen_random_uuid());
  v_row public.beat_packs;
  v_beats uuid[];
  v_lic jsonb;
  v_types public.license_type[] := '{}';
  v_sort smallint := 0;
  v_target public.beat_status;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  if p_licenses is null or jsonb_typeof(p_licenses) <> 'array' then
    raise exception 'Licenses must be an array' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('draft', 'published', 'archived') then
    raise exception 'A pack can be saved as a draft, published or archived' using errcode = '22023';
  end if;

  -- Beats in the order given, without duplicates.
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_beats
  from (
    select t.id, min(t.ord) as ord
    from unnest(coalesce(p_beat_ids, '{}')) with ordinality as t(id, ord)
    where t.id is not null
    group by t.id
  ) x;
  if cardinality(v_beats) > 50 then
    raise exception 'A pack can have up to 50 beats' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.beat_packs where id = v_id) then
    begin
      insert into public.beat_packs (id, producer_id, title, description, cover_path, status)
      values (
        v_id,
        v_uid,
        p_pack ->> 'title',
        nullif(p_pack ->> 'description', ''),
        nullif(p_pack ->> 'cover_path', ''),
        'draft'
      )
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Pack not found or you do not have permission to edit it' using errcode = '42501';
    end;
  else
    update public.beat_packs set
      title = p_pack ->> 'title',
      description = nullif(p_pack ->> 'description', ''),
      cover_path = nullif(p_pack ->> 'cover_path', '')
    where id = v_id
    returning * into v_row;
    if not found then
      raise exception 'Pack not found or you do not have permission to edit it' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1 from unnest(v_beats) as b(id)
    where not exists (select 1 from public.beats x where x.id = b.id and x.producer_id = v_row.producer_id)
  ) then
    raise exception 'permission denied: a pack can only contain your own beats' using errcode = '42501';
  end if;

  delete from public.beat_pack_items where pack_id = v_id and not (beat_id = any (v_beats));
  insert into public.beat_pack_items (pack_id, beat_id, position)
  select v_id, b.id, (b.ord - 1)::smallint
  from unnest(v_beats) with ordinality as b(id, ord)
  on conflict (pack_id, beat_id) do update set position = excluded.position;

  for v_lic in select value from jsonb_array_elements(p_licenses) loop
    v_types := v_types || (v_lic ->> 'type')::public.license_type;
    v_sort := v_sort + 1;
    insert into public.beat_pack_licenses as l (
      pack_id, type, name, price_eur, price_pln, price_usd, enabled, includes_mp3, includes_wav, includes_stems,
      distribution_limit, streams_limit, music_videos, radio_stations,
      allow_live_performances, allow_for_profit, terms, sort_order
    ) values (
      v_id,
      (v_lic ->> 'type')::public.license_type,
      v_lic ->> 'name',
      coalesce((v_lic ->> 'price_eur')::integer, 0),
      coalesce((v_lic ->> 'price_pln')::integer, 0),
      coalesce((v_lic ->> 'price_usd')::integer, 0),
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
    on conflict (pack_id, type) do update set
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
  delete from public.beat_pack_licenses where pack_id = v_id and not (type = any (v_types));

  -- One cover for the whole pack.
  if coalesce(p_apply_cover, false) and v_row.cover_path is not null then
    update public.beats set cover_path = v_row.cover_path
    where id = any (v_beats) and cover_path is distinct from v_row.cover_path and not admin_locked;
  end if;

  v_target := p_status;
  if p_status = 'published' then
    -- Draft beats go live with the pack (or to review where approval is needed).
    update public.beats set status = 'published'
    where id = any (v_beats) and status = 'draft' and not admin_locked and exclusive_sold_at is null;
    -- Beats waiting for review take the pack with them.
    if exists (select 1 from public.beats where id = any (v_beats) and status = 'pending') then
      v_target := 'pending';
    end if;
  end if;
  if v_target is not null and v_target is distinct from v_row.status then
    update public.beat_packs set status = v_target where id = v_id;
  end if;

  select * into v_row from public.beat_packs where id = v_id;
  return v_row;
end;
$$;

-- ------------------------------------------------------- orders & refunds --
-- Unchanged from files 3 and 9 except for the pack parts.
drop function if exists public.create_pending_order(uuid, text, public.currency_code, uuid[]);

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

    insert into public.order_items (
      order_id, buyer_id, beat_id, license_id, pack_id, pack_license_id, seller_id, license_type, license_name,
      beat_title, producer_name, license_snapshot, currency, price, platform_fee, seller_amount
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
      p_currency, v_price, v_fee, v_price - v_fee
    );

    v_total := v_total + v_price;
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_ids) + cardinality(v_pack_ids) then
    raise exception 'Some items in your cart are no longer available' using errcode = 'P0001';
  end if;

  update public.orders set subtotal = v_total, total = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total', v_total,
    'currency', p_currency,
    'items', (
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'beat_id', oi.beat_id, 'pack_id', oi.pack_id,
        'license_id', coalesce(oi.license_id, oi.pack_license_id), 'beat_title', oi.beat_title,
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
          'order_item_id', it.id, 'amount', it.price, 'beat_title', it.beat_title, 'reason', 'unavailable'
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

create or replace function public.apply_order_refund(p_order_id uuid, p_refunded_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_full boolean;
  v_pack_items uuid[] := '{}';
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
      select pu.*, oi.price, oi.pack_id from public.purchases pu
      join public.order_items oi on oi.id = pu.order_item_id
      where pu.order_id = p_order_id and pu.revoked_at is null
    loop
      update public.purchases set revoked_at = now() where id = r.id;
      if r.license_type = 'exclusive' then
        update public.beats set exclusive_sold_at = null, exclusive_buyer_id = null, status = 'draft'
        where id = r.beat_id and exclusive_buyer_id = r.buyer_id;
      end if;
      if r.price > 0 and r.pack_id is null then
        update public.beats set sales_count = greatest(sales_count - 1, 0) where id = r.beat_id;
      elsif r.price > 0 and not (r.order_item_id = any (v_pack_items)) then
        -- A pack counts as one sale, however many beats it has.
        v_pack_items := v_pack_items || r.order_item_id;
        update public.beat_packs set sales_count = greatest(sales_count - 1, 0) where id = r.pack_id;
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

-- ------------------------------------------------------------- privileges --
revoke all on public.beat_packs, public.beat_pack_items, public.beat_pack_licenses from anon, authenticated;
grant select on public.beat_packs, public.beat_pack_items, public.beat_pack_licenses to anon;
grant select, insert, update, delete on public.beat_packs, public.beat_pack_items, public.beat_pack_licenses to authenticated;
grant all on public.beat_packs, public.beat_pack_items, public.beat_pack_licenses to service_role;
grant select on public.pack_cards to anon, authenticated, service_role;

revoke execute on function public.save_pack(jsonb, uuid[], jsonb, public.beat_status, boolean) from public, anon;
grant execute on function public.save_pack(jsonb, uuid[], jsonb, public.beat_status, boolean) to authenticated, service_role;
grant execute on function public.unique_pack_slug(text, uuid) to authenticated, service_role;
revoke execute on function public.assert_pack_publishable(uuid) from public, anon, authenticated;
grant execute on function public.assert_pack_publishable(uuid) to service_role;

-- Orders stay server-only (the service role).
revoke execute on function public.create_pending_order(uuid, text, public.currency_code, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.create_pending_order(uuid, text, public.currency_code, uuid[], uuid[]) to service_role;
revoke execute on function public.fulfill_order(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid, text, text, text) to service_role;
revoke execute on function public.apply_order_refund(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_order_refund(uuid, integer) to service_role;

notify pgrst, 'reload schema';
