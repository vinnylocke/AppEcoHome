-- Add guide-matching labels to the plants table.
-- Auto-derived from Perenual data for API/AI plants at insert time.
-- Editable by the user for manual plants via the Care Guide form.
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_plants_labels ON public.plants USING gin (labels);
