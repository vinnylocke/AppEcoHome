-- ─── Extend pg_net timeouts on ALL HTTP-firing crons ─────────────────────
--
-- After the targeted timeout fix for the three user-facing crons (20260608
-- 132040), an audit showed 16 of 19 cron jobs still firing without any
-- timeout_milliseconds parameter, meaning they all silently timed out at
-- pg_net's 5s default. Symptom for seasonal_picks: home_seasonal_picks
-- rows for vinny's home appear on weekdays HOURS after the 04:00 Monday
-- cron — written by the on-demand fallback, not the cron itself.
--
-- This migration reschedules every cron in one pass with
-- timeout_milliseconds:=60000. Each block preserves the original URL,
-- headers, body, and schedule — only the timeout is added.
--
-- Crons already migrated by 20260608132040 (daily-8am-batch,
-- generate-weekly-overviews, weekly-optimise-digest) are NOT included
-- here.

-- ─── drain-valve-queue-5min ────────────────────────────────────────────
SELECT cron.unschedule('drain-valve-queue-5min') FROM cron.job WHERE jobname = 'drain-valve-queue-5min';
SELECT cron.schedule('drain-valve-queue-5min', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
$$);

-- ─── fetch-pollen-daily ────────────────────────────────────────────────
SELECT cron.unschedule('fetch-pollen-daily') FROM cron.job WHERE jobname = 'fetch-pollen-daily';
SELECT cron.schedule('fetch-pollen-daily', '0 2 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/fetch-pollen',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
$$);

-- ─── garden-reports-monthly ────────────────────────────────────────────
SELECT cron.unschedule('garden-reports-monthly') FROM cron.job WHERE jobname = 'garden-reports-monthly';
SELECT cron.schedule('garden-reports-monthly', '0 8 1 * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/garden-reports',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── generate-tasks-daily ──────────────────────────────────────────────
SELECT cron.unschedule('generate-tasks-daily') FROM cron.job WHERE jobname = 'generate-tasks-daily';
SELECT cron.schedule('generate-tasks-daily', '55 7 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/generate-tasks',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
$$);

-- ─── pattern-evaluate-8h ───────────────────────────────────────────────
SELECT cron.unschedule('pattern-evaluate-8h') FROM cron.job WHERE jobname = 'pattern-evaluate-8h';
SELECT cron.schedule('pattern-evaluate-8h', '30 */8 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-evaluate',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── pattern-scan-8h ───────────────────────────────────────────────────
SELECT cron.unschedule('pattern-scan-8h') FROM cron.job WHERE jobname = 'pattern-scan-8h';
SELECT cron.schedule('pattern-scan-8h', '0 */8 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-scan',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── plant-library-batches-poll ────────────────────────────────────────
SELECT cron.unschedule('plant-library-batches-poll') FROM cron.job WHERE jobname = 'plant-library-batches-poll';
SELECT cron.schedule('plant-library-batches-poll', '*/5 * * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/poll-plant-library-batches',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── plant-library-seed-daily ──────────────────────────────────────────
-- Body preserves the {"count": 1000} parameter from the original schedule.
SELECT cron.unschedule('plant-library-seed-daily') FROM cron.job WHERE jobname = 'plant-library-seed-daily';
SELECT cron.schedule('plant-library-seed-daily', '0 2 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/seed-plant-library',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{"count": 1000}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── purge-species-cache-daily ─────────────────────────────────────────
SELECT cron.unschedule('purge-species-cache-daily') FROM cron.job WHERE jobname = 'purge-species-cache-daily';
SELECT cron.schedule('purge-species-cache-daily', '0 3 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/purge-stale-species-cache',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── refresh-behaviour-summary-nightly ─────────────────────────────────
SELECT cron.unschedule('refresh-behaviour-summary-nightly') FROM cron.job WHERE jobname = 'refresh-behaviour-summary-nightly';
SELECT cron.schedule('refresh-behaviour-summary-nightly', '0 2 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-behaviour-summary',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── refresh-seasonal-picks-weekly ─────────────────────────────────────
-- THIS is the one the user noticed — Monday cron silently timed out so
-- "Sow & grow this week" never refreshed from the cron path.
SELECT cron.unschedule('refresh-seasonal-picks-weekly') FROM cron.job WHERE jobname = 'refresh-seasonal-picks-weekly';
SELECT cron.schedule('refresh-seasonal-picks-weekly', '0 4 * * 1', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-seasonal-picks',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── refresh-stale-ai-plants-daily ─────────────────────────────────────
SELECT cron.unschedule('refresh-stale-ai-plants-daily') FROM cron.job WHERE jobname = 'refresh-stale-ai-plants-daily';
SELECT cron.schedule('refresh-stale-ai-plants-daily', '0 3 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-stale-ai-plants',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── refresh-stale-grow-guides-daily ───────────────────────────────────
SELECT cron.unschedule('refresh-stale-grow-guides-daily') FROM cron.job WHERE jobname = 'refresh-stale-grow-guides-daily';
SELECT cron.schedule('refresh-stale-grow-guides-daily', '30 3 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-stale-grow-guides',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);

-- ─── run-automations-hourly ────────────────────────────────────────────
SELECT cron.unschedule('run-automations-hourly') FROM cron.job WHERE jobname = 'run-automations-hourly';
SELECT cron.schedule('run-automations-hourly', '0 * * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/run-automations',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
$$);

-- ─── sync-weather-daily ────────────────────────────────────────────────
SELECT cron.unschedule('sync-weather-daily') FROM cron.job WHERE jobname = 'sync-weather-daily';
SELECT cron.schedule('sync-weather-daily', '0 1 * * *', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/sync-weather',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) AS request_id;
$$);

-- ─── weekly-digest-monday ──────────────────────────────────────────────
SELECT cron.unschedule('weekly-digest-monday') FROM cron.job WHERE jobname = 'weekly-digest-monday';
SELECT cron.schedule('weekly-digest-monday', '0 8 * * 1', $$
  SELECT net.http_post(
    url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/weekly-digest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);
