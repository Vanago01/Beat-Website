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
select test.ok((select subtotal = 21900 and service_fee = 2190 and total = 24090 and status = 'pending' from public.orders where id = :'order_id'),
  'order priced from DB in PLN, plus the website fee');
select test.ok((select platform_fee = 0 and seller_amount = 21900 from public.order_items where order_id = :'order_id'), 'the producer gets the whole price');
begin;
set local role service_role;
select (public.fulfill_order(:'order_id', 'pi_test', 'ch_test', 'cs_test') ->> 'fulfilled') as f1 \gset
select (public.fulfill_order(:'order_id', 'pi_test', 'ch_test', 'cs_test') ->> 'fulfilled') as f2 \gset
commit;
select test.ok(:'f1' = 'true' and :'f2' = 'false', 'fulfilment is idempotent');
select test.ok((select count(*) = 1 from public.purchases where order_id = :'order_id' and includes_wav), 'purchase grants WAV access');
select test.ok((select status = 'pending' and net = 21900 from public.seller_earnings where order_id = :'order_id'), 'seller earning recorded');
select test.ok((select sales_count = 1 from public.beats where id = '11111111-1111-4111-8111-111111111111'), 'sales counter incremented');

begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyerc@test.local', 'usd',
  array[(select id from public.beat_licenses where type = 'basic' limit 1)]) ->> 'subtotal') as usd_total \gset
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
select test.ok((select (public.admin_dashboard() -> 'revenue' ->> 'pln')::int = 24090), 'admin dashboard revenue (incl. the website fee)');
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
select (public.apply_order_refund(:'order_id', 24090) ->> 'full') as refunded \gset
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
select test.ok((select subtotal = 5999 and total = 5999 + 600 and currency = 'usd' from public.orders where id = :'pack_order'), 'pack order priced from the pack license, plus the website fee');
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
select test.ok((select count(*) = 1 and sum(net) = 5999 from public.seller_earnings where order_id = :'pack_order'),
  'the producer earns once for the pack (the whole price)');
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
select (public.apply_order_refund(:'pack_order', 6599) ->> 'full') as pack_refunded \gset
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

-- 50. Following: people follow others themselves; who follows whom is public.
begin;
select test.act_as(:'buyer');
insert into public.follows (follower_id, followee_id) values (:'buyer', :'sb');
commit;
select test.ok((select count(*) = 1 from public.follows where follower_id = :'buyer' and followee_id = :'sb'), 'people can follow a producer');
begin;
select test.act_as(:'buyer');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.sa')::uuid, current_setting('test.sb')::uuid);
  perform test.ok(false, 'nobody can follow on someone else''s behalf');
exception when insufficient_privilege then perform test.ok(true, 'nobody can follow on someone else''s behalf');
end $$;
rollback;
begin;
select test.act_as(:'sa');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.sa')::uuid, current_setting('test.sa')::uuid);
  perform test.ok(false, 'nobody can follow themselves');
exception when check_violation or insufficient_privilege then perform test.ok(true, 'nobody can follow themselves');
end $$;
do $$ declare n int; begin
  delete from public.follows where follower_id = current_setting('test.buyer')::uuid;
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'nobody can remove someone else''s follow');
end $$;
rollback;
begin;
select test.act_as(null);
select test.ok((public.get_producer_stats(:'sb') ->> 'followers')::int = 1 and (public.get_producer_stats(:'buyer') ->> 'following')::int = 1,
  'follower counts are public');
select test.ok((select count(*) = 1 from public.follows where followee_id = :'sb'), 'visitors can see who follows a producer');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'draft' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) >= 1 and bool_and(e ->> 'producer_id' = :'sb' or e ->> 'collaborator_id' = :'sb')
  from jsonb_array_elements(public.following_beats()) e), 'the feed shows new beats from producers you follow');
rollback;
begin;
select test.act_as(:'sa');
select test.ok(jsonb_array_length(public.following_beats()) = 0, 'the feed is empty when you follow nobody');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
update public.beat_packs set status = 'published' where id = '66666666-6666-4666-8666-666666666666';
commit;
begin;
select test.act_as(:'buyer');
delete from public.follows where follower_id = :'buyer' and followee_id = :'sb';
commit;
select test.ok((select count(*) = 0 from public.follows where follower_id = :'buyer'), 'people can unfollow');

-- 51. Collaborations: the inviting producer chooses the collaborator's share.
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.invite_collaborator('55555555-5555-4555-8555-555555555552', 'sellera', 100);
  perform test.ok(false, 'the collaborator''s share is 1-99 %');
exception when raise_exception then perform test.ok(true, 'the collaborator''s share is 1-99 %');
end $$;
select (public.invite_collaborator('55555555-5555-4555-8555-555555555552', 'sellera', 70) ->> 'id') as collab70 \gset
commit;
begin;
select test.act_as(:'sa');
select test.ok((select share_percent = 70 from public.beat_collaborations where id = :'collab70')
  and (public.respond_to_collaboration(:'collab70', true) ->> 'status') = 'accepted', 'a 70 % share can be offered and accepted');
commit;
begin;
set local role service_role;
select (public.create_pending_order(:'owner', 'owner@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '55555555-5555-4555-8555-555555555552' and type = 'basic')])
  ->> 'order_id') as order70 \gset
select public.fulfill_order(:'order70', 'pi_70', 'ch_70', 'cs_70');
commit;
select test.ok((select sum(se.net) = max(oi.seller_amount)
    and sum(se.net) filter (where se.seller_id = :'sa') = floor(max(oi.seller_amount) * 0.7)
  from public.seller_earnings se join public.order_items oi on oi.id = se.order_item_id
  where se.order_id = :'order70'), 'sales are split by the agreed share (70/30)');
begin;
select test.act_as(:'sa');
select test.ok(exists (select 1 from jsonb_array_elements(public.seller_sales() -> 'items') e
  where (e ->> 'my_share_percent')::int = 70), 'the Sales page shows the producer''s share in percent');
rollback;

-- 52. Reactions: one per person per message, only inside the conversation.
begin;
select test.act_as(:'sb');
select public.start_conversation(:'buyer') as conv2 \gset
select (public.send_message(:'conv2', 'React to this') ->> 'id') as msg2 \gset
commit;
select set_config('test.msg2', :'msg2', false);
select set_config('test.conv2', :'conv2', false);
begin;
select test.act_as(:'buyer');
select test.ok(public.react_to_message(:'msg2', '❤️') = '❤️', 'people react to a message with an emoji');
select test.ok(public.react_to_message(:'msg2', '😂') = '😂', 'another emoji replaces the reaction');
select test.ok(public.react_to_message(:'msg2', '😂') is null, 'the same emoji again removes it');
select test.ok(public.react_to_message(:'msg2', '👍🏽') = '👍🏽', 'any emoji works, skin tones included');
do $$ begin
  perform public.react_to_message(current_setting('test.msg2')::uuid, 'lol');
  perform test.ok(false, 'reactions must be emoji');
exception when raise_exception then perform test.ok(true, 'reactions must be emoji');
end $$;
commit;
begin;
select test.act_as(:'sb');
select test.ok((select count(*) = 1 and max(emoji) = '👍🏽' from public.message_reactions where message_id = :'msg2'),
  'the other person sees the reaction');
do $$ declare n int; begin
  update public.message_reactions set emoji = '💀';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'reactions can''t be changed directly');
exception when insufficient_privilege then perform test.ok(true, 'reactions can''t be changed directly');
end $$;
rollback;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.message_reactions), 'outsiders don''t see reactions');
do $$ begin
  perform public.react_to_message(current_setting('test.msg2')::uuid, '❤️');
  perform test.ok(false, 'outsiders can''t react');
exception when no_data_found or raise_exception then perform test.ok(true, 'outsiders can''t react');
end $$;
rollback;

-- 53. Photos and videos: private to the conversation, sent only by who uploaded them.
begin;
select test.act_as(:'sb');
insert into storage.objects (bucket_id, name, owner, metadata)
values ('message-media', :'conv2' || '/' || :'sb' || '/photo.png', :'sb', '{"mimetype": "image/png", "size": 2048}');
commit;
select test.ok(exists (select 1 from storage.objects where bucket_id = 'message-media' and name = :'conv2' || '/' || :'sb' || '/photo.png'),
  'a member uploads a photo to their own folder of the conversation');
begin;
select test.act_as(:'sb');
do $$ begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('message-media', current_setting('test.conv2') || '/' || current_setting('test.buyer') || '/x.png', current_setting('test.sb')::uuid, '{"mimetype": "image/png"}');
  perform test.ok(false, 'nobody uploads into the other person''s folder');
exception when insufficient_privilege then perform test.ok(true, 'nobody uploads into the other person''s folder');
end $$;
rollback;
begin;
select test.act_as(:'sa');
do $$ begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('message-media', current_setting('test.conv2') || '/' || current_setting('test.sa') || '/x.png', current_setting('test.sa')::uuid, '{"mimetype": "image/png"}');
  perform test.ok(false, 'outsiders can''t upload to a conversation');
exception when insufficient_privilege then perform test.ok(true, 'outsiders can''t upload to a conversation');
end $$;
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'message-media'), 'outsiders can''t see the photos');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 1 from storage.objects where bucket_id = 'message-media'), 'the other person can open the photo');
rollback;
begin;
select test.act_as(:'sb');
select test.ok((select (r ->> 'body') = '' and r -> 'attachments' -> 0 ->> 'kind' = 'image' and r -> 'attachments' -> 0 ->> 'mime' = 'image/png'
  from (select public.send_message(:'conv2', '', jsonb_build_array(jsonb_build_object('path', :'conv2' || '/' || :'sb' || '/photo.png', 'width', 640, 'height', 480)))::jsonb as r) x),
  'a photo can be sent without text');
do $$ begin
  perform public.send_message(current_setting('test.conv2')::uuid, 'look', jsonb_build_array(jsonb_build_object('path', current_setting('test.conv2') || '/' || current_setting('test.buyer') || '/x.png')));
  perform test.ok(false, 'only your own uploads can be attached');
exception when raise_exception then perform test.ok(true, 'only your own uploads can be attached');
end $$;
do $$ begin
  perform public.send_message(current_setting('test.conv2')::uuid, 'look', jsonb_build_array(jsonb_build_object('path', current_setting('test.conv2') || '/' || current_setting('test.sb') || '/missing.png')));
  perform test.ok(false, 'files that weren''t uploaded can''t be attached');
exception when raise_exception then perform test.ok(true, 'files that weren''t uploaded can''t be attached');
end $$;
commit;
begin;
select test.act_as(:'buyer');
select test.ok((select x ->> 'id' = :'conv2' and x -> 'last_message' ->> 'body' = '📷 Photo' from json_array_elements(public.list_conversations()) x where x ->> 'id' = :'conv2'),
  'the inbox shows a photo as "📷 Photo"');
rollback;

-- 54. Pinned conversations come first, for you only.
begin;
select test.act_as(:'buyer');
select test.ok(public.pin_conversation(:'conv', true), 'people can pin a conversation');
select test.ok((select (json_array_elements(public.list_conversations()) ->> 'id') limit 1) = :'conv'
  and (select bool_or((x ->> 'pinned')::boolean) from json_array_elements(public.list_conversations()) x), 'pinned conversations are listed first');
commit;
begin;
select test.act_as(:'sa');
select test.ok(not coalesce((select (x ->> 'pinned')::boolean from json_array_elements(public.list_conversations()) x where x ->> 'id' = :'conv'), false),
  'a pin is only yours');
rollback;
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.pin_conversation(current_setting('test.conv')::uuid, true);
  perform test.ok(false, 'nobody pins someone else''s conversation');
exception when no_data_found or raise_exception then perform test.ok(true, 'nobody pins someone else''s conversation');
end $$;
rollback;
begin;
select test.act_as(:'buyer');
select test.ok(not public.pin_conversation(:'conv', false), 'people can unpin');
commit;

-- 55. Two-factor: a password-only session can't follow or react.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('99999999-9999-4999-8999-999999999999', :'buyer', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'buyer');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.buyer')::uuid, current_setting('test.sb')::uuid);
  perform test.ok(false, '2FA user: password-only session cannot follow');
exception when insufficient_privilege then perform test.ok(true, '2FA user: password-only session cannot follow');
end $$;
do $$ begin
  perform public.react_to_message(current_setting('test.msg2')::uuid, '🔥');
  perform test.ok(false, '2FA user: password-only session cannot react');
exception when insufficient_privilege then perform test.ok(true, '2FA user: password-only session cannot react');
end $$;
rollback;
delete from auth.mfa_factors where id = '99999999-9999-4999-8999-999999999999';

-- 56. Anyone can follow anyone (not only producers), except across a block.
begin;
select test.act_as(:'sa');
insert into public.follows (follower_id, followee_id) values (:'sa', :'buyer');
commit;
select test.ok((select count(*) = 1 from public.follows where follower_id = :'sa' and followee_id = :'buyer'),
  'people can follow someone who isn''t a producer');
begin;
select test.act_as(:'buyer');
insert into public.follows (follower_id, followee_id) values (:'buyer', :'sa');
select test.ok((public.get_producer_stats(:'buyer') ->> 'followers')::int = 1, 'everyone has follower counts');
insert into public.user_blocks (blocker_id, blocked_id) values (:'buyer', :'sa');
commit;
select test.ok((select count(*) = 0 from public.follows
  where (follower_id = :'sa' and followee_id = :'buyer') or (follower_id = :'buyer' and followee_id = :'sa')),
  'blocking someone removes the follows between you, both ways');
begin;
select test.act_as(:'sa');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.sa')::uuid, current_setting('test.buyer')::uuid);
  perform test.ok(false, 'nobody can follow someone who blocked them');
exception when insufficient_privilege then perform test.ok(true, 'nobody can follow someone who blocked them');
end $$;
rollback;
begin;
select test.act_as(:'buyer');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.buyer')::uuid, current_setting('test.sa')::uuid);
  perform test.ok(false, 'nobody can follow someone they blocked');
exception when insufficient_privilege then perform test.ok(true, 'nobody can follow someone they blocked');
end $$;
delete from public.user_blocks where blocker_id = :'buyer' and blocked_id = :'sa';
commit;
begin;
select test.act_as(:'sa');
insert into public.follows (follower_id, followee_id) values (:'sa', :'buyer');
select test.ok(true, 'after unblocking, following works again');
rollback;
begin;
select test.act_as(:'sa');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.sa')::uuid, '00000000-0000-4000-8000-000000000000');
  perform test.ok(false, 'only real people can be followed');
exception when insufficient_privilege or foreign_key_violation then perform test.ok(true, 'only real people can be followed');
end $$;
rollback;

-- 57. Delivered and seen: the other person's browser marks messages delivered;
--     both people in the conversation see the receipts, nobody else.
begin;
select test.act_as(:'sb');
select (public.send_message(:'conv2', 'Are you there?') ->> 'created_at') as sent_at \gset
commit;
begin;
select test.act_as(:'sb');
select test.ok(coalesce((public.get_conversation(:'conv2') ->> 'other_delivered_at')::timestamptz < :'sent_at'::timestamptz, true),
  'a new message isn''t delivered yet');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok(public.mark_messages_delivered() >= 1, 'the other person''s browser marks it delivered');
select test.ok(public.mark_messages_delivered() = 0, 'marking again changes nothing');
commit;
begin;
select test.act_as(:'sb');
select test.ok((public.get_conversation(:'conv2') ->> 'other_delivered_at')::timestamptz >= :'sent_at'::timestamptz, 'the sender sees it delivered');
select test.ok((select delivered_at >= :'sent_at'::timestamptz and (read_at is null or read_at < :'sent_at'::timestamptz)
  from public.conversation_receipts where conversation_id = :'conv2' and user_id = :'buyer'),
  'the sender can read the receipt (delivered, not seen yet)');
select test.ok((select count(*) = 0 from public.conversation_members where user_id <> :'sb'),
  'the other person''s private side (deleted, pinned) stays hidden');
do $$ declare n int; begin
  update public.conversation_receipts set read_at = now();
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'receipts can''t be written directly');
exception when insufficient_privilege then perform test.ok(true, 'receipts can''t be written directly');
end $$;
rollback;
begin;
select test.act_as(:'buyer');
select public.mark_conversation_read(:'conv2');
commit;
begin;
select test.act_as(:'sb');
select test.ok((select read_at >= :'sent_at'::timestamptz from public.conversation_receipts where conversation_id = :'conv2' and user_id = :'buyer'),
  'reading the conversation shows as seen');
select (public.send_message(:'conv2', 'One more') ->> 'created_at') as sent_at2 \gset
commit;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.conversation_receipts where conversation_id = :'conv2'), 'outsiders don''t see receipts');
select public.mark_messages_delivered();
commit;
select test.ok((select delivered_at < :'sent_at2'::timestamptz from public.conversation_receipts where conversation_id = :'conv2' and user_id = :'buyer'),
  'nobody marks messages delivered for someone else');
begin;
select test.act_as(null);
do $$ begin
  perform public.mark_messages_delivered();
  perform test.ok(false, 'visitors can''t mark messages delivered');
exception when insufficient_privilege then perform test.ok(true, 'visitors can''t mark messages delivered');
end $$;
select test.ok(not has_table_privilege('anon', 'public.conversation_receipts', 'select'), 'visitors can''t read receipts');
rollback;

-- 58. Two-factor: a password-only session can't mark delivered or read receipts.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('99999999-9999-4999-8999-999999999999', :'buyer', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'buyer');
select test.ok(public.mark_messages_delivered() = 0, '2FA user: password-only session cannot mark messages delivered');
select test.ok((select count(*) = 0 from public.conversation_receipts), '2FA user: password-only session cannot read receipts');
do $$ begin
  insert into public.follows (follower_id, followee_id) values (current_setting('test.buyer')::uuid, current_setting('test.sa')::uuid);
  perform test.ok(false, '2FA user: password-only session cannot follow anyone');
exception when insufficient_privilege then perform test.ok(true, '2FA user: password-only session cannot follow anyone');
end $$;
rollback;
delete from auth.mfa_factors where id = '99999999-9999-4999-8999-999999999999';
select test.ok((select delivered_at < :'sent_at2'::timestamptz from public.conversation_receipts where conversation_id = :'conv2' and user_id = :'buyer'),
  '2FA user: nothing was marked delivered');

-- 59. Plug-in installers: a private bucket that only the server reads. (One transaction,
--     rolled back at the end, so the test file never stays in the bucket.)
select test.ok((select not public from storage.buckets where id = 'plugin-files'), 'the plug-in bucket is private');
begin;
insert into storage.objects (bucket_id, name, owner, metadata)
values ('plugin-files', 'dlay/DLAY-1.0.0-Windows.zip', null, '{"mimetype": "application/zip", "size": 1024}');
select test.act_as(:'buyer');
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'plugin-files'), 'members can''t list or open the installers directly');
do $$ begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('plugin-files', 'dlay/DLAY-9.9.9-Windows.zip', current_setting('test.buyer')::uuid, '{"mimetype": "application/zip"}');
  perform test.ok(false, 'members can''t put a file among the installers');
exception when insufficient_privilege then perform test.ok(true, 'members can''t put a file among the installers');
end $$;
do $$ declare n int; begin
  update storage.objects set name = 'dlay/DLAY-9.9.9-Windows.zip' where bucket_id = 'plugin-files';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'members can''t replace or rename an installer');
end $$;
select test.act_as(null);
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'plugin-files'), 'visitors can''t see the installers');
select test.act_as(:'owner', 'aal2');
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'plugin-files'),
  'not even an administrator reads the installers through the API: only the server does');
rollback;
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'plugin-files'), 'the plug-in bucket is left as it was');

-- 60. Website fee: buyers pay it on top of the price; producers keep the whole price.
begin;
insert into public.beats (id, producer_id, title, genre, bpm, key_note, key_mode, preview_path, mp3_path, status)
values ('88888888-8888-4888-8888-888888888881', :'sb', 'Fee Test', 'trap', 120, 0, 'minor',
  :'sb' || '/88888888-8888-4888-8888-888888888881/preview.mp3', :'sb' || '/88888888-8888-4888-8888-888888888881/full.mp3', 'published');
insert into public.beat_licenses (beat_id, type, name, price_eur, price_pln, price_usd, includes_mp3, enabled, sort_order)
values ('88888888-8888-4888-8888-888888888881', 'basic', 'Basic', 2999, 12900, 3499, true, true, 1),
       ('88888888-8888-4888-8888-888888888881', 'exclusive', 'Exclusive', 49900, 210000, 57900, true, true, 2);
commit;
select test.ok((select platform_fee_percent = 0 and buyer_fee_percent = 10 from public.platform_settings),
  'by default producers keep 100% and buyers pay a 10% website fee');
begin;
set local role service_role;
select (public.create_pending_order(:'buyer', 'buyer@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '88888888-8888-4888-8888-888888888881' and type = 'basic')]) ->> 'order_id') as feeorder \gset
commit;
select test.ok((select subtotal = 2999 and service_fee = 300 and total = 3299 from public.orders where id = :'feeorder'),
  'the buyer pays the price plus the 10% website fee (29.99 + 3.00)');
select test.ok((select price = 2999 and service_fee = 300 and platform_fee = 0 and seller_amount = 2999 from public.order_items where order_id = :'feeorder'),
  'the whole price goes to the producer');
begin;
set local role service_role;
select public.fulfill_order(:'feeorder', 'pi_fee', 'ch_fee', 'cs_fee');
commit;
select test.ok((select sum(net) = 2999 and sum(platform_fee) = 0 from public.seller_earnings where order_id = :'feeorder'),
  'the producer earns the whole price');
begin;
select test.act_as(:'owner', 'aal2');
select test.ok((public.admin_dashboard() -> 'platform_earnings' ->> 'eur')::numeric >= 300, 'website fees count as platform earnings');
rollback;
begin;
set local role service_role;
select (public.create_pending_order(:'owner', 'owner@test.local', 'usd',
  array[(select id from public.beat_licenses where beat_id = '88888888-8888-4888-8888-888888888881' and type = 'basic')]) ->> 'order_id') as feeorder2 \gset
commit;
select test.ok((select subtotal = 3499 and service_fee = 350 and total = 3849 from public.orders where id = :'feeorder2'),
  'the website fee is in the order''s currency');
update public.platform_settings set platform_fee_percent = 20;
begin;
set local role service_role;
select (public.create_pending_order(:'sa', 'sa@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '88888888-8888-4888-8888-888888888881' and type = 'basic')]) ->> 'order_id') as feeorder3 \gset
commit;
update public.platform_settings set platform_fee_percent = 0;
select test.ok((select o.total = 3299 and oi.platform_fee = 600 and oi.seller_amount = 2399 from public.orders o join public.order_items oi on oi.order_id = o.id where o.id = :'feeorder3'),
  'an admin can still take a fee from producers too (Admin → Settings)');
-- Two people pay for the same exclusive at once: the second is refunded, fee included.
begin;
set local role service_role;
select (public.create_pending_order(:'owner', 'owner@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '88888888-8888-4888-8888-888888888881' and type = 'exclusive')]) ->> 'order_id') as exorder1 \gset
select (public.create_pending_order(:'sa', 'sa@test.local', 'eur',
  array[(select id from public.beat_licenses where beat_id = '88888888-8888-4888-8888-888888888881' and type = 'exclusive')]) ->> 'order_id') as exorder2 \gset
select public.fulfill_order(:'exorder1', 'pi_ex1', 'ch_ex1', 'cs_ex1');
select (public.fulfill_order(:'exorder2', 'pi_ex2', 'ch_ex2', 'cs_ex2') -> 'conflicts' -> 0 ->> 'amount') as conflict_amount \gset
commit;
select test.ok(:'conflict_amount'::int = 49900 + 4990, 'an item that can''t be delivered is refunded with its website fee');
select test.ok((select count(*) = 0 from public.seller_earnings where order_id = :'exorder2'), 'nothing is earned for an undelivered item');

-- 61. Drafts can be saved before the genre and BPM are chosen; submitting still needs them.
begin;
select test.act_as(:'sb');
select (public.save_beat(
  jsonb_build_object('id', '88888888-8888-4888-8888-888888888882', 'title', 'Untitled beat', 'moods', '[]'::jsonb, 'tags', '[]'::jsonb, 'key_note', 0, 'key_mode', 'minor'),
  '[{"type": "basic", "name": "Basic", "price_eur": 2999, "price_pln": 12900, "price_usd": 3499, "includes_mp3": true}]'::jsonb,
  'draft')).slug as draft_slug \gset
commit;
select test.ok((select genre is null and bpm is null and status = 'draft' from public.beats where id = '88888888-8888-4888-8888-888888888882'),
  'a draft can be saved without a genre or BPM');
select test.ok(:'draft_slug' like 'untitled-beat-%', 'an untitled draft gets a temporary address');
begin;
select test.act_as(:'sb');
update public.beats set title = 'Night Drive' where id = '88888888-8888-4888-8888-888888888882';
commit;
select test.ok((select slug like 'night-drive-%' from public.beats where id = '88888888-8888-4888-8888-888888888882'),
  'a draft''s address follows its title until it''s published');
begin;
select test.act_as(:'sb');
do $$ begin
  update public.beats set status = 'pending' where id = '88888888-8888-4888-8888-888888888882';
  perform test.ok(false, 'a beat without a genre and BPM can''t be submitted');
exception when check_violation then perform test.ok(true, 'a beat without a genre and BPM can''t be submitted');
end $$;
rollback;
begin;
select test.act_as(:'sb');
do $$ begin
  update public.beats set genre = null where id = '55555555-5555-4555-8555-555555555551';
  perform test.ok(false, 'a live beat can''t lose its genre');
exception when check_violation then perform test.ok(true, 'a live beat can''t lose its genre');
end $$;
rollback;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.beats where id = '88888888-8888-4888-8888-888888888882'), 'other people don''t see someone''s drafts');
rollback;
begin;
select test.act_as(null);
select test.ok((select count(*) = 0 from public.beat_cards where id = '88888888-8888-4888-8888-888888888882'), 'drafts aren''t public');
rollback;

-- 62. Who liked a beat: its producer and an accepted co-producer see the list, nobody else.
-- Pack One (…551) is sellerB's alone (that collaboration ended); Pack Two (…552) is co-produced with sellerA.
begin;
select test.act_as(:'buyer');
insert into public.favorites (user_id, beat_id) values
  (auth.uid(), '55555555-5555-4555-8555-555555555551'),
  (auth.uid(), '55555555-5555-4555-8555-555555555552');
commit;
begin;
select test.act_as(:'owner', 'aal2');
insert into public.favorites (user_id, beat_id) values (auth.uid(), '55555555-5555-4555-8555-555555555551');
commit;
begin;
select test.act_as(:'sb');
select test.ok((select count(*) = 2 from public.beat_likes('55555555-5555-4555-8555-555555555551')), 'the producer sees who liked their beat');
select test.ok((select array_agg(username order by liked_at desc) = array['owner', 'buyerc']
  from public.beat_likes('55555555-5555-4555-8555-555555555551')), 'newest like first');
select test.ok((select name = 'buyerc' and beat_title = 'Pack One' and liked_at is not null
  from public.beat_likes('55555555-5555-4555-8555-555555555551') where username = 'buyerc'), 'each like has a name, the beat and when');
select test.ok((select count(*) = 3 from public.beat_likes()), 'without a beat: the likes on all of the producer''s beats');
select test.ok((select count(*) = 1 from public.beat_likes('55555555-5555-4555-8555-555555555551', p_limit => 1)), 'the list comes in pages');
select test.ok((select array_agg(username) = array['buyerc'] from public.beat_likes('55555555-5555-4555-8555-555555555551',
  (select liked_at from public.beat_likes('55555555-5555-4555-8555-555555555551') where username = 'owner'))), 'the next page starts after the last like shown');
select test.ok((select count(*) = 0 from public.favorites where beat_id = '55555555-5555-4555-8555-555555555551'),
  'the likes table itself stays private');
rollback;
begin;
select test.act_as(:'sa');
select test.ok((select array_agg(username) = array['buyerc'] from public.beat_likes('55555555-5555-4555-8555-555555555552')), 'the co-producer sees who liked the beat');
select test.ok((select array_agg(beat_title) = array['Pack Two'] from public.beat_likes()), 'the co-producer''s list has only the beats they co-produce');
do $$ begin
  perform public.beat_likes('55555555-5555-4555-8555-555555555551');
  perform test.ok(false, 'after a collaboration ends, the other producer can''t see the likes');
exception when insufficient_privilege then perform test.ok(true, 'after a collaboration ends, the other producer can''t see the likes');
end $$;
rollback;
begin;
select test.act_as(:'buyer');
do $$ begin
  perform public.beat_likes('55555555-5555-4555-8555-555555555551');
  perform test.ok(false, 'nobody else can see who liked a beat');
exception when insufficient_privilege then perform test.ok(true, 'nobody else can see who liked a beat');
end $$;
select test.ok((select count(*) = 0 from public.beat_likes()), 'someone without beats has no likes to see');
rollback;
begin;
select test.act_as(null);
do $$ begin
  perform public.beat_likes('55555555-5555-4555-8555-555555555551');
  perform test.ok(false, 'visitors can''t see who liked a beat');
exception when insufficient_privilege then perform test.ok(true, 'visitors can''t see who liked a beat');
end $$;
rollback;
begin;
select test.act_as(:'buyer');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'sb');
select test.act_as(:'sb');
select test.ok((select array_agg(username) = array['owner'] from public.beat_likes('55555555-5555-4555-8555-555555555551')),
  'someone who blocked the producer isn''t in their list');
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.beat_likes('55555555-5555-4555-8555-555555555552')), 'a block only hides them from the person blocked');
rollback;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('99999999-9999-4999-8999-999999999998', :'sb', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.beat_likes();
  perform test.ok(false, '2FA user: password-only session can''t see who liked their beats');
exception when insufficient_privilege then perform test.ok(true, '2FA user: password-only session can''t see who liked their beats');
end $$;
select test.act_as(:'sb', 'aal2');
select test.ok((select count(*) = 3 from public.beat_likes()), '2FA user: after the code, the list shows');
rollback;
delete from auth.mfa_factors where id = '99999999-9999-4999-8999-999999999998';
delete from public.favorites where beat_id in ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552');

-- 63. "Typing…": only the conversation's two members can listen to or send on its private
-- Realtime channel. (Realtime checks a join by reading realtime.messages and a broadcast by
-- inserting into it, with realtime.topic() set to the channel's name.)
select set_config('test.typing', 'typing:' || :'conv', false);
insert into realtime.messages (topic, extension, event, payload, private)
values (current_setting('test.typing'), 'broadcast', 'typing', '{"typing": true}', true)
returning id as typing_probe \gset
begin;
select test.act_as(:'buyer');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 1 from realtime.messages where id = :'typing_probe'), 'a member can listen to the conversation''s typing channel');
insert into realtime.messages (topic, extension, event, payload, private)
values (current_setting('test.typing'), 'broadcast', 'typing', '{"typing": true}', true);
select test.ok(true, 'a member can send "typing" on it');
rollback;
begin;
select test.act_as(:'sa');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 1 from realtime.messages where id = :'typing_probe'), 'so can the other member');
rollback;
begin;
select test.act_as(:'sb');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 0 from realtime.messages where id = :'typing_probe'), 'someone else can''t listen to it');
do $$ begin
  insert into realtime.messages (topic, extension, event, payload, private)
  values (current_setting('test.typing'), 'broadcast', 'typing', '{"typing": true}', true);
  perform test.ok(false, 'someone else can''t send "typing" on it');
exception when insufficient_privilege then perform test.ok(true, 'someone else can''t send "typing" on it');
end $$;
rollback;
begin;
select test.act_as(null);
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 0 from realtime.messages where id = :'typing_probe'), 'visitors can''t listen to it');
rollback;
begin;
select test.act_as(:'buyer');
select set_config('realtime.topic', 'typing:not-a-conversation', true);
select test.ok((select count(*) = 0 from realtime.messages where id = :'typing_probe'), 'a made-up channel name gives no access');
select set_config('realtime.topic', 'room:' || :'conv', true);
select test.ok(not public.can_use_typing_channel(realtime.topic()), 'the rule only covers "typing:" channels');
rollback;
begin;
insert into public.user_blocks (blocker_id, blocked_id) values (:'sa', :'buyer');
select test.act_as(:'buyer');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 0 from realtime.messages where id = :'typing_probe'), 'after a block, the blocked person can''t use the channel');
select test.act_as(:'sa');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok(not public.can_use_typing_channel(realtime.topic()), 'nor can the person who blocked them');
rollback;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('99999999-9999-4999-8999-999999999997', :'buyer', 'test authenticator', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
begin;
select test.act_as(:'buyer');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 0 from realtime.messages where id = :'typing_probe'), '2FA user: password-only session can''t use the typing channel');
select test.act_as(:'buyer', 'aal2');
select set_config('realtime.topic', current_setting('test.typing'), true);
select test.ok((select count(*) = 1 from realtime.messages where id = :'typing_probe'), '2FA user: after the code, it works');
rollback;
delete from auth.mfa_factors where id = '99999999-9999-4999-8999-999999999997';
delete from realtime.messages where id = :'typing_probe';

-- 64. Plug-in downloads: recorded by the server, readable by admins only.
begin;
set local role service_role;
insert into public.plugin_downloads (user_id, email, plugin, platform, version)
values (:'buyer', 'buyerc@test.local', 'dlay', 'windows', '1.0.0'),
       (:'buyer', 'buyerc@test.local', 'dlay', 'macos', '1.0.0'),
       (:'sa', 'sellera@test.local', 'dlay', 'windows', '1.0.1');
commit;
begin;
select test.act_as(:'owner', 'aal2');
select test.ok((select count(*) = 3 from public.plugin_downloads), 'an admin sees who downloaded the plug-ins');
select test.ok((select min(download_number) >= 1001 from public.plugin_downloads), 'downloads are numbered like orders');
select test.ok((select downloads = 3 and people = 2 from public.plugin_download_stats() where plugin = 'dlay'),
  'totals: downloads and different people');
rollback;
begin;
select test.act_as(:'owner', 'aal1');
select test.ok((select count(*) = 0 from public.plugin_downloads), 'an admin needs the two-factor sign-in to see them');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 0 from public.plugin_downloads), 'members don''t see the list, not even their own downloads');
select test.ok((select count(*) = 0 from public.plugin_download_stats()), 'nor the totals');
do $$ begin
  insert into public.plugin_downloads (user_id, plugin, platform) values (auth.uid(), 'dlay', 'windows');
  perform test.ok(false, 'members can''t record downloads themselves');
exception when insufficient_privilege then perform test.ok(true, 'members can''t record downloads themselves');
end $$;
rollback;
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 0 from public.plugin_downloads), 'producers don''t see the list either');
rollback;
begin;
select test.act_as(null);
do $$ declare n int; begin
  select count(*) into n from public.plugin_downloads;
  perform test.ok(n = 0, 'visitors can''t see the list');
exception when insufficient_privilege then perform test.ok(true, 'visitors can''t see the list');
end $$;
rollback;
begin;
set local role service_role;
do $$ begin
  insert into public.plugin_downloads (user_id, plugin, platform) values (current_setting('test.buyer')::uuid, 'dlay', 'linux');
  perform test.ok(false, 'only known systems are recorded');
exception when check_violation then perform test.ok(true, 'only known systems are recorded');
end $$;
rollback;
delete from public.plugin_downloads;

-- 65. Group chats: three or more people, with a name and a picture.
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.create_group('Duo', array[current_setting('test.sa')::uuid]);
  perform test.ok(false, 'a group needs at least two other people');
exception when raise_exception then perform test.ok(true, 'a group needs at least two other people');
end $$;
do $$ begin
  perform public.create_group('   ', array[current_setting('test.sa')::uuid, current_setting('test.buyer')::uuid]);
  perform test.ok(false, 'a group needs a name');
exception when raise_exception then perform test.ok(true, 'a group needs a name');
end $$;
select public.create_group('  Studio   crew ', array[:'sa'::uuid, :'buyer'::uuid], :'sb' || '/group-photo.webp') as grp \gset
commit;
select set_config('test.grp', :'grp', false);
select test.ok((select is_group and title = 'Studio crew' and created_by = :'sb' and photo_path = :'sb' || '/group-photo.webp'
  from public.conversations where id = :'grp'), 'a producer makes a group with a name and a picture');
select test.ok((select count(*) = 3 from public.conversation_members where conversation_id = :'grp'), 'everyone picked is in it');
select test.ok((select kind = 'event' and event ->> 'type' = 'created' from public.messages where conversation_id = :'grp' order by created_at limit 1),
  'the chat starts with a "created the group" line');
begin;
select test.act_as(:'buyer');
select (public.send_message(:'grp', 'Hi all') ->> 'id') as grp_msg \gset
commit;
select set_config('test.grp_msg', :'grp_msg', false);
begin;
select test.act_as(:'sa');
select test.ok((select count(*) = 1 from public.messages where id = :'grp_msg'), 'everyone in the group reads its messages');
select test.ok((public.get_conversation(:'grp') ->> 'is_group')::boolean and json_array_length(public.get_conversation(:'grp') -> 'members') = 3,
  'the group shows who is in it');
select test.ok((select e ->> 'title' = 'Studio crew' and (e ->> 'member_count')::int = 3 and e -> 'last_message' ->> 'sender_name' = 'buyerc'
  from json_array_elements(public.list_conversations()) e where e ->> 'id' = :'grp'), 'the inbox shows the group, its size and who wrote last');
rollback;
begin;
select test.act_as(:'owner', 'aal2');
select test.ok((select count(*) = 0 from public.messages where conversation_id = :'grp'), 'people outside the group can''t read it');
select test.ok(public.get_conversation(:'grp') is null, 'nor open it');
do $$ begin
  perform public.send_message(current_setting('test.grp')::uuid, 'let me in');
  perform test.ok(false, 'nor write in it');
exception when no_data_found then perform test.ok(true, 'nor write in it');
end $$;
select test.ok(not public.can_use_typing_channel('typing:' || :'grp'), 'nor use its "typing" channel');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok(public.can_use_typing_channel('typing:' || :'grp'), 'people in the group can use its "typing" channel');
select public.update_group(:'grp', 'Beat makers');
select test.ok((select title = 'Beat makers' from public.conversations where id = :'grp'), 'anyone in the group can rename it');
select public.update_group(:'grp', null, :'buyer' || '/group-new.webp');
select test.ok((select photo_path = :'buyer' || '/group-new.webp' from public.conversations where id = :'grp'), 'and change its picture');
do $$ begin
  perform public.update_group(current_setting('test.grp')::uuid, null, current_setting('test.sa') || '/not-mine.webp');
  perform test.ok(false, 'only to a picture they uploaded themselves');
exception when raise_exception then perform test.ok(true, 'only to a picture they uploaded themselves');
end $$;
commit;
select test.ok((select count(*) = 2 from public.messages where conversation_id = :'grp' and kind = 'event' and event ->> 'type' in ('renamed', 'photo')),
  'each change shows as a line in the chat');
begin;
select test.act_as(:'sa');
select test.ok(public.add_group_members(:'grp', array[:'owner'::uuid]) = 1, 'anyone in the group can add people');
do $$ begin
  perform public.remove_group_member(current_setting('test.grp')::uuid, (select id from public.profiles where username = 'owner'));
  perform test.ok(false, 'only whoever runs the group can take people out');
exception when insufficient_privilege then perform test.ok(true, 'only whoever runs the group can take people out');
end $$;
commit;
begin;
select test.act_as(:'sb');
select public.remove_group_member(:'grp', :'owner');
commit;
select test.ok(not exists (select 1 from public.conversation_members where conversation_id = :'grp' and user_id = :'owner')
  and (select event ->> 'type' = 'removed' from public.messages where conversation_id = :'grp' order by created_at desc limit 1),
  'whoever runs the group can take people out');
begin;
select test.act_as(:'sb');
select public.remove_group_member(:'grp', :'sb');
commit;
select test.ok((select c.created_by in (:'sa'::uuid, :'buyer'::uuid) from public.conversations c where c.id = :'grp')
  and not exists (select 1 from public.conversation_members where conversation_id = :'grp' and user_id = :'sb'),
  'whoever runs it can leave; someone still in it takes over');
begin;
select test.act_as(:'sa');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'sb');
select test.act_as(:'sb');
do $$ begin
  perform public.create_group('Blocked', array[current_setting('test.sa')::uuid, current_setting('test.buyer')::uuid]);
  perform test.ok(false, 'nobody can put someone who blocked them in a group');
exception when raise_exception then perform test.ok(true, 'nobody can put someone who blocked them in a group');
end $$;
rollback;

-- 66. Pinned messages: anyone in the conversation pins or unpins; everyone sees it.
begin;
select test.act_as(:'buyer');
select test.ok(public.pin_message(:'grp_msg', true), 'a message can be pinned');
commit;
select test.ok((select pinned_at is not null and pinned_by = :'buyer' from public.messages where id = :'grp_msg'),
  'it''s pinned for everyone, with who pinned it');
select test.ok((select event ->> 'type' = 'pinned' and event ->> 'message_id' = :'grp_msg'
  from public.messages where conversation_id = :'grp' order by created_at desc limit 1), 'a line says it was pinned');
begin;
select test.act_as(:'sa');
select test.ok(not public.pin_message(:'grp_msg', false), 'anyone else in it can unpin it');
do $$ begin
  perform public.pin_message((select id from public.messages where conversation_id = current_setting('test.grp')::uuid and kind = 'event' limit 1), true);
  perform test.ok(false, 'lines about the group can''t be pinned');
exception when raise_exception then perform test.ok(true, 'lines about the group can''t be pinned');
end $$;
commit;
begin;
select test.act_as(:'sb');
do $$ begin
  perform public.pin_message(current_setting('test.grp_msg')::uuid, true);
  perform test.ok(false, 'people outside the conversation can''t pin');
exception when no_data_found then perform test.ok(true, 'people outside the conversation can''t pin');
end $$;
rollback;
begin;
select test.act_as(:'sa');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'buyer');
do $$ begin
  perform public.pin_message((select id from public.messages where conversation_id = current_setting('test.conv')::uuid
    and kind = 'text' order by created_at desc limit 1), true);
  perform test.ok(false, 'nobody pins across a block');
exception when raise_exception then perform test.ok(true, 'nobody pins across a block');
end $$;
rollback;

-- 67. Beats in messages.
begin;
select test.act_as(:'buyer');
select test.ok((public.send_message(:'conv', '', '[]'::jsonb, '55555555-5555-4555-8555-555555555552') ->> 'kind') = 'beat',
  'a beat can be sent in a message');
do $$ begin
  perform public.send_message(current_setting('test.conv')::uuid, 'listen', '[]'::jsonb, '88888888-8888-4888-8888-888888888882');
  perform test.ok(false, 'only beats that are on sale');
exception when raise_exception then perform test.ok(true, 'only beats that are on sale');
end $$;
select test.ok((select e -> 'last_message' ->> 'body' = '🎵 Pack Two' from json_array_elements(public.list_conversations()) e where e ->> 'id' = :'conv'),
  'the inbox shows the beat''s name');
commit;

-- 68. Notifications: each only for whom it concerns. (Sales, follows, collaborations
-- and reviews earlier in these tests already made some.)
select test.ok((select count(*) = 1 from public.notifications n join public.order_items oi on oi.id = n.order_item_id
  where n.user_id = :'sb' and n.type = 'sale' and oi.order_id = :'collab_order' and n.actor_id = :'buyer'),
  'a sale tells the producer who bought what');
select test.ok((select count(*) = 1 from public.notifications n join public.order_items oi on oi.id = n.order_item_id
  where n.user_id = :'sa' and n.type = 'sale' and oi.order_id = :'collab_order'), 'and the co-producer');
select test.ok((select count(*) = 1 from public.notifications n join public.order_items oi on oi.id = n.order_item_id
  where n.user_id = :'sb' and n.type = 'sale' and oi.order_id = :'collab_pack_order' and n.pack_id is not null),
  'a pack sale is one notification, not one per beat');
select test.ok(exists (select 1 from public.notifications where user_id = :'sa' and type = 'collab_invite' and actor_id = :'sb'),
  'a collaboration invite tells the invited producer');
select test.ok(exists (select 1 from public.notifications where user_id = :'sb' and type = 'collab_accepted' and actor_id = :'sa'),
  'accepting it tells whoever invited');
select test.ok(exists (select 1 from public.notifications where user_id = :'sa' and type = 'beat_approved'
  and beat_id = '11111111-1111-4111-8111-111111111111'), 'an approved beat tells its producer');
begin;
select test.act_as(:'buyer');
insert into public.favorites (user_id, beat_id) values (auth.uid(), '55555555-5555-4555-8555-555555555552');
commit;
select test.ok((select count(*) = 2 from public.notifications where type = 'like' and actor_id = :'buyer'
  and beat_id = '55555555-5555-4555-8555-555555555552' and user_id in (:'sb', :'sa')), 'a like tells the producer and the co-producer');
begin;
select test.act_as(:'buyer');
delete from public.favorites where user_id = auth.uid() and beat_id = '55555555-5555-4555-8555-555555555552';
commit;
select test.ok((select count(*) = 0 from public.notifications where type = 'like' and actor_id = :'buyer'
  and beat_id = '55555555-5555-4555-8555-555555555552'), 'taking the like back removes it');
begin;
select test.act_as(:'sb');
insert into public.favorites (user_id, beat_id) values (auth.uid(), '55555555-5555-4555-8555-555555555552');
commit;
select test.ok((select count(*) = 1 from public.notifications where type = 'like' and actor_id = :'sb'
  and beat_id = '55555555-5555-4555-8555-555555555552' and user_id = :'sa'), 'liking your own beat only tells your co-producer');
delete from public.favorites where user_id = :'sb' and beat_id = '55555555-5555-4555-8555-555555555552';
-- Like the "Liked by" list: a producer you've blocked isn't told about your likes,
-- and blocking one takes back the likes they were told about.
begin;
select test.act_as(:'buyer');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'sa');
insert into public.favorites (user_id, beat_id) values (auth.uid(), '55555555-5555-4555-8555-555555555552');
commit;
select test.ok((select count(*) = 0 from public.notifications where type = 'like' and actor_id = :'buyer' and user_id = :'sa'
  and beat_id = '55555555-5555-4555-8555-555555555552'), 'a producer you blocked isn''t told about your like');
select test.ok((select count(*) = 1 from public.notifications where type = 'like' and actor_id = :'buyer' and user_id = :'sb'
  and beat_id = '55555555-5555-4555-8555-555555555552'), 'the co-producer you didn''t block is');
begin;
select test.act_as(:'buyer');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), :'sb');
commit;
select test.ok((select count(*) = 0 from public.notifications where type = 'like' and actor_id = :'buyer' and user_id = :'sb'),
  'blocking a producer takes back the likes they were told about');
delete from public.user_blocks where blocker_id = :'buyer' and blocked_id in (:'sa', :'sb');
delete from public.favorites where user_id = :'buyer' and beat_id = '55555555-5555-4555-8555-555555555552';
begin;
select test.act_as(:'owner', 'aal2');
insert into public.follows (follower_id, followee_id) values (auth.uid(), :'sa');
commit;
select test.ok(exists (select 1 from public.notifications where user_id = :'sa' and type = 'follow' and actor_id = :'owner'),
  'a new follower is a notification');
begin;
select test.act_as(:'owner', 'aal2');
delete from public.follows where follower_id = auth.uid() and followee_id = :'sa';
commit;
select test.ok(not exists (select 1 from public.notifications where user_id = :'sa' and type = 'follow' and actor_id = :'owner'),
  'unfollowing removes it');
begin;
update public.beats set status = 'pending' where id = '55555555-5555-4555-8555-555555555551';
select test.act_as(:'owner', 'aal2');
update public.beats set status = 'rejected', rejection_reason = 'Too quiet' where id = '55555555-5555-4555-8555-555555555551';
reset role;
select test.ok(exists (select 1 from public.notifications where user_id = :'sb' and type = 'beat_rejected'
  and beat_id = '55555555-5555-4555-8555-555555555551' and data ->> 'reason' = 'Too quiet'), 'a rejected beat tells its producer why');
rollback;
begin;
select test.act_as(:'buyer');
select test.ok((select count(*) = 0 from public.notifications where user_id <> auth.uid()), 'people only see their own notifications');
do $$ begin
  insert into public.notifications (user_id, type) values (auth.uid(), 'follow');
  perform test.ok(false, 'nobody can write notifications themselves');
exception when insufficient_privilege then perform test.ok(true, 'nobody can write notifications themselves');
end $$;
rollback;
begin;
select test.act_as(:'sb');
select test.ok(public.unread_notification_count() > 0, 'the bell counts unread notifications');
select test.ok((select bool_and((x -> 'actor') is not null or x ->> 'type' in ('beat_approved', 'beat_rejected', 'pack_approved', 'pack_rejected'))
  from json_array_elements(public.list_notifications()) x), 'each one says who did it');
select test.ok(public.mark_notifications_read() > 0, 'marking them read…');
select test.ok(public.unread_notification_count() = 0, '…clears the count');
rollback;

\echo '--- all security tests passed ---'
