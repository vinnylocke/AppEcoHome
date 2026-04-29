-- ============================================================
-- PLANT SPRITES: sprite cache for the Plant Visualiser
-- ============================================================

-- 1. Core table
CREATE TABLE IF NOT EXISTS public.plant_sprites (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id       integer     REFERENCES public.plants(id) ON DELETE CASCADE,
  perenual_id    integer,
  sprite_url     text        NOT NULL,
  source         text        NOT NULL
                             CHECK (source IN ('pixabay', 'perenual', 'wikipedia', 'inaturalist', 'fallback')),
  plant_name     text,
  height_min_cm  integer,
  height_max_cm  integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plant_sprites_perenual
  ON public.plant_sprites (perenual_id)
  WHERE perenual_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plant_sprites_name
  ON public.plant_sprites (plant_name)
  WHERE plant_name IS NOT NULL;

ALTER TABLE public.plant_sprites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all sprites (shared cache across homes)
DROP POLICY IF EXISTS "authenticated_read_plant_sprites" ON public.plant_sprites;
CREATE POLICY "authenticated_read_plant_sprites"
  ON public.plant_sprites FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can insert sprites
DROP POLICY IF EXISTS "authenticated_insert_plant_sprites" ON public.plant_sprites;
CREATE POLICY "authenticated_insert_plant_sprites"
  ON public.plant_sprites FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Storage bucket: plant-sprites (public read, auth write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-sprites', 'plant-sprites', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_plant_sprites_storage" ON storage.objects;
CREATE POLICY "public_read_plant_sprites_storage"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'plant-sprites');

DROP POLICY IF EXISTS "auth_upload_plant_sprites_storage" ON storage.objects;
CREATE POLICY "auth_upload_plant_sprites_storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'plant-sprites');

DROP POLICY IF EXISTS "auth_delete_plant_sprites_storage" ON storage.objects;
CREATE POLICY "auth_delete_plant_sprites_storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'plant-sprites');
