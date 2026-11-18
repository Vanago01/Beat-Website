-- =============================================================================
-- VBEATS — plug-in downloads (DLAY)
--
-- A private bucket for the installers of the plug-ins the site hands out.
-- Nobody reads it directly: a signed-in member gets a 60-second signed link from
-- the server (/api/plugins/<plugin>/download), the same way purchased beat files
-- are delivered. There are no storage policies for this bucket on purpose, so
-- only the server (service role) and the Supabase dashboard can touch it.
--
-- The site owner puts the files there (dashboard → Storage → plugin-files), one
-- folder per plug-in, named <Name>-<version>-<Windows|macOS>.zip:
--
--   dlay/DLAY-1.1.0-Windows.zip
--   dlay/DLAY-1.1.0-macOS.zip
--
-- The site offers the highest version it finds for each system.
--
-- Run after files 1–14. Safe to run more than once.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('plugin-files', 'plugin-files', false, 209715200, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
