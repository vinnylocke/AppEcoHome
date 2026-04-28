-- Add is_archived to ailments table
ALTER TABLE public.ailments
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ailments_archived
  ON public.ailments (home_id, is_archived);
