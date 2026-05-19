-- Garden Shape Photos — Wave 7D
-- Allows users to attach photos to individual garden_shapes for visual history
-- and (later) drive Plant Doctor "diagnose this bed" workflows.

CREATE TABLE IF NOT EXISTS public.garden_shape_photos (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shape_id                    uuid        NOT NULL REFERENCES public.garden_shapes(id) ON DELETE CASCADE,
  home_id                     uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  photo_path                  text        NOT NULL,
  caption                     text,
  taken_at                    timestamptz NOT NULL DEFAULT now(),
  plant_doctor_session_id     uuid,
  created_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garden_shape_photos_shape ON public.garden_shape_photos(shape_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_garden_shape_photos_home ON public.garden_shape_photos(home_id);

ALTER TABLE public.garden_shape_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_members_read_shape_photos"   ON public.garden_shape_photos;
DROP POLICY IF EXISTS "home_members_insert_shape_photos" ON public.garden_shape_photos;
DROP POLICY IF EXISTS "home_members_update_shape_photos" ON public.garden_shape_photos;
DROP POLICY IF EXISTS "home_members_delete_shape_photos" ON public.garden_shape_photos;

CREATE POLICY "home_members_read_shape_photos"
  ON public.garden_shape_photos FOR SELECT TO authenticated
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

CREATE POLICY "home_members_insert_shape_photos"
  ON public.garden_shape_photos FOR INSERT TO authenticated
  WITH CHECK (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

CREATE POLICY "home_members_update_shape_photos"
  ON public.garden_shape_photos FOR UPDATE TO authenticated
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

CREATE POLICY "home_members_delete_shape_photos"
  ON public.garden_shape_photos FOR DELETE TO authenticated
  USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

-- Storage bucket for photo files. Idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('garden-photos', 'garden-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — home members can read/write their own home's photos.
-- Paths are namespaced by home_id / shape_id / file.
DROP POLICY IF EXISTS "garden_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "garden_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "garden_photos_delete" ON storage.objects;

CREATE POLICY "garden_photos_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'garden-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "garden_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'garden-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "garden_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'garden-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT home_id::text FROM public.home_members WHERE user_id = auth.uid()
    )
  );
