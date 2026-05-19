-- ============================================================
-- PLANT DOCTOR PHOTO ANNOTATIONS (Phase 2 Wave 2 Pass 3)
-- Lets users place numbered markers on a Plant Doctor photo to
-- flag specific areas of interest (e.g. "brown patch", "bite marks").
-- Stored as an array of { x, y, label } objects on the existing
-- plant_doctor_sessions row.
-- ============================================================

ALTER TABLE public.plant_doctor_sessions
  ADD COLUMN IF NOT EXISTS annotations jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.plant_doctor_sessions.annotations IS
  'Array of { x, y, label } where x and y are normalised (0–1) positions on the image and label is a short user-supplied note.';
