-- =============================================================================
-- NOIRWAVE — core schema
-- Tables, enums, helper functions and indexes.
-- Authorization is enforced here (RLS + guarded triggers), never in the UI.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('buyer', 'seller', 'admin');
create type public.beat_status as enum ('draft', 'pending', 'published', 'rejected', 'archived');
create type public.license_type as enum ('free', 'basic', 'premium', 'trackout', 'unlimited', 'exclusive');
create type public.order_status as enum ('pending', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded');
create type public.earning_status as enum ('pending', 'paid', 'retained', 'reversed');
create type public.currency_code as enum ('eur', 'pln');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

-- True when the statement runs as a privileged database role: the service role
-- (server-side code), postgres (migrations / SQL editor) or inside a
-- SECURITY DEFINER function. Requests from browsers run as anon/authenticated.
create or replace function public.is_trusted_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated');
$$;

create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array_to_string(arr, sep);
$$;

create or replace function public.slugify(value text)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

-- Builds a prefix tsquery ("dark trap" -> 'dark':* & 'trap':*) from free text.
create or replace function public.prefix_tsquery(q text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select case
    when s.w is null then null
    else to_tsquery('simple', s.w)
  end
  from (
    select string_agg(quote_literal(t) || ':*', ' & ') as w
    from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(q, ''), '[^[:alnum:][:space:]]', ' ', 'g')), '\s+')) as t
    where t <> ''
  ) as s;
$$;

create or replace function public.escape_like(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(value, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Platform settings (singleton row, editable by admins only)
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true constraint platform_settings_singleton check (id),
  platform_fee_percent numeric(5, 2) not null default 20
    check (platform_fee_percent >= 0 and platform_fee_percent <= 100),
  require_beat_approval boolean not null default true,
  seller_signups_open boolean not null default true,
  eur_to_pln numeric(8, 4) not null default 4.25 check (eur_to_pln > 0),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true);

create trigger platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Genres
-- -----------------------------------------------------------------------------
create table public.genres (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.genres (slug, name, sort_order) values
  ('trap', 'Trap', 1),
  ('drill', 'Drill', 2),
  ('hip-hop', 'Hip-Hop', 3),
  ('rnb', 'R&B', 4),
  ('afrobeat', 'Afrobeat', 5),
  ('pluggnb', 'PluggnB', 6),
  ('jersey-club', 'Jersey Club', 7),
  ('boom-bap', 'Boom Bap', 8),
  ('pop', 'Pop', 9);

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  producer_name text check (char_length(producer_name) <= 60),
  bio text check (char_length(bio) <= 1200),
  location text check (char_length(location) <= 80),
  avatar_path text,
  banner_path text,
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  role public.user_role not null default 'buyer',
  is_featured boolean not null default false,
  is_verified boolean not null default false,
  seller_since timestamptz,
  license_defaults jsonb check (license_defaults is null or jsonb_typeof(license_defaults) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where role <> 'buyer';
create index profiles_username_trgm_idx on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_producer_name_trgm_idx on public.profiles using gin (producer_name extensions.gin_trgm_ops);

-- Role helpers. SECURITY DEFINER so they can be used inside RLS policies
-- without recursion; they only ever look at the caller's own row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.is_seller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('seller', 'admin') from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Create a profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  attempts integer := 0;
begin
  base := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1), 'user'));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then
    base := base || 'user';
  end if;
  base := left(base, 20);
  candidate := base;

  while exists (select 1 from public.profiles where username = candidate) loop
    attempts := attempts + 1;
    candidate := left(base, 18) || lpad(floor(random() * 10000)::int::text, 4, '0');
    if attempts > 25 then
      candidate := left('user' || replace(gen_random_uuid()::text, '-', ''), 24);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own profile, but never their role / featured / verified flags.
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.username := lower(btrim(new.username));

  if new.id is distinct from old.id then
    raise exception 'permission denied: profile id is immutable' using errcode = '42501';
  end if;

  if not (public.is_trusted_context() or public.is_admin()) then
    if new.role is distinct from old.role
       or new.is_featured is distinct from old.is_featured
       or new.is_verified is distinct from old.is_verified
       or new.seller_since is distinct from old.seller_since then
      raise exception 'permission denied: protected profile fields' using errcode = '42501';
    end if;
    if (new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null
          and (split_part(new.avatar_path, '/', 1) <> new.id::text or position('..' in new.avatar_path) > 0))
       or (new.banner_path is distinct from old.banner_path and new.banner_path is not null
          and (split_part(new.banner_path, '/', 1) <> new.id::text or position('..' in new.banner_path) > 0)) then
      raise exception 'permission denied: images must be uploaded to your own folder' using errcode = '42501';
    end if;
  end if;

  -- Never allow the last administrator to be demoted.
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'At least one administrator account must remain' using errcode = 'P0001';
  end if;

  if new.role in ('seller', 'admin') and new.seller_since is null then
    new.seller_since := now();
  end if;

  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- -----------------------------------------------------------------------------
-- Beats
-- -----------------------------------------------------------------------------
create or replace function public.valid_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(t) between 1 and 30), true) from unnest(tags) as t;
$$;

create table public.beats (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 5000),
  genre text not null references public.genres (slug) on update cascade,
  moods text[] not null default '{}'
    check (moods <@ array['dark', 'melodic', 'emotional', 'energetic', 'chill', 'aggressive']::text[]),
  tags text[] not null default '{}' check (cardinality(tags) <= 12 and public.valid_tags(tags)),
  bpm smallint not null check (bpm between 40 and 220),
  key_note smallint not null check (key_note between 0 and 11),
  key_mode text not null check (key_mode in ('major', 'minor')),
  -- Relative-major pitch class: "C Major / A Minor" share key_group 0, etc.
  key_group smallint generated always as (
    case when key_mode = 'major' then key_note else ((key_note + 3) % 12)::smallint end
  ) stored,
  cover_path text,
  preview_path text,
  mp3_path text,
  wav_path text,
  stems_path text,
  duration_seconds integer check (duration_seconds >= 0),
  waveform jsonb check (waveform is null or jsonb_typeof(waveform) = 'array'),
  status public.beat_status not null default 'draft',
  rejection_reason text check (char_length(rejection_reason) <= 1000),
  admin_locked boolean not null default false,
  is_featured boolean not null default false,
  featured_at timestamptz,
  exclusive_sold_at timestamptz,
  exclusive_buyer_id uuid references public.profiles (id) on delete set null,
  plays_count integer not null default 0,
  favorites_count integer not null default 0,
  sales_count integer not null default 0,
  rating_avg numeric(3, 2),
  rating_count integer not null default 0,
  min_price_eur integer,
  min_price_pln integer,
  has_free boolean not null default false,
  has_exclusive boolean not null default false,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' || coalesce(genre, '') || ' ' ||
      public.immutable_array_to_string(tags, ' ') || ' ' ||
      public.immutable_array_to_string(moods, ' ')
    )
  ) stored,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index beats_producer_idx on public.beats (producer_id, created_at desc);
create index beats_status_idx on public.beats (status, submitted_at);
create index beats_published_at_idx on public.beats (published_at desc) where status = 'published';
create index beats_created_at_pub_idx on public.beats (created_at desc) where status = 'published';
create index beats_sales_idx on public.beats (sales_count desc) where status = 'published';
create index beats_plays_idx on public.beats (plays_count desc) where status = 'published';
create index beats_bpm_idx on public.beats (bpm) where status = 'published';
create index beats_key_group_idx on public.beats (key_group) where status = 'published';
create index beats_genre_idx on public.beats (genre) where status = 'published';
create index beats_featured_idx on public.beats (featured_at desc) where is_featured and status = 'published';
create index beats_min_price_eur_idx on public.beats (min_price_eur) where status = 'published';
create index beats_min_price_pln_idx on public.beats (min_price_pln) where status = 'published';
create index beats_moods_idx on public.beats using gin (moods);
create index beats_tags_idx on public.beats using gin (tags);
create index beats_search_idx on public.beats using gin (search_vector);
create index beats_title_trgm_idx on public.beats using gin (title extensions.gin_trgm_ops);

-- SECURITY DEFINER so collisions with beats hidden by RLS are detected too.
create or replace function public.unique_beat_slug(p_title text, p_id uuid)
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
    base := 'beat';
  end if;
  base := trim(both '-' from base);
  loop
    candidate := base || '-' || substr(hex, 1, len);
    exit when not exists (select 1 from public.beats where slug = candidate) or len >= 32;
    len := len + 2;
  end loop;
  return candidate;
end;
$$;

-- Validates storage paths: files must live in the producer's own folder.
create or replace function public.beat_path_ok(p_path text, p_producer uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is null
    or (split_part(p_path, '/', 1) = p_producer::text and position('..' in p_path) = 0 and char_length(p_path) <= 512);
$$;

-- Core guard for beats: protects moderation/stat fields from sellers and
-- applies status side-effects.
create or replace function public.beats_before_write()
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

  -- Normalisation
  new.title := btrim(new.title);
  new.tags := coalesce(
    (select array_agg(t order by t) from (
      select distinct left(lower(btrim(x)), 30) as t from unnest(new.tags) as x
    ) as s where t <> ''),
    '{}'
  );
  new.moods := coalesce((select array_agg(distinct m order by m) from unnest(new.moods) as m), '{}');

  if not v_privileged then
    if not (public.beat_path_ok(new.cover_path, new.producer_id)
        and public.beat_path_ok(new.preview_path, new.producer_id)
        and public.beat_path_ok(new.mp3_path, new.producer_id)
        and public.beat_path_ok(new.wav_path, new.producer_id)
        and public.beat_path_ok(new.stems_path, new.producer_id)) then
      raise exception 'permission denied: files must be uploaded to your own folder' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.unique_beat_slug(new.title, new.id);
    end if;

    if not v_privileged then
      new.is_featured := false;
      new.featured_at := null;
      new.admin_locked := false;
      new.rejection_reason := null;
      new.exclusive_sold_at := null;
      new.exclusive_buyer_id := null;
      new.plays_count := 0;
      new.favorites_count := 0;
      new.sales_count := 0;
      new.rating_avg := null;
      new.rating_count := 0;
      new.min_price_eur := null;
      new.min_price_pln := null;
      new.has_free := false;
      new.has_exclusive := false;
      new.submitted_at := null;
      new.approved_at := null;
      new.published_at := null;
      -- A new beat starts as a draft; licenses are attached before it can be published.
      new.status := 'draft';
    end if;
  else
    if not v_privileged then
      if new.producer_id is distinct from old.producer_id
         or new.slug is distinct from old.slug
         or new.is_featured is distinct from old.is_featured
         or new.featured_at is distinct from old.featured_at
         or new.admin_locked is distinct from old.admin_locked
         or new.exclusive_sold_at is distinct from old.exclusive_sold_at
         or new.exclusive_buyer_id is distinct from old.exclusive_buyer_id
         or new.plays_count is distinct from old.plays_count
         or new.favorites_count is distinct from old.favorites_count
         or new.sales_count is distinct from old.sales_count
         or new.rating_avg is distinct from old.rating_avg
         or new.rating_count is distinct from old.rating_count
         or new.min_price_eur is distinct from old.min_price_eur
         or new.min_price_pln is distinct from old.min_price_pln
         or new.has_free is distinct from old.has_free
         or new.has_exclusive is distinct from old.has_exclusive
         or new.submitted_at is distinct from old.submitted_at
         or new.approved_at is distinct from old.approved_at
         or new.published_at is distinct from old.published_at
         or new.rejection_reason is distinct from old.rejection_reason then
        raise exception 'permission denied: protected beat fields' using errcode = '42501';
      end if;

      if old.admin_locked then
        raise exception 'This beat has been locked by an administrator' using errcode = '42501';
      end if;

      if new.status is distinct from old.status then
        if new.status = 'rejected' then
          raise exception 'permission denied: only administrators can reject beats' using errcode = '42501';
        end if;
        if old.exclusive_sold_at is not null and new.status in ('pending', 'published') then
          raise exception 'This beat was sold under an exclusive license and cannot be republished' using errcode = 'P0001';
        end if;
        -- Sellers can only self-publish beats that were approved before
        -- (or when the owner has turned approval off).
        if new.status = 'published' and v_approval_required and old.approved_at is null then
          new.status := 'pending';
        end if;
      end if;
    end if;
  end if;

  -- Status side-effects (all callers)
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    new.submitted_at := now();
    new.rejection_reason := null;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.approved_at := coalesce(new.approved_at, now());
    new.published_at := coalesce(new.published_at, now());
    new.rejection_reason := null;
  end if;

  if new.is_featured and (tg_op = 'INSERT' or not old.is_featured) then
    new.featured_at := now();
  elsif not new.is_featured then
    new.featured_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger beats_before_write
  before insert or update on public.beats
  for each row execute function public.beats_before_write();

-- -----------------------------------------------------------------------------
-- Beat licenses
-- -----------------------------------------------------------------------------
create table public.beat_licenses (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  type public.license_type not null,
  name text not null check (char_length(name) between 1 and 60),
  price_eur integer not null check (price_eur between 0 and 10000000),
  price_pln integer not null check (price_pln between 0 and 50000000),
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
  unique (beat_id, type),
  constraint beat_licenses_price_rules check (
    (type = 'free' and price_eur = 0 and price_pln = 0)
    or (type <> 'free' and price_eur >= 50 and price_pln >= 200)
  )
);

create index beat_licenses_beat_idx on public.beat_licenses (beat_id);

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
  if new.type = 'free' then
    new.price_eur := 0;
    new.price_pln := 0;
    new.includes_mp3 := false;
    new.includes_wav := false;
    new.includes_stems := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger beat_licenses_before_write
  before insert or update on public.beat_licenses
  for each row execute function public.beat_licenses_before_write();

create or replace function public.refresh_beat_price_summary(p_beat_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.beats b set
    min_price_eur = s.min_eur,
    min_price_pln = s.min_pln,
    has_free = s.has_free,
    has_exclusive = s.has_excl
  from (
    select
      min(l.price_eur) filter (where l.enabled) as min_eur,
      min(l.price_pln) filter (where l.enabled) as min_pln,
      coalesce(bool_or(l.type = 'free' and l.enabled), false) as has_free,
      coalesce(bool_or(l.type = 'exclusive' and l.enabled), false) as has_excl
    from public.beat_licenses l
    where l.beat_id = p_beat_id
  ) as s
  where b.id = p_beat_id
    and (b.min_price_eur is distinct from s.min_eur
      or b.min_price_pln is distinct from s.min_pln
      or b.has_free is distinct from s.has_free
      or b.has_exclusive is distinct from s.has_excl);
$$;

create or replace function public.beat_licenses_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_beat_price_summary(coalesce(new.beat_id, old.beat_id));
  return null;
end;
$$;

create trigger beat_licenses_after_write
  after insert or update or delete on public.beat_licenses
  for each row execute function public.beat_licenses_after_write();

-- Deferred (commit-time) validation: a beat that is pending/published must be
-- complete. Running at commit lets a beat and its licenses be saved together.
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

create or replace function public.beats_publishable_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_beat_publishable(new.id);
  return null;
end;
$$;

create or replace function public.beat_licenses_publishable_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_beat_publishable(coalesce(new.beat_id, old.beat_id));
  return null;
end;
$$;

create constraint trigger beats_publishable_on_insert
  after insert on public.beats
  deferrable initially deferred
  for each row
  when (new.status in ('pending', 'published'))
  execute function public.beats_publishable_check();

create constraint trigger beats_publishable_on_update
  after update on public.beats
  deferrable initially deferred
  for each row
  when (
    new.status in ('pending', 'published')
    and (
      old.status is distinct from new.status
      or old.preview_path is distinct from new.preview_path
      or old.mp3_path is distinct from new.mp3_path
      or old.wav_path is distinct from new.wav_path
      or old.stems_path is distinct from new.stems_path
    )
  )
  execute function public.beats_publishable_check();

create constraint trigger beat_licenses_publishable
  after insert or update or delete on public.beat_licenses
  deferrable initially deferred
  for each row
  execute function public.beat_licenses_publishable_check();

-- -----------------------------------------------------------------------------
-- Daily stats (plays / sales per beat per day) — powers trending + charts
-- -----------------------------------------------------------------------------
create table public.beat_daily_stats (
  beat_id uuid not null references public.beats (id) on delete cascade,
  day date not null,
  plays integer not null default 0,
  sales integer not null default 0,
  primary key (beat_id, day)
);

create index beat_daily_stats_day_idx on public.beat_daily_stats (day desc);

-- -----------------------------------------------------------------------------
-- Favorites
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, beat_id)
);

create index favorites_beat_idx on public.favorites (beat_id, created_at desc);
create index favorites_user_idx on public.favorites (user_id, created_at desc);

create or replace function public.favorites_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.beats set favorites_count = favorites_count + 1 where id = new.beat_id;
  elsif tg_op = 'DELETE' then
    update public.beats set favorites_count = greatest(favorites_count - 1, 0) where id = old.beat_id;
  end if;
  return null;
end;
$$;

create trigger favorites_after_change
  after insert or delete on public.favorites
  for each row execute function public.favorites_after_change();

-- -----------------------------------------------------------------------------
-- Orders, order items, purchases
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 10001) unique,
  buyer_id uuid references public.profiles (id) on delete set null,
  buyer_email text not null,
  status public.order_status not null default 'pending',
  currency public.currency_code not null,
  subtotal integer not null default 0 check (subtotal >= 0),
  total integer not null default 0 check (total >= 0),
  refunded_amount integer not null default 0 check (refunded_amount >= 0),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  confirmation_sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_paid_at_idx on public.orders (paid_at desc) where status in ('paid', 'partially_refunded');
create index orders_payment_intent_idx on public.orders (stripe_payment_intent_id);

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid references public.profiles (id) on delete set null,
  beat_id uuid references public.beats (id) on delete set null,
  license_id uuid references public.beat_licenses (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  license_type public.license_type not null,
  license_name text not null,
  beat_title text not null,
  producer_name text not null,
  license_snapshot jsonb not null default '{}'::jsonb,
  currency public.currency_code not null,
  price integer not null check (price >= 0),
  platform_fee integer not null default 0 check (platform_fee >= 0),
  seller_amount integer not null default 0 check (seller_amount >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_seller_idx on public.order_items (seller_id, created_at desc);
create index order_items_beat_idx on public.order_items (beat_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  license_number text not null unique,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete restrict,
  license_id uuid references public.beat_licenses (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  license_type public.license_type not null,
  includes_mp3 boolean not null default false,
  includes_wav boolean not null default false,
  includes_stems boolean not null default false,
  license_snapshot jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index purchases_buyer_idx on public.purchases (buyer_id, created_at desc);
create index purchases_beat_idx on public.purchases (beat_id, buyer_id);

-- -----------------------------------------------------------------------------
-- Reviews (only verified buyers can review)
-- -----------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (beat_id, user_id)
);

create index reviews_beat_idx on public.reviews (beat_id, created_at desc);

create trigger reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create or replace function public.reviews_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beat uuid := coalesce(new.beat_id, old.beat_id);
begin
  update public.beats b set
    rating_avg = s.avg_rating,
    rating_count = s.cnt
  from (
    select round(avg(r.rating)::numeric, 2) as avg_rating, count(*)::int as cnt
    from public.reviews r where r.beat_id = v_beat
  ) as s
  where b.id = v_beat;
  return null;
end;
$$;

create trigger reviews_after_change
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- -----------------------------------------------------------------------------
-- Seller payouts
-- -----------------------------------------------------------------------------
create table public.seller_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  country text,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger seller_accounts_updated_at
  before update on public.seller_accounts
  for each row execute function public.set_updated_at();

create table public.seller_earnings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  beat_id uuid references public.beats (id) on delete set null,
  currency public.currency_code not null,
  gross integer not null check (gross >= 0),
  platform_fee integer not null check (platform_fee >= 0),
  net integer not null check (net >= 0),
  status public.earning_status not null default 'pending',
  stripe_transfer_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index seller_earnings_seller_idx on public.seller_earnings (seller_id, created_at desc);
create index seller_earnings_status_idx on public.seller_earnings (status, seller_id);
create index seller_earnings_order_idx on public.seller_earnings (order_id);

-- -----------------------------------------------------------------------------
-- Public read model for beat cards. security_invoker => RLS of beats applies.
-- -----------------------------------------------------------------------------
create view public.beat_cards
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
  p.is_verified as producer_verified
from public.beats b
join public.profiles p on p.id = b.producer_id
left join public.genres g on g.slug = b.genre;
