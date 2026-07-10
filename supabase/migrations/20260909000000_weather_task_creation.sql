-- ─── Weather-driven watering tasks (opt-in home setting) ───────────────────
--
-- 1. homes.weather_task_creation — the opt-in flag. When true, analyse-weather
--    turns watering-relevant weather events (v1: heatwave) into real standalone
--    Watering tasks, grouped one-per-area over planted instances.
-- 2. tasks.weather_event_key — marks weather-created tasks
--    ("heatwave:2026-07-10:area:{id}"). Used by the automation runner to find
--    and auto-complete them, by the UI for a "Weather task" chip, and for
--    debuggability.
-- 3. weather_task_claims — atomic create-once claims. analyse-weather runs
--    HOURLY; the claim PK guarantees at most one task per (home, event, day,
--    area), and is delete-safe: if the user deletes the task, the claim
--    remains so the next hourly run doesn't resurrect it. Mirrors the
--    notification_claims pattern (service-role only: RLS on, no policies,
--    no authenticated/anon grants — the Data-API never exposes it).

ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS weather_task_creation boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS weather_event_key text;

-- Partial index: the automation runner looks up open weather tasks by
-- (home, type, area) where weather_event_key is set; keep it cheap.
CREATE INDEX IF NOT EXISTS tasks_weather_event_key_idx
  ON public.tasks (home_id, type, area_id)
  WHERE weather_event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.weather_task_claims (
  home_id    uuid NOT NULL,
  claim_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (home_id, claim_key)
);

ALTER TABLE public.weather_task_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.weather_task_claims IS
  'Atomic create-once claims for weather-driven task creation. A row means the (home, rule, day, area) task has been claimed by an analyse-weather run; losers of the PK race (and later hourly runs) must not create. Delete-safe: outlives the task it created.';
