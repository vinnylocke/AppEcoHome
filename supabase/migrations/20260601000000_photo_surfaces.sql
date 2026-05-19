-- ============================================================
-- PHOTO SURFACES (Phase 2 Wave 2 Pass 2)
-- Adds photo columns to task completions and ailment links, so
-- users can attach visual evidence of a finished task or a
-- pest/disease on a specific plant. Photos are then unioned into
-- the per-plant Photo Timeline.
-- ============================================================

-- 1. Task completion photo
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_photo_url text;

-- 2. Ailment photo + freeform notes
ALTER TABLE public.plant_instance_ailments
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.plant_instance_ailments
  ADD COLUMN IF NOT EXISTS notes text;

-- 3. Index for the timeline union query. tasks.inventory_item_ids is an
--    array, so we use a GIN index restricted to rows that actually have
--    a completion photo — keeps the index small while still letting the
--    photo-timeline query find tasks attached to a given plant instance.
CREATE INDEX IF NOT EXISTS idx_tasks_inventory_completion_photo
  ON public.tasks USING gin (inventory_item_ids)
  WHERE completion_photo_url IS NOT NULL;

-- 4. Same idea for ailment links
CREATE INDEX IF NOT EXISTS idx_pia_photo_url
  ON public.plant_instance_ailments (plant_instance_id)
  WHERE photo_url IS NOT NULL;
