-- Allow admin-triggered "seed soil requirements" runs to record their
-- lifecycle in plant_library_runs alongside seed/verify runs, so the Plant
-- Library Admin's Recent-runs table + live polling + cost tracking work for
-- them too. Additive: widens the kind CHECK to include 'sensor_ranges'.

ALTER TABLE public.plant_library_runs
  DROP CONSTRAINT IF EXISTS plant_library_runs_kind_check;

ALTER TABLE public.plant_library_runs
  ADD CONSTRAINT plant_library_runs_kind_check
  CHECK (kind IN ('seed', 'verify', 'sensor_ranges'));
