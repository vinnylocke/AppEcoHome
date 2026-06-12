-- ─── Stop seeding plants, start verifying them ─────────────────────────
--
-- Admin update: the plant library is now well-stocked, so we no longer
-- need the daily SEED cron to discover and ingest new species. Instead
-- we want the VERIFY cron — which picks unverified plant_library rows,
-- cross-checks them against Wikipedia + GBIF, and amends diverging
-- fields — to run on the same daily slot.
--
-- - Drop `plant-library-seed-daily` entirely. (The `seed-plant-library`
--   edge function stays around so we can re-enable manually if needed.)
-- - Add `plant-library-verify-daily` at 02:00 UTC, same pattern as the
--   other library crons (timeout_milliseconds:=60000, jsonb body).

SELECT cron.unschedule('plant-library-seed-daily')
FROM cron.job WHERE jobname = 'plant-library-seed-daily';

SELECT cron.schedule('plant-library-verify-daily', '0 2 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/verify-plant-library',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);
