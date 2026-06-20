-- Soil-moisture behaviour model — Pillar A of the automation-intelligence feature.
-- A deterministic per-device drydown profile computed from device_readings +
-- weather_snapshots by the `compute-soil-profiles` function (no AI). Reused by
-- the Moisture-behaviour card, automation suggestions, and plant recommendations.
-- See docs/plans/automation-intelligence-and-soil-drydown.md.

CREATE TABLE IF NOT EXISTS public.soil_moisture_profiles (
  device_id                 uuid PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  home_id                   uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id                   uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  -- Median dry-down slope across detected segments, %/day (positive = drying).
  -- NULL when there isn't enough clean data yet.
  drydown_rate_pct_per_day  numeric,
  retention_class           text NOT NULL DEFAULT 'unknown'
                              CHECK (retention_class IN ('fast_draining','balanced','moisture_retentive','unknown')),
  -- [{ key: 'hot_dry'|'mild'|'cool_wet', ratePerDay: number, segments: int }]
  drydown_by_weather        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- { rewetCount, avgRewetJump, avgSegmentDurationDays }
  watering_response         jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_segments           int NOT NULL DEFAULT 0,
  confidence                numeric NOT NULL DEFAULT 0,   -- 0..1
  based_on_reading_at       timestamptz,
  computed_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soil_moisture_profiles_home ON public.soil_moisture_profiles (home_id);
CREATE INDEX IF NOT EXISTS idx_soil_moisture_profiles_area ON public.soil_moisture_profiles (area_id);

ALTER TABLE public.soil_moisture_profiles ENABLE ROW LEVEL SECURITY;

-- Home members can read their profiles. Writes happen only from the edge
-- function (service role bypasses RLS), so no insert/update/delete policy.
DROP POLICY IF EXISTS "soil_moisture_profiles_select_members" ON public.soil_moisture_profiles;
CREATE POLICY "soil_moisture_profiles_select_members" ON public.soil_moisture_profiles
  FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- Required so the Data API exposes the table (RLS still gates the actual rows).
-- SELECT only — clients read; all writes are service-role.
GRANT SELECT ON TABLE public.soil_moisture_profiles TO authenticated;
