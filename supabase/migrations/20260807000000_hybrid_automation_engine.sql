-- Hybrid automation engine (2026-06-19).
--
-- Adds an EVENT path: when a new soil-sensor `device_readings` row lands, fire
-- `evaluate-automations` scoped to that device so sensor automations react in
-- near-real-time instead of waiting for the next cron tick. The 5-min cron is
-- narrowed to clock-driven automations (time/date/weather); a new 15-min cron
-- runs a full sweep as the safety net + cooldown/run-limit aging for pure-sensor
-- automations. Same engine, three scopes — see `_shared/automationCandidates.ts`.
--
-- Auth uses the public publishable key (same pattern as the other crons). The
-- pg_net call is exception-wrapped + soil-reading-gated so it never slows or
-- blocks reading ingestion, and valve readings don't trigger evaluation.

-- ── Event path: device_readings INSERT → scoped evaluate-automations ──────────
CREATE OR REPLACE FUNCTION public.evaluate_automations_on_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only soil-sensor readings drive sensor automations; ignore valve/other rows.
  IF NEW.data IS NULL
     OR (NEW.data->>'soil_moisture') IS NULL
        AND (NEW.data->>'soil_temp') IS NULL
        AND (NEW.data->>'soil_ec') IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url     := 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/evaluate-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K'
      ),
      body    := jsonb_build_object('deviceId', NEW.device_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'automation event eval failed for device %: %', NEW.device_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evaluate_automations_on_reading ON public.device_readings;
CREATE TRIGGER evaluate_automations_on_reading
  AFTER INSERT ON public.device_readings
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_automations_on_reading();

-- ── Narrow the 5-min cron to clock-driven automations ────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'evaluate-automations-5min';
END $$;

SELECT cron.schedule(
  'evaluate-automations-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/evaluate-automations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"scope": "time"}'::jsonb
  );
  $$
);

-- ── Safety sweep: every 15 min, evaluate EVERYTHING (catch-all + sensor aging) ─
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'evaluate-automations-safety-15min';
END $$;

SELECT cron.schedule(
  'evaluate-automations-safety-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/evaluate-automations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{"scope": "all"}'::jsonb
  );
  $$
);
