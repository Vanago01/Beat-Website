-- =============================================================================
-- VBEATS — two-factor authentication (TOTP)
--
-- * Administrators only have admin powers after a two-factor sign-in
--   (session assurance level "aal2"). A stolen admin password alone is useless.
-- * Anyone who has set up two-factor authentication is protected the same way:
--   a password-only session can't read or change their data, sell, buy or
--   upload until the code has been entered.
--
-- Run after files 1–5. Safe to run more than once.
-- =============================================================================

-- True when the current request may act as its user: either the session passed
-- two-factor sign-in, or the user has no verified second factor.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;

grant execute on function public.mfa_satisfied() to anon, authenticated, service_role;

-- Admin powers require a two-factor sign-in.
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
  ) and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- Seller powers (uploads, studio data) wait for the code when 2FA is set up.
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
  ) and public.mfa_satisfied();
$$;

-- Same guard as before, plus: a session that still has to enter its code can't
-- change the account (this also covers become_seller()).
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

  if (select auth.uid()) = old.id and not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
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

-- Every table (and the file storage) ignores password-only sessions of users
-- who have two-factor authentication set up. Restrictive policies are combined
-- with AND, so the existing rules stay exactly as they were.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists require_two_factor on public.%I', t.relname);
    execute format(
      'create policy require_two_factor on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t.relname
    );
  end loop;
end $$;

drop policy if exists require_two_factor on storage.objects;
create policy require_two_factor on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
