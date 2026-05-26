-- Plant Library — extend run_schedules to support 'batch' kind
--
-- The existing scheduler dispatches the sync seed/verify edge fns
-- every N minutes. Extending it to also dispatch the batch submit
-- fn lets admins queue "20 batches of 2000 every 30 minutes" and
-- walk away — far higher throughput than clicking Submit each time.
--
-- Two changes:
--   1. CHECK constraint on `kind` allows 'batch' alongside 'seed'/'verify'.
--   2. tick_plant_library_schedules() is rebuilt with a third URL
--      branch for 'batch'.

ALTER TABLE public.plant_library_run_schedules
  DROP CONSTRAINT IF EXISTS plant_library_run_schedules_kind_check;

ALTER TABLE public.plant_library_run_schedules
  ADD CONSTRAINT plant_library_run_schedules_kind_check
  CHECK (kind IN ('seed', 'verify', 'batch'));

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
      WHEN 'batch'  THEN 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/submit-plant-library-batch'
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
  'Cron-driven dispatcher for plant_library_run_schedules. Fires due seed/verify/batch schedules via pg_net and advances their next_run_at.';
