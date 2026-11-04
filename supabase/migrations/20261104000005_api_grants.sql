-- =============================================================================
-- NOIRWAVE — API privileges
--
-- Supabase no longer gives the API roles (anon, authenticated, service_role)
-- access to new objects in the public schema automatically. That is the
-- default for new projects since 30 May 2026 and applies to all projects from
-- 30 October 2026. This file grants exactly what the site needs.
--
-- Row Level Security (file 2) still decides which rows each user can see or
-- change, and the guard triggers (file 1) still apply.
--
-- Run after files 1–4. Safe to run more than once.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ------------------------------------------------------------- tables -------
-- Visitors only read (RLS limits them to published content). Signed-in users
-- read and write where the policies allow. The server (service role) handles
-- orders, payouts and moderation.
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Buyers may only edit the rating and text of their own reviews.
revoke update on public.reviews from anon, authenticated;
grant update (rating, comment) on public.reviews to authenticated;

-- ---------------------------------------------------------- functions -------
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Internal / server-only functions must not be callable from the browser.
revoke execute on function public.create_pending_order(uuid, text, public.currency_code, uuid[]) from public, anon, authenticated;
revoke execute on function public.fulfill_order(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_order_failed(uuid, public.order_status) from public, anon, authenticated;
revoke execute on function public.apply_order_refund(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refresh_beat_price_summary(uuid) from public, anon, authenticated;
revoke execute on function public.assert_beat_publishable(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Signed-in only.
revoke execute on function public.become_seller(text) from public, anon;
revoke execute on function public.save_beat(jsonb, jsonb, public.beat_status, boolean) from public, anon;
revoke execute on function public.seller_dashboard() from public, anon;
revoke execute on function public.seller_sales(integer, integer) from public, anon;
revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.admin_list_users(text, public.user_role, integer, integer) from public, anon;
