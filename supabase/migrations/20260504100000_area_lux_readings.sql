-- ============================================================
-- AREA LUX READINGS
-- Replaces the single light_intensity_lux value on areas with
-- a time-series table so multiple readings (sensor, manual, plant)
-- accumulate over time, giving the AI richer light-level context.
--
-- areas.light_intensity_lux is kept as a denormalized "latest" value
-- and is updated by application code whenever a new reading is added.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_lux_readings (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id      uuid        NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  lux_value    integer     NOT NULL CHECK (lux_value >= 0),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'sensor'
                           CHECK (source IN ('sensor', 'manual', 'plant'))
);

ALTER TABLE public.area_lux_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_area_lux_readings"
  ON public.area_lux_readings FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_area_lux_readings"
  ON public.area_lux_readings FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_area_lux_readings"
  ON public.area_lux_readings FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_area_lux_readings_area
  ON public.area_lux_readings (area_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_area_lux_readings_home
  ON public.area_lux_readings (home_id);

GRANT SELECT, INSERT, DELETE ON public.area_lux_readings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_lux_readings TO service_role;
