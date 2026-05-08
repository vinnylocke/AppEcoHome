-- Corrective migration: the previous security hardening migration (20260513000000)
-- referenced bucket id 'area_scans' but the actual bucket id is 'area-scans'.
-- This migration re-applies those changes with the correct id.

-- Make the bucket private
UPDATE storage.buckets
  SET public = false
  WHERE id = 'area-scans';

-- Drop the old permissive public read policy created in 20260430090000
DROP POLICY IF EXISTS "public_read_area_scans" ON storage.objects;

-- Drop the incorrectly-named policy from the first security migration (no-op if it matched nothing)
DROP POLICY IF EXISTS "home members read area scans" ON storage.objects;

-- Home-membership-scoped read: only members of the home that owns the scan can read it.
-- Scan files are stored as {home_id}/{area_id}/{filename}.
CREATE POLICY "home members read area scans"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'area-scans'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Reinforce MIME whitelist (already set on bucket creation, but ensure it is current)
UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  WHERE id = 'area-scans';
