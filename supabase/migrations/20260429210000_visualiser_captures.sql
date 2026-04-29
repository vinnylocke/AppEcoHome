-- ============================================================
-- VISUALISER CAPTURES: saved camera overlay screenshots
-- ============================================================

-- 1. Core table
CREATE TABLE IF NOT EXISTS public.visualiser_captures (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id     uuid        NOT NULL,
  image_url   text        NOT NULL,  -- storage path: {home_id}/{timestamp}.jpg
  plant_ids   integer[],             -- plants.id values that were in view
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visualiser_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_captures" ON public.visualiser_captures;
CREATE POLICY "users_manage_own_captures"
  ON public.visualiser_captures FOR ALL
  TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.user_profiles WHERE uid = auth.uid()
    )
  )
  WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.user_profiles WHERE uid = auth.uid()
    )
  );

-- 2. Storage bucket: visualiser-captures (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('visualiser-captures', 'visualiser-captures', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users_upload_captures_storage" ON storage.objects;
CREATE POLICY "users_upload_captures_storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visualiser-captures'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.user_profiles WHERE uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_read_captures_storage" ON storage.objects;
CREATE POLICY "users_read_captures_storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visualiser-captures'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.user_profiles WHERE uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_delete_captures_storage" ON storage.objects;
CREATE POLICY "users_delete_captures_storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visualiser-captures'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.user_profiles WHERE uid = auth.uid()
    )
  );
