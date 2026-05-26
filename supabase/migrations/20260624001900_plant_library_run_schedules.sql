-- Plant Library — repeat-with-interval scheduler
--
-- Admins can queue "do N plants × T runs every M minutes" from the
-- admin page and walk away. The schedule survives browser close.
--
-- Architecture:
--   1. `plant_library_run_schedules` row holds the schedule state.
--   2. `tick_plant_library_schedules()` plpgsql fn walks active rows
--      where `next_run_at <= now()` and fires the relevant edge fn
--      via pg_net.http_post (fire-and-forget; same pattern as the
--      existing daily seed/verify crons).
--   3. pg_cron `plant-library-schedule-tick` runs every minute.
--
-- The cancel UX flips status to 'cancelled' — the next tick simply
-- skips cancelled rows.

create extension if not exists pg_net;
create extension if not exists pg_cron;

CREATE TABLE IF NOT EXISTS public.plant_library_run_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 text NOT NULL CHECK (kind IN ('seed', 'verify')),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  count_per_run        integer NOT NULL CHECK (count_per_run > 0 AND count_per_run <= 5000),
  total_runs           integer NOT NULL CHECK (total_runs > 0 AND total_runs <= 100),
  runs_completed       integer NOT NULL DEFAULT 0,
  interval_minutes     integer NOT NULL CHECK (interval_minutes >= 1 AND interval_minutes <= 1440),
  next_run_at          timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_triggered_at    timestamptz,
  last_error           text
);

COMMENT ON TABLE public.plant_library_run_schedules IS
  'Admin-created repeat-with-interval schedules for the plant-library seed/verify functions. Polled every minute by tick_plant_library_schedules().';
COMMENT ON COLUMN public.plant_library_run_schedules.next_run_at IS
  'When the next invocation should fire. The tick fn advances this by interval_minutes after every successful dispatch.';
COMMENT ON COLUMN public.plant_library_run_schedules.runs_completed IS
  'Count of invocations dispatched so far. Schedule auto-completes when this reaches total_runs.';

-- Partial index — the tick query reads only active rows ordered by next_run_at.
CREATE INDEX IF NOT EXISTS plant_library_run_schedules_active_due_idx
  ON public.plant_library_run_schedules (next_run_at)
  WHERE status = 'active';

-- RLS — admin-only for everything. Mirrors the plant_library_runs policies.
ALTER TABLE public.plant_library_run_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_library_run_schedules admin read" ON public.plant_library_run_schedules;
CREATE POLICY "plant_library_run_schedules admin read"
  ON public.plant_library_run_schedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

DROP POLICY IF EXISTS "plant_library_run_schedules admin insert" ON public.plant_library_run_schedules;
CREATE POLICY "plant_library_run_schedules admin insert"
  ON public.plant_library_run_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

DROP POLICY IF EXISTS "plant_library_run_schedules admin update" ON public.plant_library_run_schedules;
CREATE POLICY "plant_library_run_schedules admin update"
  ON public.plant_library_run_schedules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- ── Tick function ──────────────────────────────────────────────────
--
-- Runs every minute via pg_cron. For each due active schedule:
--   1. Fire the matching edge function via pg_net.http_post.
--   2. Bump runs_completed + last_triggered_at.
--   3. Either advance next_run_at by interval_minutes OR mark
--      complete when we've hit total_runs.
--
-- SECURITY DEFINER so it can write to the table regardless of who
-- enabled the cron job. Auth header reuses the same publishable key
-- the existing daily crons use; verify_jwt is off for both seed and
-- verify functions so any key with HTTP access works.

CREATE OR REPLACE FUNCTION public.tick_plant_library_schedules()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  sched RECORD;
  target_url text;
BEGIN
  FOR sched IN
    SELECT *
      FROM public.plant_library_run_schedules
     WHERE status = 'active'
       AND next_run_at <= now()
     ORDER BY next_run_at
     LIMIT 50
  LOOP
    target_url := CASE sched.kind
      WHEN 'seed'   THEN 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/seed-plant-library'
      WHEN 'verify' THEN 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/verify-plant-library'
    END;

    BEGIN
      PERFORM net.http_post(
        url     := target_url,
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
        body    := jsonb_build_object(
                     'count', sched.count_per_run,
                     'triggered_by', COALESCE(sched.created_by::text, NULL)
                   )
      );
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.plant_library_run_schedules
         SET last_error = left(SQLERRM, 500)
       WHERE id = sched.id;
      CONTINUE;
    END;

    IF sched.runs_completed + 1 >= sched.total_runs THEN
      UPDATE public.plant_library_run_schedules
         SET runs_completed    = sched.runs_completed + 1,
             last_triggered_at = now(),
             status            = 'completed',
             last_error        = NULL
       WHERE id = sched.id;
    ELSE
      UPDATE public.plant_library_run_schedules
         SET runs_completed    = sched.runs_completed + 1,
             last_triggered_at = now(),
             next_run_at       = now() + make_interval(mins => sched.interval_minutes),
             last_error        = NULL
       WHERE id = sched.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.tick_plant_library_schedules() IS
  'Cron-driven dispatcher for plant_library_run_schedules. Fires due schedules via pg_net and advances their next_run_at.';

-- 1-minute granularity. "Every 10 minutes" lands within ±30s of slot.
SELECT cron.schedule(
  'plant-library-schedule-tick',
  '* * * * *',
  $$SELECT public.tick_plant_library_schedules();$$
);
