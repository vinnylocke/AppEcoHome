-- ============================================================
-- Fix 1: generate_daily_tasks SQL function used inventory_item_id
--         but the tasks table column is inventory_item_ids (jsonb array).
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_daily_tasks()
  RETURNS void
  LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.tasks (
    home_id,
    blueprint_id,
    title,
    description,
    type,
    due_date,
    status,
    location_id,
    area_id,
    inventory_item_ids
  )
  SELECT
    b.home_id,
    b.id,
    b.title,
    b.description,
    b.task_type,
    CURRENT_DATE,
    'Pending',
    b.location_id,
    b.area_id,
    CASE WHEN b.inventory_item_id IS NOT NULL
         THEN jsonb_build_array(b.inventory_item_id)
         ELSE NULL
    END
  FROM public.task_blueprints b
  WHERE
    b.is_recurring = true
    AND b.start_date <= CURRENT_DATE
    AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
    AND (CURRENT_DATE - b.start_date) % b.frequency_days = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.blueprint_id = b.id AND t.due_date = CURRENT_DATE
    );
END;
$function$;

-- ============================================================
-- Fix 2: Cron jobs had placeholder URL/key and are now
--         replaced with the real project URL.
--         Functions are deployed with --no-verify-jwt so no
--         Authorization header is needed.
-- ============================================================
SELECT cron.unschedule('daily-8am-batch');

SELECT cron.schedule(
  'daily-8am-batch',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/daily-batch-notifications',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Recreate (or create) the sync-weather cron — runs at 1 AM daily.
SELECT cron.unschedule('sync-weather-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-weather-daily'
);

SELECT cron.schedule(
  'sync-weather-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/sync-weather',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
