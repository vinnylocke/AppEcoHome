-- 2026-06-16 — Background poll cron for every active Ecowitt integration.
--
-- The Ecowitt gateway pushes to its own cloud every ~16 min by default,
-- but only pushes to OUR webhook URL when the user manually configures
-- "Customised Server" in WSView Plus (which is finicky and not a step
-- we can guarantee). Without this cron the user has to tap Sync now in
-- the Integrations page to see any new readings.
--
-- This cron walks all `provider = 'ecowitt'` + `status = 'active'`
-- integrations every 15 minutes, fetches real-time readings, and writes
-- one device_readings row per channel. The 15 min cadence matches the
-- gateway's own upload interval so we're never staler than the source.
--
-- The handler is in `supabase/functions/integrations-ecowitt-cron-poll`
-- and is registered with verify_jwt = false in config.toml so
-- net.http_post can reach it without minting a JWT.
--
-- Idempotent. Per-integration try/catch — one broken gateway doesn't
-- block the rest of the batch.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'integrations-ecowitt-poll-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/integrations-ecowitt-cron-poll',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
