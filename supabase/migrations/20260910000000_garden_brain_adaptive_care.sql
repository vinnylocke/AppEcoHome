-- ─── Garden Brain Phase 1: adaptive care (care_adjustments + reconcile cron) ──
--
-- Nightly, `garden-brain-reconcile` joins measured soil reality
-- (soil_moisture_profiles + device_readings) with plant needs
-- (plants.soil_moisture_min/max) and the home's watering blueprints /
-- automations, and proposes verified schedule adjustments:
--   tighten_watering / stretch_watering — change an existing blueprint's cadence
--   create_watering_routine            — bed shows real need, nothing covers it
--   stress_risk                        — hot week will outrun the schedule
--   in_range                           — quiet "on track" record (good news)
--
-- Proposals are one-tap applied/dismissed from the dashboard AdaptiveCareCard;
-- applied ones are RE-MEASURED ≥7 days later and marked verified_good/mixed —
-- the trust loop is the feature.

CREATE TABLE public.care_adjustments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id                   uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  area_id                   uuid REFERENCES public.areas(id) ON DELETE CASCADE,
  blueprint_id              uuid REFERENCES public.task_blueprints(id) ON DELETE CASCADE,
  kind                      text NOT NULL CHECK (kind IN
    ('tighten_watering','stretch_watering','stress_risk','in_range','create_watering_routine')),
  current_frequency_days    int,
  suggested_frequency_days  int,
  -- The full deterministic evidence block: target band, pctTimeBelowFloor,
  -- drydown rate used (+ which weather segment), daysToFloor, sample window.
  evidence                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                    text NOT NULL DEFAULT 'proposed' CHECK (status IN
    ('proposed','applied','dismissed','superseded','verified_good','verified_mixed')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  applied_at                timestamptz,
  applied_by                uuid,
  verified_at               timestamptz,
  -- Post-change re-measurement: { inRangeDays, windowDays, pctTimeBelowFloor, deltaPct }
  verification              jsonb
);

-- One OPEN proposal per (home, area, kind); a fresh nightly result supersedes.
CREATE UNIQUE INDEX care_adjustments_open_uniq
  ON public.care_adjustments (home_id, area_id, kind)
  WHERE status = 'proposed';

CREATE INDEX care_adjustments_home_status_idx
  ON public.care_adjustments (home_id, status);

ALTER TABLE public.care_adjustments ENABLE ROW LEVEL SECURITY;

-- Members read + act on their home's proposals; only the service role inserts.
CREATE POLICY care_adjustments_select ON public.care_adjustments
  FOR SELECT USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );
CREATE POLICY care_adjustments_update ON public.care_adjustments
  FOR UPDATE USING (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
  );

-- Data API exposure (2026-10 rule): explicit grants for new tables.
GRANT SELECT, UPDATE ON TABLE public.care_adjustments TO authenticated;

-- ── Nightly reconcile cron — 03:45, after compute-soil-profiles (03:00) ──────
create extension if not exists pg_cron;

select cron.schedule(
  'garden-brain-reconcile-daily',
  '45 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/garden-brain-reconcile',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
