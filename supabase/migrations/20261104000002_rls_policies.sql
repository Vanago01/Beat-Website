-- =============================================================================
-- Row Level Security
-- Every table is locked down; access is granted explicitly per role.
-- `(select fn())` wrappers let Postgres evaluate helpers once per statement.
-- =============================================================================

alter table public.platform_settings enable row level security;
alter table public.genres enable row level security;
alter table public.profiles enable row level security;
alter table public.beats enable row level security;
alter table public.beat_licenses enable row level security;
alter table public.beat_daily_stats enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.purchases enable row level security;
alter table public.reviews enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.seller_earnings enable row level security;

-- ---------------------------------------------------------------- settings ---
create policy "settings are readable by everyone"
  on public.platform_settings for select
  to anon, authenticated
  using (true);

create policy "only admins update settings"
  on public.platform_settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ------------------------------------------------------------------ genres ---
create policy "genres are readable by everyone"
  on public.genres for select
  to anon, authenticated
  using (true);

create policy "only admins insert genres"
  on public.genres for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "only admins update genres"
  on public.genres for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "only admins delete genres"
  on public.genres for delete
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------- profiles ---
create policy "profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "users update their own profile, admins any"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- (no insert policy: profiles are created by the auth trigger)
-- (no delete policy: deleting the auth user cascades)

-- ------------------------------------------------------------------- beats ---
create policy "published beats are public; owners, buyers and admins see theirs"
  on public.beats for select
  to anon, authenticated
  using (
    status = 'published'
    or producer_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.purchases pu
      where pu.beat_id = beats.id and pu.buyer_id = (select auth.uid())
    )
  );

create policy "sellers create their own beats"
  on public.beats for insert
  to authenticated
  with check (
    (producer_id = (select auth.uid()) and (select public.is_seller()))
    or (select public.is_admin())
  );

create policy "sellers update their own beats, admins any"
  on public.beats for update
  to authenticated
  using (
    (producer_id = (select auth.uid()) and (select public.is_seller()))
    or (select public.is_admin())
  )
  with check (
    (producer_id = (select auth.uid()) and (select public.is_seller()))
    or (select public.is_admin())
  );

create policy "sellers delete their own beats, admins any"
  on public.beats for delete
  to authenticated
  using (
    (producer_id = (select auth.uid()) and (select public.is_seller()))
    or (select public.is_admin())
  );

-- ----------------------------------------------------------- beat licenses ---
create policy "licenses are visible when the beat is visible"
  on public.beat_licenses for select
  to anon, authenticated
  using (exists (select 1 from public.beats b where b.id = beat_licenses.beat_id));

create policy "owners add licenses to their beats"
  on public.beat_licenses for insert
  to authenticated
  with check (
    exists (
      select 1 from public.beats b
      where b.id = beat_licenses.beat_id
        and ((b.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

create policy "owners update licenses of their beats"
  on public.beat_licenses for update
  to authenticated
  using (
    exists (
      select 1 from public.beats b
      where b.id = beat_licenses.beat_id
        and ((b.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.beats b
      where b.id = beat_licenses.beat_id
        and ((b.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

create policy "owners delete licenses of their beats"
  on public.beat_licenses for delete
  to authenticated
  using (
    exists (
      select 1 from public.beats b
      where b.id = beat_licenses.beat_id
        and ((b.producer_id = (select auth.uid()) and (select public.is_seller())) or (select public.is_admin()))
    )
  );

-- -------------------------------------------------------------- daily stats ---
create policy "producers read stats of their beats, admins all"
  on public.beat_daily_stats for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.beats b
      where b.id = beat_daily_stats.beat_id and b.producer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------- favorites ---
create policy "users read their own favorites"
  on public.favorites for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users favorite visible beats"
  on public.favorites for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.beats b where b.id = favorites.beat_id)
  );

create policy "users remove their own favorites"
  on public.favorites for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ orders ---
-- Orders are written exclusively by trusted server code (service role).
create policy "buyers read their own orders, admins all"
  on public.orders for select
  to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()));

create policy "buyers and sellers read their order items, admins all"
  on public.order_items for select
  to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "buyers read their own purchases, admins all"
  on public.purchases for select
  to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()));

-- ----------------------------------------------------------------- reviews ---
create policy "reviews of visible beats are public"
  on public.reviews for select
  to anon, authenticated
  using (exists (select 1 from public.beats b where b.id = reviews.beat_id));

create policy "verified buyers write one review per beat"
  on public.reviews for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.purchases pu
      where pu.beat_id = reviews.beat_id
        and pu.buyer_id = (select auth.uid())
        and pu.revoked_at is null
    )
  );

create policy "authors update their reviews"
  on public.reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "authors and admins delete reviews"
  on public.reviews for delete
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Reviews can only change their rating/comment (not move to another beat).
revoke update on public.reviews from anon, authenticated;
grant update (rating, comment) on public.reviews to authenticated;

-- ----------------------------------------------------------- seller payouts ---
create policy "sellers read their payout account, admins all"
  on public.seller_accounts for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "sellers read their earnings, admins all"
  on public.seller_earnings for select
  to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

-- Anonymous visitors never need write access to anything.
revoke insert, update, delete on all tables in schema public from anon;
