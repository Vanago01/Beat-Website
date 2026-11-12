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
    jsonb_build_object('type', 'basic', 'name', 'Basic MP3', 'price_eur', 2999, 'price_pln', 12900, 'price_usd', 3299, 'includes_mp3', true),
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
select test.ok((select min_price_usd = 3299 from public.beats where id = '11111111-1111-4111-8111-111111111111')
  and (select price_usd = 5799 from public.beat_licenses where type = 'premium'), 'USD: prices given are kept, missing ones are suggested from EUR (€49.99 → $57.99)');

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

begin;
select test.act_as(:'sa');
do $$ begin
  update public.beats set min_price_usd = 1 where id = '11111111-1111-4111-8111-111111111111';
  perform test.ok(false, 'seller cannot change the USD price summary');
exception when insufficient_privilege then
  perform test.ok(true, 'seller cannot change the USD price summary');
end $$;
do $$ begin
  perform public.save_beat(
    jsonb_build_object('id', '44444444-4444-4444-8444-444444444444', 'title', 'Dollar Test', 'genre', 'trap', 'bpm', 120, 'key_note', 0, 'key_mode', 'major'),
    jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic', 'price_eur', 2999, 'price_pln', 12900, 'price_usd', 10, 'includes_mp3', true)),
    null);
  perform test.ok(false, 'paid licenses must cost at least $0.50');
exception when check_violation then
  perform test.ok(true, 'paid licenses must cost at least $0.50');
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
select test.ok((select (public.search_beats(p_currency := 'usd', p_price_max := 3298) ->> 'total')::int = 0
  and (public.search_beats(p_currency := 'usd', p_price_max := 3299) ->> 'total')::int = 1), 'price filter works in USD');
select test.ok((select (public.search_beats() -> 'items' -> 0 ->> 'min_price_usd')::int = 3299), 'search results include the USD price');
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

begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'usd',
  array[(select id from public.beat_licenses where type = 'basic' limit 1)]) ->> 'total') as usd_total \gset
rollback;
select test.ok(:'usd_total' = '3299', 'order priced from DB in USD');

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
select test.ok((select (public.seller_dashboard() -> 'monthly' -> 11) ? 'usd'), 'seller dashboard reports USD');
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
select test.ok((select (public.admin_dashboard() -> 'revenue' ->> 'usd')::int = 0 and (public.admin_dashboard() -> 'monthly' -> 0) ? 'usd'), 'admin dashboard reports USD');
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

-- ---------------------------------------------------------------------------
-- Direct messages
select set_config('test.sa', :'sa', false);
select set_config('test.buyer', :'buyer', false);

-- 23. One conversation per pair, whoever starts it.
begin;
select test.act_as(:'buyer');
select public.start_conversation(:'sa') as conv \gset
commit;
select set_config('test.conv', :'conv', false);
begin;
select test.act_as(:'buyer');
select test.ok(public.start_conversation(:'sa') = :'conv', 'starting again opens the same conversation');
rollback;
begin;
select test.act_as(:'sa');
select test.ok(public.start_conversation(:'buyer') = :'conv', 'the other person gets the same conversation');
do $$ begin
  perform public.start_conversation(auth.uid());
  perform test.ok(false, 'nobody can message themselves');
exception when raise_exception then
  perform test.ok(true, 'nobody can message themselves');
end $$;
rollback;

-- 24. Visitors who aren't signed in can't use messages at all.
begin;
select test.act_as(null);
do $$ begin
  perform public.start_conversation(current_setting('test.sa')::uuid);
  perform test.ok(false, 'anon cannot start conversations');
exception when insufficient_privilege then
  perform test.ok(true, 'anon cannot start conversations');
end $$;
do $$ begin
  perform count(*) from public.messages;
  perform test.ok(false, 'anon cannot read messages');
exception when insufficient_privilege then
  perform test.ok(true, 'anon cannot read messages');
end $$;
rollback;

-- 25. Sending: text is tidied, empty or overlong messages are refused, and
--     nobody can write the tables directly.
begin;
select test.act_as(:'buyer');
select public.send_message(:'conv', E'  Hi! Is Midnight Run still available?\r\n\n\n\nThanks  ') ->> 'body' as body1 \gset
commit;
select test.ok(:'body1' = E'Hi! Is Midnight Run still available?\n\nThanks', 'message text is tidied (spaces, line breaks)');
begin;
select test.act_as(:'buyer');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, E'  \n\t ');
  perform test.ok(false, 'empty messages are refused');
exception when raise_exception then
  perform test.ok(true, 'empty messages are refused');
end $$;
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, repeat('x', 2001));
  perform test.ok(false, 'messages over 2,000 characters are refused');
exception when raise_exception then
  perform test.ok(true, 'messages over 2,000 characters are refused');
end $$;
do $$ begin
  insert into public.messages (conversation_id, sender_id, body) values (current_setting('test.conv')::uuid, auth.uid(), 'sneaky');
  perform test.ok(false, 'messages cannot be inserted directly');
exception when insufficient_privilege then
  perform test.ok(true, 'messages cannot be inserted directly');
end $$;
do $$ begin
  update public.conversation_members set last_read_at = now();
  perform test.ok(false, 'read state cannot be changed directly');
exception when insufficient_privilege then
  perform test.ok(true, 'read state cannot be changed directly');
end $$;
do $$ begin
  update public.messages set body = 'edited';
  perform test.ok(false, 'messages cannot be edited directly');
exception when insufficient_privilege then
  perform test.ok(true, 'messages cannot be edited directly');
end $$;
rollback;

-- 26. Only the two people in the conversation can read it.
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.messages where conversation_id = :'conv'), 'recipient reads the message');
select test.ok(public.unread_conversation_count() = 1, 'recipient has one unread conversation');
select test.ok((public.list_conversations() -> 0 -> 'other' ->> 'username') = 'buyerc'
  and (public.list_conversations() -> 0 ->> 'unread_count')::int = 1, 'inbox shows the conversation with its unread count');
select test.ok((public.get_conversation(:'conv') -> 'other' ->> 'username') = 'buyerc', 'chat screen shows who you are talking to');
rollback;
begin;
select test.act_as(:'sb');
select test.ok((select count(*) = 0 from public.messages), 'outsider cannot read the messages');
select test.ok((select count(*) = 0 from public.conversations), 'outsider cannot see the conversation');
select test.ok(public.get_conversation(:'conv') is null, 'outsider gets nothing from get_conversation');
select test.ok(public.list_conversations()::text = '[]', 'outsider inbox is empty');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, 'let me in');
  perform test.ok(false, 'outsider cannot post into the conversation');
exception when no_data_found then
  perform test.ok(true, 'outsider cannot post into the conversation');
end $$;
do $$ begin
  perform public.delete_conversation(current_setting('test.conv')::uuid);
  perform test.ok(false, 'outsider cannot delete the conversation');
exception when no_data_found then
  perform test.ok(true, 'outsider cannot delete the conversation');
end $$;
rollback;
begin;
select test.act_as(:'owner', 'aal2');
select test.ok((select count(*) = 0 from public.messages), 'administrators cannot read private messages');
rollback;

-- 27. Reading clears the badge; the sender sees it was read.
begin;
select test.act_as(:'sa');
select public.mark_conversation_read(:'conv');
select test.ok(public.unread_conversation_count() = 0, 'reading the conversation clears the unread badge');
commit;
begin;
select test.act_as(:'buyer');
select test.ok((public.get_conversation(:'conv') ->> 'other_read_at') is not null, 'sender can see the message was read');
select test.ok(public.unread_conversation_count() = 0, 'your own messages never count as unread');
rollback;

-- 28. At most 20 messages a minute.
begin;
select test.act_as(:'sa');
do $$ declare i int; begin
  for i in 1..20 loop
    perform public.send_message(current_setting('test.conv')::uuid, 'message ' || i);
  end loop;
  begin
    perform public.send_message(current_setting('test.conv')::uuid, 'one too many');
    perform test.ok(false, 'more than 20 messages a minute are refused');
  exception when raise_exception then
    perform test.ok(true, 'more than 20 messages a minute are refused');
  end;
end $$;
rollback;

-- 29. Blocking stops messages both ways and stays private.
begin;
select test.act_as(:'sa');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'buyer');
commit;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 0 from public.user_blocks), 'people cannot see who blocked them');
select test.ok((public.get_conversation(:'conv') ->> 'blocked_me')::boolean, 'chat screen knows you cannot reply');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, 'hello?');
  perform test.ok(false, 'a blocked person cannot send messages');
exception when raise_exception then
  perform test.ok(true, 'a blocked person cannot send messages');
end $$;
do $$ begin
  insert into public.user_blocks (blocker_id, blocked_id) values (current_setting('test.sa')::uuid, current_setting('test.sb')::uuid);
  perform test.ok(false, 'nobody can create a block for someone else');
exception when insufficient_privilege then
  perform test.ok(true, 'nobody can create a block for someone else');
end $$;
delete from public.user_blocks;
commit;
select test.ok((select count(*) = 1 from public.user_blocks where blocked_id = :'buyer'), 'nobody can remove a block made by someone else');
begin;
select test.act_as(:'sa');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, 'bye');
  perform test.ok(false, 'the blocker cannot send either until they unblock');
exception when raise_exception then
  perform test.ok(true, 'the blocker cannot send either until they unblock');
end $$;
delete from public.user_blocks where blocked_id = :'buyer';
commit;
begin;
select test.act_as(:'buyer');
select test.ok((public.send_message(:'conv', 'Unblocked!') ->> 'body') = 'Unblocked!', 'unblocking lets messages through again');
commit;

-- 30. "Delete conversation" hides it for you only; a new message brings it back.
begin;
select test.act_as(:'sa');
select public.delete_conversation(:'conv');
select test.ok(public.list_conversations()::text = '[]' and (select count(*) = 0 from public.messages), 'deleting hides the conversation and its history for you');
commit;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 2 from public.messages), 'the other person keeps their copy');
select public.send_message(:'conv', 'Still there?');
commit;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.messages) and json_array_length(public.list_conversations()) = 1
  and public.unread_conversation_count() = 1, 'a new message brings the conversation back without the old ones');
rollback;

-- 31. Two-factor: a password-only session can't read or send messages.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('33333333-3333-4333-8333-333333333333', :'sa', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.messages), '2FA user: password-only session cannot read messages');
select test.ok(public.unread_conversation_count() = 0 and public.get_conversation(:'conv') is null, '2FA user: password-only session sees no conversations');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, 'hi');
  perform test.ok(false, '2FA user: password-only session cannot send messages');
exception when insufficient_privilege then
  perform test.ok(true, '2FA user: password-only session cannot send messages');
end $$;
rollback;
begin;
select test.act_as(:'sa', 'aal2');
select test.ok((select count(*) = 1 from public.messages), '2FA user with the code reads messages');
rollback;
delete from auth.mfa_factors where id = '33333333-3333-4333-8333-333333333333';

-- 32. New messages are published to Realtime.
select test.ok((select count(*) = 2 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('messages', 'conversation_members')),
  'messages are published to Realtime');

-- 33. Refunds reverse the amount that was actually transferred (Stripe may
--     have converted a USD sale into the platform's currency).
begin;
with o as (
  insert into public.orders (buyer_id, buyer_email, currency, status, subtotal, total)
  values (:'buyer', 'buyerc@test.local', 'usd', 'paid', 1000, 1000) returning id
), i as (
  insert into public.order_items (order_id, buyer_id, seller_id, license_type, license_name, beat_title, producer_name, currency, price, platform_fee, seller_amount)
  select o.id, :'buyer', :'sa', 'basic', 'Basic', 'Test', 'Seller A', 'usd', 1000, 200, 800 from o returning id, order_id
)
insert into public.seller_earnings (seller_id, order_id, order_item_id, currency, gross, platform_fee, net, status, stripe_transfer_id, transfer_amount, transfer_currency)
select :'sa', i.order_id, i.id, 'usd', 1000, 200, 800, 'paid', 'tr_test', 3150, 'pln' from i
returning order_id as rev_order \gset
select test.ok((public.apply_order_refund(:'rev_order', 1000) -> 'transfers_to_reverse' -> 0 ->> 'amount')::int = 3150,
  'refunds reverse the converted amount that was transferred');
rollback;

-- ---------------------------------------------------------------------------
-- Beat packs
-- (some checks below run as the server's service role)
grant usage on schema test to service_role;
grant execute on function test.ok(boolean, text) to service_role;

-- 34. Seller B uploads two beats (the second without a WAV); an admin approves them.
begin;
select test.act_as(:'sb');
select (public.save_beat(
  jsonb_build_object('id', '55555555-5555-4555-8555-555555555551', 'title', 'Pack One', 'genre', 'trap', 'bpm', 140,
    'key_note', 0, 'key_mode', 'minor',
    'preview_path', :'sb' || '/55555555-5555-4555-8555-555555555551/preview.mp3',
    'mp3_path', :'sb' || '/55555555-5555-4555-8555-555555555551/full.mp3',
    'wav_path', :'sb' || '/55555555-5555-4555-8555-555555555551/full.wav'),
  jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic', 'price_eur', 2999, 'price_pln', 12900, 'price_usd', 3499, 'includes_mp3', true)),
  'published')).status as pb1 \gset
select (public.save_beat(
  jsonb_build_object('id', '55555555-5555-4555-8555-555555555552', 'title', 'Pack Two', 'genre', 'drill', 'bpm', 142,
    'key_note', 2, 'key_mode', 'minor',
    'preview_path', :'sb' || '/55555555-5555-4555-8555-555555555552/preview.mp3',
    'mp3_path', :'sb' || '/55555555-5555-4555-8555-555555555552/full.mp3'),
  jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic', 'price_eur', 2999, 'price_pln', 12900, 'price_usd', 3499, 'includes_mp3', true)),
  'published')).status as pb2 \gset
commit;
begin;
select test.act_as(:'owner', 'aal2');
update public.beats set status = 'published'
where id in ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552');
commit;
select test.ok(:'pb1' = 'pending' and (select count(*) = 2 from public.beats
  where id in ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552') and status = 'published'),
  'pack test beats are live after review');

-- 35. A pack from a seller's own beats goes to review, and its cover is used for every beat.
begin;
select test.act_as(:'sb');
select (public.save_pack(
  jsonb_build_object('id', '66666666-6666-4666-8666-666666666666', 'title', 'Night Pack', 'description', 'Two dark beats',
    'cover_path', :'sb' || '/packs/66666666-6666-4666-8666-666666666666/cover.jpg'),
  array['55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552']::uuid[],
  jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic MP3 (pack)', 'price_eur', 4999, 'price_pln', 21900,
    'price_usd', 5999, 'includes_mp3', true)),
  'published', true)).status as pack_status \gset
commit;
select test.ok(:'pack_status' = 'pending', 'publishing a pack sends it to review when approval is on');
select test.ok((select count(*) = 2 from public.beats
  where id in ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552')
    and cover_path = :'sb' || '/packs/66666666-6666-4666-8666-666666666666/cover.jpg'), 'the pack cover is used for every beat in it');
begin;
select test.act_as(null);
select test.ok((select count(*) = 0 from public.pack_cards), 'packs in review are hidden from visitors');
rollback;

-- 36. Packs only contain the producer's own beats, at least 2, with the files their licenses promise.
begin;
select test.act_as(:'sb');
set constraints all immediate;
do $$ begin
  perform public.save_pack(jsonb_build_object('title', 'Borrowed'),
    array['11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555551']::uuid[], '[]'::jsonb, 'draft', false);
  perform test.ok(false, 'a pack cannot contain another producer''s beat');
exception when insufficient_privilege then
  perform test.ok(true, 'a pack cannot contain another producer''s beat');
end $$;
do $$ begin
  perform public.save_pack(jsonb_build_object('title', 'Solo'), array['55555555-5555-4555-8555-555555555551']::uuid[],
    jsonb_build_array(jsonb_build_object('type', 'basic', 'name', 'Basic', 'price_eur', 999, 'price_pln', 3900, 'price_usd', 1199, 'includes_mp3', true)),
    'published', false);
  perform test.ok(false, 'a pack needs at least 2 beats to be published');
exception when raise_exception then
  perform test.ok(true, 'a pack needs at least 2 beats to be published');
end $$;
do $$ begin
  perform public.save_pack(jsonb_build_object('title', 'WAV pack'),
    array['55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552']::uuid[],
    jsonb_build_array(jsonb_build_object('type', 'premium', 'name', 'Premium', 'price_eur', 999, 'price_pln', 3900, 'price_usd', 1199,
      'includes_mp3', true, 'includes_wav', true)),
    'published', false);
  perform test.ok(false, 'a pack license cannot promise files a beat doesn''t have');
exception when raise_exception then
  perform test.ok(true, 'a pack license cannot promise files a beat doesn''t have');
end $$;
do $$ begin
  update public.beat_packs set sales_count = 99 where id = '66666666-6666-4666-8666-666666666666';
  perform test.ok(false, 'producers cannot change pack sales or moderation fields');
exception when insufficient_privilege then
  perform test.ok(true, 'producers cannot change pack sales or moderation fields');
end $$;
rollback;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.beat_packs where id = '66666666-6666-4666-8666-666666666666'), 'other producers cannot see a pack in review');
do $$ declare n int; begin
  update public.beat_packs set title = 'Hijacked' where id = '66666666-6666-4666-8666-666666666666';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'other producers cannot edit a pack');
end $$;
rollback;

-- 37. An admin approves the pack: visitors see it, complete and priced.
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'published' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(null);
select test.ok((select available and beats_count = 2 and min_price_eur = 4999 and min_price_usd = 5999
  from public.pack_cards where id = '66666666-6666-4666-8666-666666666666'), 'approved pack is public, complete and priced');
select test.ok((select count(*) = 2 from public.beat_pack_items where pack_id = '66666666-6666-4666-8666-666666666666')
  and (select count(*) = 1 from public.beat_pack_licenses where pack_id = '66666666-6666-4666-8666-666666666666'),
  'visitors see the beats and licenses of a pack');
rollback;

-- 38. Buying a pack: one order line, a license for every beat, one earning for the producer.
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'usd', '{}'::uuid[],
  array[(select id from public.beat_pack_licenses where pack_id = '66666666-6666-4666-8666-666666666666' and type = 'basic')])
  ->> 'order_id') as pack_order \gset
commit;
select test.ok((select total = 5999 and currency = 'usd' from public.orders where id = :'pack_order'), 'pack order priced from the pack license');
select test.ok((select pack_id = '66666666-6666-4666-8666-666666666666' and beat_id is null
  and jsonb_array_length(license_snapshot -> 'beats') = 2 from public.order_items where order_id = :'pack_order'),
  'the order line lists the beats in the pack');
begin;
set local role service_role;
select (public.fulfill_order(:'pack_order', 'pi_pack', 'ch_pack', 'cs_pack') ->> 'fulfilled') as pack_fulfilled \gset
commit;
select test.ok(:'pack_fulfilled' = 'true' and (select count(*) = 2 from public.purchases
  where order_id = :'pack_order' and includes_mp3 and not includes_wav and license_snapshot ->> 'pack_title' = 'Night Pack'),
  'buying a pack gives a license for every beat in it');
select test.ok((select count(*) = 1 and sum(net) = 4799 from public.seller_earnings where order_id = :'pack_order'),
  'the producer earns once for the pack (after the 20% fee)');
select test.ok((select sales_count = 1 from public.beat_packs where id = '66666666-6666-4666-8666-666666666666'), 'the pack sale is counted');
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 2 from public.purchases where order_id = :'pack_order'), 'the buyer sees every beat of the pack in their library');
rollback;

-- 39. Producers can't buy their own pack, and a pack isn't sold while a beat is offline.
begin;
set local role service_role;
do $$ begin
  perform public.create_pending_order(current_setting('test.sb')::uuid, 'sellerb@test.local', 'eur', '{}'::uuid[],
    array[(select id from public.beat_pack_licenses where pack_id = '66666666-6666-4666-8666-666666666666' and type = 'basic')]);
  perform test.ok(false, 'producers cannot buy their own pack');
exception when raise_exception then
  perform test.ok(true, 'producers cannot buy their own pack');
end $$;
rollback;
begin;
select test.act_as(:'sb');
update public.beats set status = 'draft' where id = '55555555-5555-4555-8555-555555555552';
commit;
begin;
select test.act_as(null);
select test.ok((select not available from public.pack_cards where id = '66666666-6666-4666-8666-666666666666'),
  'a pack is unavailable while one of its beats is offline');
rollback;
begin;
set local role service_role;
do $$ begin
  perform public.create_pending_order(current_setting('test.buyer')::uuid, 'buyerc@test.local', 'eur', '{}'::uuid[],
    array[(select id from public.beat_pack_licenses where pack_id = '66666666-6666-4666-8666-666666666666' and type = 'basic')]);
  perform test.ok(false, 'an unavailable pack cannot be bought');
exception when raise_exception then
  perform test.ok(true, 'an unavailable pack cannot be bought');
end $$;
rollback;
begin;
select test.act_as(:'sb');
update public.beats set status = 'published' where id = '55555555-5555-4555-8555-555555555552';
commit;

-- 40. Refunding a pack revokes every beat license in it.
begin;
set local role service_role;
select (public.apply_order_refund(:'pack_order', 5999) ->> 'full') as pack_refunded \gset
commit;
select test.ok(:'pack_refunded' = 'true'
  and (select bool_and(revoked_at is not null) from public.purchases where order_id = :'pack_order')
  and (select sales_count = 0 from public.beat_packs where id = '66666666-6666-4666-8666-666666666666'),
  'refunding a pack revokes every beat license and the sale');

-- 41. Two-factor: a password-only session can't touch a producer's packs.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('77777777-7777-4777-8777-777777777777', :'sb', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'sb');
select test.ok((select count(*) = 0 from public.beat_packs where producer_id = :'sb'), '2FA user: password-only session cannot see their packs');
do $$ declare n int; begin
  update public.beat_packs set title = 'Changed' where id = '66666666-6666-4666-8666-666666666666';
  get diagnostics n = row_count;
  perform test.ok(n = 0, '2FA user: password-only session cannot edit their packs');
end $$;
rollback;
delete from auth.mfa_factors where id = '77777777-7777-4777-8777-777777777777';

-- 42. While a pack is on sale, its beats are only listed inside it.
begin;
select test.act_as(null);
select test.ok((select count(*) = 2 from public.live_pack_beats where pack_id = '66666666-6666-4666-8666-666666666666'),
  'the beats of a pack on sale are pack-only');
select test.ok((public.search_beats(p_producer_id => :'sb') ->> 'total')::int = 0,
  'pack-only beats are not listed on the producer profile');
select test.ok(not exists (
  select 1 from jsonb_array_elements(public.search_beats(p_query => 'Pack', p_limit => 100) -> 'items') e
  where e ->> 'id' in ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552')),
  'pack-only beats are not found in Explore or search');
rollback;
begin;
select test.act_as(:'sb');
update public.beats set status = 'draft' where id = '55555555-5555-4555-8555-555555555552';
commit;
begin;
select test.act_as(null);
select test.ok((select count(*) = 0 from public.live_pack_beats where pack_id = '66666666-6666-4666-8666-666666666666'),
  'a pack off sale has no pack-only beats');
select test.ok((public.search_beats(p_producer_id => :'sb') ->> 'total')::int = 1,
  'beats of a pack off sale are listed on their own again');
rollback;
begin;
select test.act_as(:'sb');
update public.beats set status = 'published' where id = '55555555-5555-4555-8555-555555555552';
commit;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'draft' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(null);
select test.ok((public.search_beats(p_producer_id => :'sb') ->> 'total')::int = 2,
  'an unpublished pack doesn''t hide its beats');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'published' where id = '66666666-6666-4666-8666-666666666666';
commit;

-- 43. Collaborations: a producer invites another producer to one of their beats.
begin;
select test.act_as(:'sb');
select (public.invite_collaborator('55555555-5555-4555-8555-555555555551', '@SellerA') ->> 'id') as collab_id \gset
commit;
select test.ok((select status = 'pending' and owner_id = :'sb' and collaborator_id = :'sa' and share_percent = 50
  from public.beat_collaborations where id = :'collab_id'), 'a producer invites another producer (50/50)');
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.invite_collaborator('55555555-5555-4555-8555-555555555551', 'sellera');
  perform test.ok(false, 'one open invite per beat');
exception when raise_exception then perform test.ok(true, 'one open invite per beat');
end $$;
do $$ begin
  perform public.invite_collaborator('55555555-5555-4555-8555-555555555552', 'sellerb');
  perform test.ok(false, 'producers cannot invite themselves');
exception when raise_exception then perform test.ok(true, 'producers cannot invite themselves');
end $$;
do $$ begin
  perform public.invite_collaborator('55555555-5555-4555-8555-555555555552', 'buyerc');
  perform test.ok(false, 'only producers can be invited');
exception when raise_exception then perform test.ok(true, 'only producers can be invited');
end $$;
rollback;
begin;
select test.act_as(:'sa');
do $$ begin
  perform public.invite_collaborator('55555555-5555-4555-8555-555555555552', 'buyerc');
  perform test.ok(false, 'nobody can invite collaborators to someone else''s beat');
exception when insufficient_privilege then perform test.ok(true, 'nobody can invite collaborators to someone else''s beat');
end $$;
select test.ok((select count(*) = 1 from public.beat_collaborations where id = :'collab_id'), 'the invited producer sees the invite');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 0 from public.beat_collaborations), 'other users don''t see invites');
do $$ declare n int; begin
  update public.beat_collaborations set status = 'accepted';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'invites can''t be changed directly');
exception when insufficient_privilege then perform test.ok(true, 'invites can''t be changed directly');
end $$;
rollback;
begin;
select test.act_as(null);
select test.ok((select count(*) = 0 from public.beat_collaborations), 'visitors don''t see open invites');
rollback;

-- 44. Only the invited producer can accept; credit is public; the owner can't cut them out.
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.respond_to_collaboration((select id from public.beat_collaborations where status = 'pending' limit 1), true);
  perform test.ok(false, 'the owner cannot accept their own invite');
exception when raise_exception then perform test.ok(true, 'the owner cannot accept their own invite');
end $$;
rollback;
begin;
select test.act_as(:'sa');
select test.ok((public.respond_to_collaboration(:'collab_id', true) ->> 'status') = 'accepted', 'the invited producer accepts');
commit;
begin;
select test.act_as(null);
select test.ok((select collaborator_username = 'sellera' from public.beat_cards where id = '55555555-5555-4555-8555-555555555551'),
  'visitors see both producers of the beat');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'draft' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(null);
select test.ok(exists (select 1 from jsonb_array_elements(public.search_beats(p_producer_id => :'sa') -> 'items') e
  where e ->> 'id' = '55555555-5555-4555-8555-555555555551'), 'a co-produced beat is listed on the collaborator''s profile too');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'published' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.end_collaboration((select id from public.beat_collaborations where status = 'accepted' limit 1));
  perform test.ok(false, 'the owner cannot end an accepted collaboration');
exception when raise_exception then perform test.ok(true, 'the owner cannot end an accepted collaboration');
end $$;
rollback;

-- 45. A pack with a co-produced beat: that beat's part of the pack is split.
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'eur', '{}'::uuid[],
  array[(select id from public.beat_pack_licenses where pack_id = '66666666-6666-4666-8666-666666666666' and type = 'basic')])
  ->> 'order_id') as collab_pack_order \gset
select public.fulfill_order(:'collab_pack_order', 'pi_cp', 'ch_cp', 'cs_cp');
commit;
select test.ok((select count(*) = 2 and sum(se.net) = max(oi.seller_amount)
    and sum(se.net) filter (where se.seller_id = :'sa') = floor(max(oi.seller_amount) / 4.0)
  from public.seller_earnings se join public.order_items oi on oi.id = se.order_item_id
  where se.order_id = :'collab_pack_order'), 'a pack sale gives the collaborator half of their beat''s part');

-- 46. Selling a co-produced beat splits the producers' money in half.
-- (The buyer already has Pack One's Basic license from the pack: sell its Premium one.)
begin;
select test.act_as(:'sb');
insert into public.beat_licenses (beat_id, type, name, price_eur, price_pln, price_usd, includes_mp3, includes_wav)
values ('55555555-5555-4555-8555-555555555551', 'premium', 'Premium', 4999, 21900, 5799, true, true);
commit;
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '55555555-5555-4555-8555-555555555551' and type = 'premium')])
  ->> 'order_id') as collab_order \gset
select public.fulfill_order(:'collab_order', 'pi_c', 'ch_c', 'cs_c');
commit;
select test.ok((select count(*) = 2
    and sum(se.net) = max(oi.seller_amount)
    and sum(se.gross) = max(oi.price)
    and sum(se.platform_fee) = max(oi.platform_fee)
    and sum(se.net) filter (where se.seller_id = :'sa') = floor(max(oi.seller_amount) / 2.0)
    and sum(se.net) filter (where se.seller_id = :'sb') = ceil(max(oi.seller_amount) / 2.0)
  from public.seller_earnings se join public.order_items oi on oi.id = se.order_item_id
  where se.order_id = :'collab_order'), 'a sale of a co-produced beat is split 50/50');
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.seller_earnings where order_id = :'collab_order'), 'each producer sees only their own earning');
select test.ok(exists (select 1 from jsonb_array_elements(public.seller_sales() -> 'items') e
  where e ->> 'split_with' = 'sellerb'
    and (e ->> 'seller_amount')::int = (select net from public.seller_earnings where order_id = :'collab_order')),
  'the collaborator''s Sales page lists the sale at their share');
select test.ok((public.seller_dashboard() ->> 'sales_count')::int >= 2, 'the collaborator''s studio counts the sales');
rollback;
select order_number as collab_order_number from public.orders where id = :'collab_order' \gset
begin;
select test.act_as(:'sb');
select test.ok((select (e ->> 'seller_amount')::int = (select net from public.seller_earnings where order_id = :'collab_order' and seller_id = :'sb')
    and e ->> 'split_with' = 'sellera'
  from jsonb_array_elements(public.seller_sales() -> 'items') e where e ->> 'order_number' = :'collab_order_number'),
  'the owner''s Sales page shows their half and who they split it with');
rollback;

-- 47. A refund reverses both producers' earnings.
begin;
set local role service_role;
select public.apply_order_refund(:'collab_order', (select total from public.orders where id = :'collab_order'));
commit;
select test.ok((select bool_and(status = 'reversed') and count(*) = 2 from public.seller_earnings where order_id = :'collab_order'),
  'refunding a shared sale reverses both earnings');

-- 48. The collaborator can leave; later sales aren't split; the owner can cancel an open invite.
begin;
select test.act_as(:'sa');
select test.ok((public.end_collaboration(:'collab_id') ->> 'status') = 'ended', 'the collaborator can leave');
commit;
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'usd',
  array[(select id from public.beat_licenses where beat_id = '55555555-5555-4555-8555-555555555551' and type = 'premium')])
  ->> 'order_id') as solo_order \gset
select public.fulfill_order(:'solo_order', 'pi_s', 'ch_s', 'cs_s');
commit;
select test.ok((select count(*) = 1 from public.seller_earnings where order_id = :'solo_order'), 'after the collaborator leaves, sales aren''t split');
begin;
select test.act_as(:'sb');
select (public.invite_collaborator('55555555-5555-4555-8555-555555555551', 'sellera') ->> 'id') as collab2_id \gset
select test.ok((public.end_collaboration(:'collab2_id') ->> 'status') = 'cancelled', 'the owner can cancel an open invite');
commit;

-- 49. Two-factor: a password-only session can't see or answer invites.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('88888888-8888-4888-8888-888888888888', :'sa', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'sb');
select (public.invite_collaborator('55555555-5555-4555-8555-555555555551', 'sellera') ->> 'id') as collab3_id \gset
commit;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.beat_collaborations), '2FA user: password-only session cannot see invites');
do $$ begin
  perform public.respond_to_collaboration((select id from public.beat_collaborations limit 1), true);
  perform test.ok(false, '2FA user: password-only session cannot accept invites');
exception when others then perform test.ok(true, '2FA user: password-only session cannot accept invites');
end $$;
rollback;
delete from auth.mfa_factors where id = '88888888-8888-4888-8888-888888888888';

\echo '--- all security tests passed ---'
