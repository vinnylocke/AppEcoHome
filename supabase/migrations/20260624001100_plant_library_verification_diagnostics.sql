-- Plant Library — verification diagnostics
--
-- Adds two columns so we can see why rows fail verification + stop
-- them looping forever:
--
--   verification_attempts  — how many times the verifier has picked
--                            this row. Incremented on every failure.
--   verification_error     — last error message recorded when the
--                            verifier couldn't complete the row.
--                            Cleared back to NULL on success.
--
-- After MAX_ATTEMPTS (3) failures the verifier default-passes the
-- row (valid = true) so the seed→verify pipeline doesn't churn the
-- same broken rows every run, while still leaving the error visible
-- in the admin UI for diagnosis.

ALTER TABLE public.plant_library
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_error    text;

COMMENT ON COLUMN public.plant_library.verification_attempts IS
  'Cumulative count of verification attempts. Incremented on each failure; not reset on success.';
COMMENT ON COLUMN public.plant_library.verification_error IS
  'Last error message recorded by verify-plant-library. NULL on success or before first failure.';

-- Index for the admin "stuck rows" panel — filter by attempts > 0.
CREATE INDEX IF NOT EXISTS plant_library_failed_verification_idx
  ON public.plant_library (verification_attempts DESC)
  WHERE verification_attempts > 0;
