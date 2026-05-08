-- Security hardening migration
-- 1. Rate limit log table
-- 2. area_scans bucket → private + home-scoped read policy
-- 3. MIME type whitelists on upload buckets

-- ── 1. Rate limit log ──────────────────────────────────────────────────────────

CREATE TABLE public.rate_limit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text        NOT NULL,
  window_start  timestamptz NOT NULL,
  call_count    integer     NOT NULL DEFAULT 1,
  UNIQUE (user_id, function_name, window_start)
);

CREATE INDEX ON public.rate_limit_log (user_id, function_name, window_start DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role key, so they bypass RLS.
-- No authenticated user policy is needed — this table is only touched server-side.
-- Add a safety deny-all for direct client access:
CREATE POLICY "deny direct client access"
  ON public.rate_limit_log
  FOR ALL TO authenticated
  USING (false);

-- ── 2. area_scans bucket → private ────────────────────────────────────────────

-- Make the bucket private so public URLs stop working
UPDATE storage.buckets
  SET public = false
  WHERE id = 'area_scans';

-- Drop the old open SELECT policy
DROP POLICY IF EXISTS "public read area scans" ON storage.objects;
DROP POLICY IF EXISTS "Public read" ON storage.objects;

-- Home-membership-scoped read: only members of the home that owns the scan can read it
-- Scan files are stored as {home_id}/{filename}
CREATE POLICY "home members read area scans"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'area_scans'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- ── 3. MIME type whitelists ────────────────────────────────────────────────────

-- plant-images: only real raster images (no SVG — SVG can carry JS)
UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  WHERE id = 'plant-images';

-- community-guides images
UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  WHERE id = 'community-guides';

-- area_scans (already requires raster; reinforce)
UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  WHERE id = 'area_scans';
