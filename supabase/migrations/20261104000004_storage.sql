-- =============================================================================
-- Storage buckets & policies
--   avatars    public   profile pictures / banners           <uid>/...
--   covers     public   beat artwork                         <uid>/<beat>/...
--   previews   public   streamable (tagged) preview audio    <uid>/<beat>/...
--   beat-files PRIVATE  purchased deliverables (MP3/WAV/stems) <uid>/<beat>/...
-- Paid files are never public: buyers receive short-lived signed URLs that
-- the server issues only after verifying a purchase.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('covers', 'covers', true, 10485760,
    array['image/png', 'image/jpeg', 'image/webp']),
  ('previews', 'previews', true, 52428800,
    array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
          'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/x-flac']),
  ('beat-files', 'beat-files', false, 524288000,
    array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
          'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff',
          'application/zip', 'application/x-zip-compressed', 'application/vnd.rar',
          'application/x-rar-compressed', 'application/x-7z-compressed'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------- avatars ---
create policy "avatars: users upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owners and admins read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "avatars: owners and admins update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "avatars: owners and admins delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- ------------------------------------------- beat media (covers/previews/files) ---
create policy "beat media: sellers upload to their own folder, admins anywhere"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('covers', 'previews', 'beat-files')
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_seller()))
      or (select public.is_admin())
    )
  );

create policy "beat media: owners and admins read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('covers', 'previews', 'beat-files')
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "beat media: owners and admins update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('covers', 'previews', 'beat-files')
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "beat media: owners and admins delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('covers', 'previews', 'beat-files')
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
