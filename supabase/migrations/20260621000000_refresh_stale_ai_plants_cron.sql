-- AI Plant Overhaul Wave 4 — daily stale-check cron
--
-- Walks every global AI plant (`source = 'ai' AND home_id IS NULL`) whose
-- `last_freshness_check_at` is NULL or older than 90 days, re-asks Gemini,
-- and bumps `freshness_version` + writes a `plant_care_revisions` row only
-- when something genuinely changed.
--
-- Fires at 03:00 UTC (same off-peak window as purge-species-cache; they
-- touch different tables, so no contention).
--
-- Batch size is read from the STALE_CHECK_BATCH_SIZE env var on the edge
-- function (default 25). Ramp 10 → 25 on first production runs via the
-- Supabase Dashboard env settings — no code change needed.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-stale-ai-plants-daily',
  '0 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-stale-ai-plants',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
