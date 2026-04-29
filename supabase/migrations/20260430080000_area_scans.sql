-- ============================================================
-- AREA SCANS: persist AI analysis results against an area
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_scans (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id      uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id      uuid        NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  image_url    text,
  image_path   text,
  analysis     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  questions    jsonb,
  weather_snap jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_scans_area    ON public.area_scans (area_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_area_scans_home    ON public.area_scans (home_id, created_at DESC);

ALTER TABLE public.area_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_read_area_scans"
  ON public.area_scans FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_can_insert_area_scans"
  ON public.area_scans FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_can_update_area_scans"
  ON public.area_scans FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_can_delete_area_scans"
  ON public.area_scans FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));


-- ============================================================
-- AREA SCAN AILMENTS: link pests/diseases found in a scan
--                     to the home's AilmentWatchlist
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_scan_ailments (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  area_scan_id uuid        NOT NULL REFERENCES public.area_scans(id) ON DELETE CASCADE,
  ailment_id   uuid        NOT NULL REFERENCES public.ailments(id) ON DELETE CASCADE,
  notes        text,
  severity     text        CHECK (severity IN ('mild', 'moderate', 'severe')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_scan_id, ailment_id)
);

CREATE INDEX IF NOT EXISTS idx_area_scan_ailments_scan    ON public.area_scan_ailments (area_scan_id);
CREATE INDEX IF NOT EXISTS idx_area_scan_ailments_ailment ON public.area_scan_ailments (ailment_id);

ALTER TABLE public.area_scan_ailments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_read_area_scan_ailments"
  ON public.area_scan_ailments FOR SELECT TO authenticated
  USING (area_scan_id IN (
    SELECT id FROM public.area_scans
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "home_members_can_insert_area_scan_ailments"
  ON public.area_scan_ailments FOR INSERT TO authenticated
  WITH CHECK (area_scan_id IN (
    SELECT id FROM public.area_scans
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "home_members_can_delete_area_scan_ailments"
  ON public.area_scan_ailments FOR DELETE TO authenticated
  USING (area_scan_id IN (
    SELECT id FROM public.area_scans
    WHERE home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  ));
