-- Allow user-uploaded 'personal' images as a sprite source
ALTER TABLE public.plant_sprites
  DROP CONSTRAINT IF EXISTS plant_sprites_source_check;

ALTER TABLE public.plant_sprites
  ADD CONSTRAINT plant_sprites_source_check
  CHECK (source IN ('pixabay', 'perenual', 'wikipedia', 'inaturalist', 'fallback', 'personal'));
