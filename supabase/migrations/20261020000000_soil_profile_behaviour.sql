-- Soil behaviour indicators (2026-07-22): compute-soil-profiles now also
-- summarises soil temperature (day peak / overnight low / diurnal swing) and
-- EC (mean, stability class, trend) over the trailing 7 days, surfaced on the
-- device detail modal. Additive columns on the existing profile row.
ALTER TABLE public.soil_moisture_profiles
  ADD COLUMN IF NOT EXISTS temp_behaviour jsonb,
  ADD COLUMN IF NOT EXISTS ec_behaviour jsonb;

COMMENT ON COLUMN public.soil_moisture_profiles.temp_behaviour IS
  'TempBehaviour from _shared/soilProfile/behaviour.ts: { dayMaxC, nightMinC, diurnalSwingC, sampleDays } over the trailing 7 days.';
COMMENT ON COLUMN public.soil_moisture_profiles.ec_behaviour IS
  'EcBehaviour from _shared/soilProfile/behaviour.ts: { mean, cv, stability, trend, sampleDays, ecSource } over the trailing 7 days.';
