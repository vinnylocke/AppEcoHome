-- ─── Wave 21 — Weekly Overview + notification bundle ──────────────────────
--
-- Adds two new tables (weekly_overviews, pollen_snapshots) and three new
-- cron jobs (generate-weekly-overviews on Sunday 06:00 UTC,
-- weekly-optimise-digest on Sunday 07:00 UTC, fetch-pollen daily at 02:00
-- UTC). Golden hour notifications are wired by extending the existing
-- daily-batch-notifications cron — no schema change needed for that
-- because they just write into the existing public.notifications table.

-- ─── 1. weekly_overviews ─────────────────────────────────────────────────
--
-- One row per home per week. `payload` is a jsonb document that holds
-- everything the /weekly page renders, plus the optional AI tips and
-- pest/disease risk lines that Wave 21.D adds. Schema-light so future
-- payload additions don't need a migration.

CREATE TABLE IF NOT EXISTS public.weekly_overviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id      uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (home_id, week_start)
);

COMMENT ON TABLE public.weekly_overviews IS
  'Generated weekly by the generate-weekly-overviews cron. One row per home per Monday-Sunday week. Payload is jsonb so additional sections (AI tips, pest/disease risk, pollen) can land without schema changes.';

CREATE INDEX IF NOT EXISTS weekly_overviews_home_week_idx
  ON public.weekly_overviews (home_id, week_start DESC);

ALTER TABLE public.weekly_overviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_overviews members read"  ON public.weekly_overviews;
DROP POLICY IF EXISTS "weekly_overviews service write" ON public.weekly_overviews;

CREATE POLICY "weekly_overviews members read"
  ON public.weekly_overviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = weekly_overviews.home_id
        AND hm.user_id = auth.uid()
    )
  );

GRANT SELECT ON TABLE public.weekly_overviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_overviews TO service_role;

-- ─── 2. pollen_snapshots ─────────────────────────────────────────────────
--
-- Daily pollen counts pulled from Open-Meteo's Air Quality API by the
-- fetch-pollen cron. Grass / birch / ragweed are the three Pl@ntNet-style
-- big hitters. One row per home per snapshot day.

CREATE TABLE IF NOT EXISTS public.pollen_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  -- Hourly counts compacted into per-day-of-week peaks for easy reading.
  -- Shape: { "grass": [{day:"Mon", peak:35, level:"high"}, …],
  --          "birch": […], "ragweed": […] }
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (home_id, snapshot_date)
);

COMMENT ON TABLE public.pollen_snapshots IS
  'Pollen forecast for the week ahead, pulled daily from Open-Meteo. Surfaced via the weekly overview page.';

CREATE INDEX IF NOT EXISTS pollen_snapshots_home_date_idx
  ON public.pollen_snapshots (home_id, snapshot_date DESC);

ALTER TABLE public.pollen_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pollen_snapshots members read" ON public.pollen_snapshots;

CREATE POLICY "pollen_snapshots members read"
  ON public.pollen_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = pollen_snapshots.home_id
        AND hm.user_id = auth.uid()
    )
  );

GRANT SELECT ON TABLE public.pollen_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pollen_snapshots TO service_role;

-- ─── 3. Cron jobs ────────────────────────────────────────────────────────
--
-- The Supabase project ref is hard-coded the same way the existing
-- sync-weather and generate-tasks crons do it (see 20260515000000_fix_
-- cron_jobs.sql for the same pattern). All three edge functions are
-- deployed with verify_jwt=false so no Authorization header is required.

-- generate-weekly-overviews — Sunday 06:00 UTC
SELECT cron.unschedule('generate-weekly-overviews')
FROM cron.job WHERE jobname = 'generate-weekly-overviews';

SELECT cron.schedule(
  'generate-weekly-overviews',
  '0 6 * * 0',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-weekly-overviews',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- weekly-optimise-digest — Sunday 07:00 UTC (1h after the overview so the
-- two notifications don't land at the same minute).
SELECT cron.unschedule('weekly-optimise-digest')
FROM cron.job WHERE jobname = 'weekly-optimise-digest';

SELECT cron.schedule(
  'weekly-optimise-digest',
  '0 7 * * 0',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/weekly-optimise-digest',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- fetch-pollen — daily at 02:00 UTC, an hour after sync-weather (01:00).
SELECT cron.unschedule('fetch-pollen-daily')
FROM cron.job WHERE jobname = 'fetch-pollen-daily';

SELECT cron.schedule(
  'fetch-pollen-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/fetch-pollen',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
