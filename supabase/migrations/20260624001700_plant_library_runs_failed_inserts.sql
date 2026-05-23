-- Plant Library — failed insert log per run
--
-- Stores per-row inserted-failed details on the run so the admin
-- can see WHICH plants couldn't be added and WHY (postgres type
-- mismatch, NOT NULL violation, malformed jsonb, etc) without
-- digging into Sentry. Mirrors what the verifier exposes via the
-- "Stuck verifications" panel.
--
-- Shape per entry:
--   { common_name, scientific_name, error, at }
--
-- Capped at 200 entries per run inside the seeder to keep the row
-- size bounded on pathological runs.

ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS failed_inserts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.plant_library_runs.failed_inserts IS
  'Array of { common_name, scientific_name, error, at } for each plant the seeder couldn''t insert. Capped at 200 entries per run.';

-- Partial index for the admin "Failed seed inserts" query — we
-- only ever look at runs that actually have failures.
CREATE INDEX IF NOT EXISTS plant_library_runs_failed_inserts_idx
  ON public.plant_library_runs (started_at DESC)
  WHERE jsonb_array_length(failed_inserts) > 0;
