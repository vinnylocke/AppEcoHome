-- Plant Sensor Requirements — daily backfill cron
--
-- Ensures our knowledge base has a soil-range record (moisture / EC / soil-
-- temperature) for every plant. Invokes the `backfill-plant-sensor-ranges`
-- edge function, which sweeps `plant_library` then the global `plants`
-- catalogue for rows missing any of the six range columns and fills ONLY the
-- NULLs (never overwriting existing / verified values). New library rows
-- already get ranges from the seeder; this is the belt-and-braces sweep for
-- older / missed rows.
--
-- Fires at 03:45 UTC — staggered off the 02:00 library seeder, the 03:00
-- stale-AI-plants refresher, and the soil-profile / suggestion crons so they
-- don't contend on Gemini or the DB.
--
-- Batch size is read from BACKFILL_BATCH_SIZE on the edge function (default
-- 25). Ramp via the Supabase Dashboard env settings — no code change needed.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'backfill-plant-sensor-ranges-daily',
  '45 3 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/backfill-plant-sensor-ranges',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
