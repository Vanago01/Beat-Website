-- =============================================================================
-- VBEATS — who downloaded the plug-ins
--
-- * Every plug-in download is recorded, like an order: a download number, the
--   member (and their email at the time), which plug-in, system and version,
--   and when. Admins see them in Admin → Orders → Plug-in downloads.
-- * Only admins can read them. They're written by the site's server (service
--   role) when it hands out the installer; members can't add or change them.
-- * Deleting an account deletes its download records too.
--
-- Run after files 1–18. Safe to run more than once.
-- =============================================================================

create table if not exists public.plugin_downloads (
  id uuid primary key default gen_random_uuid(),
  download_number bigint generated always as identity (start with 1001) unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text check (char_length(email) <= 320),
  plugin text not null check (plugin ~ '^[a-z0-9-]{1,40}$'),
  platform text not null check (platform in ('windows', 'macos')),
  version text check (char_length(version) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists plugin_downloads_created_idx on public.plugin_downloads (created_at desc);
create index if not exists plugin_downloads_user_idx on public.plugin_downloads (user_id, plugin, platform, created_at desc);

alter table public.plugin_downloads enable row level security;

drop policy if exists "admins read plug-in downloads" on public.plugin_downloads;
create policy "admins read plug-in downloads"
  on public.plugin_downloads for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists require_two_factor on public.plugin_downloads;
create policy require_two_factor on public.plugin_downloads as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on public.plugin_downloads from anon, authenticated;
grant select on public.plugin_downloads to authenticated;
grant all on public.plugin_downloads to service_role;

-- Totals per plug-in for the admin list: downloads and how many different people.
-- Runs with the caller's rights, so anyone but an admin gets nothing.
create or replace function public.plugin_download_stats()
returns table (plugin text, downloads bigint, people bigint)
language sql
stable
set search_path = ''
as $$
  select d.plugin, count(*), count(distinct d.user_id)
  from public.plugin_downloads d
  group by d.plugin
  order by d.plugin;
$$;

revoke all on function public.plugin_download_stats() from public, anon;
grant execute on function public.plugin_download_stats() to authenticated, service_role;

-- Let the API see the new table straight away.
notify pgrst, 'reload schema';
