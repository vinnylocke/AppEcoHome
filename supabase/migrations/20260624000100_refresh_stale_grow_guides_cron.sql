-- Plant Grow Guides — daily stale-check cron
--
-- Walks every row in `plant_grow_guides` whose `last_freshness_check_at` is
-- NULL or older than 90 days, re-asks Gemini, and bumps `freshness_version`
-- + stamps `updated_fields` only when something genuinely changed.
--
-- Fires at 03:30 UTC — 30 minutes after refresh-stale-ai-plants so the two
-- crons don't contend for Gemini quota or DB writes.
--
-- Batch size is read from the STALE_GROW_GUIDE_BATCH_SIZE env var on the
-- edge function (default 25). Ramp via the Supabase Dashboard env settings —
-- no code change needed.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-stale-grow-guides-daily',
  '30 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-stale-grow-guides',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
