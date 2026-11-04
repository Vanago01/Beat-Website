-- Security & business-rule tests. Run against a LOCAL database only:
--   psql "$DB_URL" -v owner=<uuid> -v sa=<uuid> -v sb=<uuid> -v buyer=<uuid> -f supabase/tests/security_tests.sql
\set ON_ERROR_STOP on
\set QUIET on

create schema if not exists test;

-- Simulates a PostgREST request from a signed-in user (or anon when uid is null).
-- p_aal is the session's assurance level: 'aal2' after a two-factor sign-in.
create or replace function test.act_as(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', 'anon')::text
         else json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;
create or replace function test.act_as(p_uid uuid) returns void language sql as $$ select test.act_as(p_uid, 'aal1') $$;
grant usage on schema test to anon, authenticated;
grant execute on function test.act_as(uuid) to anon, authenticated;
grant execute on function test.act_as(uuid, text) to anon, authenticated;

create or replace function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label; else raise exception 'FAIL  %', label; end if;
end $$;
grant execute on function test.ok(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Setup: promote the owner to admin (only possible with database access).
update public.profiles set role = 'admin' where id = :'owner';

-- 1. A buyer cannot escalate their own role.
begin;
select test.act_as(:'buyer');
do $$ begin
  update public.profiles set role = 'admin' where id = auth.uid();
  perform test.ok(false, 'buyer cannot self-promote');
exception when insufficient_privilege then
  perform test.ok(true, 'buyer cannot self-promote');
end $$;
rollback;

-- 2. A buyer cannot edit someone else's profile (RLS hides the row).
begin;
select test.act_as(:'buyer');
do $$ declare n int; begin
  update public.profiles set bio = 'hacked' where username = 'sellera';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'buyer cannot edit another profile');
end $$;
rollback;

-- 3. Become a seller through the RPC.
begin;
select test.act_as(:'sa');
select (public.become_seller('Seller A Beats')).role as sa_role \gset
commit;
begin;
select test.act_as(:'sb');
select (public.become_seller('Seller B')).role as sb_role \gset
commit;
select test.ok(:'sa_role' = 'seller' and :'sb_role' = 'seller', 'become_seller promotes buyer to seller');

-- 4. Buyers cannot create beats.
begin;
select test.act_as(:'buyer');
do $$ begin
  insert into public.beats (producer_id, title, slug, genre, bpm, key_note, key_mode)
  values (auth.uid(), 'Nope', 'nope-1', 'trap', 140, 0, 'minor');
  perform test.ok(false, 'buyer cannot insert beats');
exception when insufficient_privilege then
  perform test.ok(true, 'buyer cannot insert beats');
end $$;
rollback;

-- 5. Seller A saves a complete beat and asks to publish -> goes to review.
begin;
select test.act_as(:'sa');
select (public.save_beat(
  jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'title', 'Midnight Run', 'genre', 'trap', 'bpm', 142, 'key_note', 9, 'key_mode', 'minor',
    'moods', jsonb_build_array('dark', 'energetic'), 'tags', jsonb_build_array('Travis', 'dark trap', 'dark trap'),
    'preview_path', :'sa' || '/11111111-1111-4111-8111-111111111111/preview.mp3',
    'mp3_path', :'sa' || '/11111111-1111-4111-8111-111111111111/full.mp3',
    'wav_path', :'sa' || '/11111111-1111-4111-8111-111111111111/full.wav',
    'stems_path', :'sa' || '/11111111-1111-4111-8111-111111111111/stems.zip',
    'duration_seconds', 180
  ),
  jsonb_build_array(
    jsonb_build_object('type', 'basic', 'name', 'Basic MP3', 'price_eur', 2999, 'price_pln', 12900, 'includes_mp3', true),
    jsonb_build_object('type', 'premium', 'name', 'Premium WAV', 'price_eur', 4999, 'price_pln', 21900, 'includes_mp3', true, 'includes_wav', true),
    jsonb_build_object('type', 'exclusive', 'name', 'Exclusive', 'price_eur', 49900, 'price_pln', 219900, 'includes_mp3', true, 'includes_wav', true, 'includes_stems', true)
  ),
  'published'
)).status as beat1_status \gset
commit;
select test.ok(:'beat1_status' = 'pending', 'seller publish request requires approval (status=pending)');
select test.ok((select tags = array['dark trap', 'travis'] from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'tags are normalised & de-duplicated');
select test.ok((select min_price_eur = 2999 and min_price_pln = 12900 and has_exclusive from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'price summary is denormalised from licenses');
select test.ok((select key_group = 0 from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'A minor maps to key group C major / A minor');

-- 6. Pending beats are invisible to the public.
begin;
select test.act_as(null);
select test.ok((select count(*) = 0 from public.beats), 'anon cannot see pending beats');
select test.ok((select (public.search_beats() ->> 'total')::int = 0), 'search_beats hides pending beats');
rollback;

-- 7. Sellers cannot feature their own beat or approve it.
begin;
select test.act_as(:'sa');
do $$ begin
  update public.beats set is_featured = true where id = '11111111-1111-4111-8111-111111111111';
  perform test.ok(false, 'seller cannot feature own beat');
exception when insufficient_privilege then
  perform test.ok(true, 'seller cannot feature own beat');
end $$;
rollback;

begin;
select test.act_as(:'sa');
do $$ begin
  update public.beats set approved_at = now() where id = '11111111-1111-4111-8111-111111111111';
  perform test.ok(false, 'seller cannot self-approve');
exception when insufficient_privilege then
  perform test.ok(true, 'seller cannot self-approve');
end $$;
rollback;

-- 8. Seller B cannot edit Seller A's beat, neither directly nor via save_beat.
begin;
select test.act_as(:'sb');
do $$ declare n int; begin
  update public.beats set title = 'stolen' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'other seller cannot update beat (RLS)');
end $$;
do $$ begin
  perform public.save_beat(
    jsonb_build_object('id', '11111111-1111-4111-8111-111111111111', 'title', 'stolen', 'genre', 'trap', 'bpm', 120, 'key_note', 0, 'key_mode', 'major'),
    '[]'::jsonb, null);
  perform test.ok(false, 'other seller cannot save_beat over existing beat');
exception when insufficient_privilege then
  perform test.ok(true, 'other seller cannot save_beat over existing beat');
end $$;
do $$ declare n int; begin
  delete from public.beats where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'other seller cannot delete beat');
end $$;
rollback;

-- 9. Seller B cannot point a beat at Seller A's private files.
begin;
select set_config('test.victim', :'sa', true);
select test.act_as(:'sb');
do $$ begin
  perform public.save_beat(
    jsonb_build_object('title', 'Thief', 'genre', 'drill', 'bpm', 140, 'key_note', 1, 'key_mode', 'minor',
      'wav_path', current_setting('test.victim') || '/11111111-1111-4111-8111-111111111111/full.wav'),
    '[]'::jsonb, null);
  perform test.ok(false, 'seller cannot reference files in another folder');
exception when insufficient_privilege then
  perform test.ok(true, 'seller cannot reference files in another folder');
end $$;
rollback;

-- 10. Publishing an incomplete beat fails at commit (deferred validation).
begin;
select test.act_as(:'sb');
set constraints all immediate;
do $$ begin
  perform public.save_beat(
    jsonb_build_object('title', 'No Preview', 'genre', 'drill', 'bpm', 140, 'key_note', 1, 'key_mode', 'minor'),
    jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic', 'price_eur', 1999, 'price_pln', 8900, 'includes_mp3', true)),
    'pending');
  perform test.ok(false, 'incomplete beat cannot be submitted');
exception when raise_exception then
  perform test.ok(sqlerrm like 'Upload a preview%', 'incomplete beat cannot be submitted (' || sqlerrm || ')');
end $$;
rollback;

-- 11. Admin approves; beat becomes public.
begin;
select test.act_as(:'owner', 'aal2');
update public.beats set status = 'published', is_featured = true where id = '11111111-1111-4111-8111-111111111111';
commit;
begin;
select test.act_as(null);
select test.ok((select count(*) = 1 from public.beats), 'anon sees published beat');
select test.ok((select (public.search_beats(p_query := 'midn') ->> 'total')::int = 1), 'prefix search finds "Midnight Run"');
select test.ok((select (public.search_beats(p_query := 'seller a') ->> 'total')::int = 1), 'search by producer name');
select test.ok((select (public.search_beats(p_keys := array[0], p_bpm_min := 140, p_bpm_max := 145) ->> 'total')::int = 1), 'key + bpm filter match');
select test.ok((select (public.search_beats(p_keys := array[2]) ->> 'total')::int = 0), 'key filter excludes other keys');
select test.ok((select (public.search_beats(p_moods := array['chill']) ->> 'total')::int = 0), 'mood filter excludes');
select test.ok((select (public.search_beats(p_price_max := 2000) ->> 'total')::int = 0), 'price filter excludes');
select test.ok((select (public.search_beats(p_exclusive_only := true, p_sort := 'trending') ->> 'total')::int = 1), 'exclusive filter + trending sort');
select test.ok((select count(*) = 3 from public.beat_licenses), 'anon sees licenses of published beat');
rollback;

-- 12. Seller can unpublish and re-publish an approved beat without re-review.
begin;
select test.act_as(:'sa');
update public.beats set status = 'draft' where id = '11111111-1111-4111-8111-111111111111';
update public.beats set status = 'published' where id = '11111111-1111-4111-8111-111111111111';
select test.ok((select status = 'published' from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'approved beat can be re-published by owner');
rollback;

-- 13. Reviews require a purchase.
begin;
select test.act_as(:'buyer');
do $$ begin
  insert into public.reviews (beat_id, user_id, rating, comment) values ('11111111-1111-4111-8111-111111111111', auth.uid(), 5, 'fire');
  perform test.ok(false, 'cannot review without purchase');
exception when insufficient_privilege then
  perform test.ok(true, 'cannot review without purchase');
end $$;
rollback;

-- 14. Order functions are NOT callable from the browser.
begin;
select test.act_as(:'buyer');
do $$ begin
  perform public.create_pending_order(auth.uid(), 'x@y.z', 'eur', array[(select id from public.beat_licenses limit 1)]);
  perform test.ok(false, 'browser cannot call create_pending_order');
exception when insufficient_privilege then
  perform test.ok(true, 'browser cannot call create_pending_order');
end $$;
do $$ begin
  perform public.fulfill_order('00000000-0000-0000-0000-000000000000');
  perform test.ok(false, 'browser cannot call fulfill_order');
exception when insufficient_privilege then
  perform test.ok(true, 'browser cannot call fulfill_order');
end $$;
select test.ok((select count(*) = 0 from public.orders), 'buyer sees no foreign orders');
rollback;

-- 15. Server-side checkout: create + fulfil an order (as service role).
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'pln',
  array[(select id from public.beat_licenses where type = 'premium' limit 1)]) ->> 'order_id') as order_id \gset
commit;
select test.ok((select total = 21900 and status = 'pending' from public.orders where id = :'order_id'), 'order priced from DB in PLN');
select test.ok((select platform_fee = 4380 and seller_amount = 17520 from public.order_items where order_id = :'order_id'), '20% platform fee split');
begin;
set local role service_role;
select (public.fulfill_order(:'order_id', 'pi_test', 'ch_test', 'cs_test') ->> 'fulfilled') as f1 \gset
select (public.fulfill_order(:'order_id', 'pi_test', 'ch_test', 'cs_test') ->> 'fulfilled') as f2 \gset
commit;
select test.ok(:'f1' = 'true' and :'f2' = 'false', 'fulfilment is idempotent');
select test.ok((select count(*) = 1 from public.purchases where order_id = :'order_id' and includes_wav), 'purchase grants WAV access');
select test.ok((select status = 'pending' and net = 17520 from public.seller_earnings where order_id = :'order_id'), 'seller earning recorded');
select test.ok((select sales_count = 1 from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'sales counter incremented');

-- 16. Buyer now sees their purchase + can review; seller sees the sale but not the order.
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 1 from public.purchases), 'buyer sees own purchase');
insert into public.reviews (beat_id, user_id, rating, comment) values ('11111111-1111-4111-8111-111111111111', auth.uid(), 5, 'Hard!');
commit;
select test.ok((select rating_avg = 5 and rating_count = 1 from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'rating aggregated');
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.order_items), 'seller sees their sold items');
select test.ok((select count(*) = 0 from public.orders), 'seller cannot read buyer orders');
select test.ok((select (public.seller_dashboard() ->> 'sales_count')::int = 1), 'seller dashboard counts sale');
rollback;

-- 17. Only admins can read the admin dashboard.
begin;
select test.act_as(:'sa');
do $$ begin
  perform public.admin_dashboard();
  perform test.ok(false, 'seller cannot read admin dashboard');
exception when insufficient_privilege then
  perform test.ok(true, 'seller cannot read admin dashboard');
end $$;
rollback;
begin;
select test.act_as(:'owner', 'aal2');
select test.ok((select (public.admin_dashboard() -> 'revenue' ->> 'pln')::int = 21900), 'admin dashboard revenue');
select test.ok((select (public.admin_list_users() ->> 'total')::int = 4), 'admin lists users with emails');
rollback;

-- 18. Exclusive purchase locks the beat; a concurrent second exclusive becomes a conflict.
begin;
set local role service_role;
select (public.create_pending_order(:'sb', 'sb@test.local', 'eur',
  array[(select id from public.beat_licenses where type = 'exclusive' limit 1)]) ->> 'order_id') as ex1 \gset
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'eur',
  array[(select id from public.beat_licenses where type = 'exclusive' limit 1)]) ->> 'order_id') as ex2 \gset
commit;
begin;
set local role service_role;
select public.fulfill_order(:'ex1') ->> 'conflicts' as c1 \gset
select public.fulfill_order(:'ex2') ->> 'conflicts' as c2 \gset
commit;
select test.ok(:'c1' = '[]' and :'c2' like '%exclusive_sold%', 'second exclusive buyer is flagged for refund');
select test.ok((select status = 'archived' and exclusive_sold_at is not null from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'exclusive sale archives beat');
select test.ok((select bool_and(not enabled) from public.beat_licenses where beat_id = '11111111-1111-4111-8111-111111111111'), 'exclusive sale disables all licenses');

begin;
select test.act_as(:'sa');
do $$ begin
  update public.beats set status = 'published' where id = '11111111-1111-4111-8111-111111111111';
  perform test.ok(false, 'exclusively sold beat cannot be republished');
exception when raise_exception then
  perform test.ok(true, 'exclusively sold beat cannot be republished');
end $$;
rollback;

begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 1 from public.beats), 'previous buyer still sees archived beat they own');
rollback;

-- 19. Last admin cannot be demoted.
begin;
select test.act_as(:'owner', 'aal2');
do $$ begin
  update public.profiles set role = 'buyer' where id = auth.uid();
  perform test.ok(false, 'last admin cannot be demoted');
exception when raise_exception then
  perform test.ok(true, 'last admin cannot be demoted');
end $$;
rollback;

-- 20. Refund revokes access.
begin;
set local role service_role;
select (public.apply_order_refund(:'order_id', 21900) ->> 'full') as refunded \gset
commit;
select test.ok(:'refunded' = 'true' and (select revoked_at is not null from public.purchases where order_id = :'order_id'), 'full refund revokes purchase');


-- ---------------------------------------------------------------------------
-- Two-factor authentication
-- 21. An admin without a two-factor sign-in has no admin powers.
begin;
select test.act_as(:'owner');
select test.ok(not public.is_admin(), 'admin without two-factor sign-in has no admin powers');
do $$ begin
  perform public.admin_dashboard();
  perform test.ok(false, 'admin dashboard requires two-factor sign-in');
exception when insufficient_privilege then
  perform test.ok(true, 'admin dashboard requires two-factor sign-in');
end $$;
do $$ declare n int; begin
  update public.beats set is_featured = false where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'admin without two-factor sign-in cannot moderate beats');
end $$;
rollback;
begin;
select test.act_as(:'owner', 'aal2');
select test.ok(public.is_admin(), 'admin with two-factor sign-in keeps admin powers');
rollback;

-- 22. Once a user sets up two-factor, a password-only session can't use the account.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('22222222-2222-4222-8222-222222222222', :'sb', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
select set_config('test.sb', :'sb', false);
begin;
select test.act_as(:'sb');
select test.ok((select count(*) = 0 from public.profiles where id = :'sb'), '2FA user: password-only session cannot read own profile');
select test.ok((select count(*) = 0 from public.beats where producer_id = :'sb'), '2FA user: password-only session cannot read own beats');
select test.ok(not public.is_seller(), '2FA seller: password-only session has no seller powers');
do $$ begin
  perform public.seller_dashboard();
  perform test.ok(false, '2FA seller: studio data needs the code');
exception when insufficient_privilege then
  perform test.ok(true, '2FA seller: studio data needs the code');
end $$;
do $$ begin
  perform public.become_seller('Hijacked');
  perform test.ok(false, '2FA user: password-only session cannot change the account');
exception when insufficient_privilege then
  perform test.ok(true, '2FA user: password-only session cannot change the account');
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name, owner) values ('covers', current_setting('test.sb') || '/x.jpg', current_setting('test.sb')::uuid);
  perform test.ok(false, '2FA user: password-only session cannot upload files');
exception when insufficient_privilege then
  perform test.ok(true, '2FA user: password-only session cannot upload files');
end $$;
rollback;
begin;
select test.act_as(:'sb', 'aal2');
select test.ok((select count(*) = 1 from public.profiles where id = :'sb'), '2FA user with the code reads own profile');
select test.ok(public.is_seller(), '2FA seller with the code has seller powers');
rollback;
delete from auth.mfa_factors where id = '22222222-2222-4222-8222-222222222222';
begin;
select test.act_as(:'sb');
select test.ok(public.is_seller(), 'users without two-factor are unaffected');
rollback;

\echo '--- all security tests passed ---'
