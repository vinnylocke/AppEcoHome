-- AI Area Coach (2026-06-17)
-- Cached per-area AI sensor analysis. One row per area. The
-- `area-sensor-analysis` edge function regenerates the insight only when a
-- device_reading newer than `based_on_reading_at` arrives (a live reading or
-- a manual log), so we never re-spend on Gemini for unchanged data.

CREATE TABLE IF NOT EXISTS public.area_ai_insights (
  area_id              uuid PRIMARY KEY REFERENCES public.areas(id) ON DELETE CASCADE,
  home_id              uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  insight              jsonb NOT NULL,
  -- The latest device_reading recorded_at this insight reflects. NULL when the
  -- analysis ran with no sensor data at all.
  based_on_reading_at  timestamptz,
  persona              text,
  model                text,
  generated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_ai_insights_home ON public.area_ai_insights (home_id);

ALTER TABLE public.area_ai_insights ENABLE ROW LEVEL SECURITY;

-- Members of the home can read their area insights. Writes happen only from the
-- edge function (service role bypasses RLS), so no insert/update/delete policy.
DROP POLICY IF EXISTS "area_ai_insights_select_members" ON public.area_ai_insights;
CREATE POLICY "area_ai_insights_select_members" ON public.area_ai_insights
  FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

-- Required so the Data API exposes the table (RLS still gates the actual rows).
-- SELECT only — clients read the cached insight; all writes are service-role.
GRANT SELECT ON TABLE public.area_ai_insights TO authenticated;
