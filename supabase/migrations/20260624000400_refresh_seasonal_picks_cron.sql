-- Seasonal Picks — weekly pre-warm cron
--
-- Walks every home with at least one home_members row, skipping those
-- whose current ISO-week row in `home_seasonal_picks` is already
-- populated, and calls `generateSeasonalPicksForHome()` for each.
--
-- Fires Mondays at 04:00 UTC. Two reasons:
--   1. Monday morning is when most users open the app to plan the week —
--      pre-warming on Monday at dawn means the Today screen paints from
--      cache instead of waiting on a 5-8s Gemini call.
--   2. 04:00 UTC is outside the busy refresh-stale-ai-plants (03:00) and
--      refresh-stale-grow-guides (03:30) windows, so the three crons don't
--      contend for Gemini quota or DB writes.
--
-- Batch size is read from the STALE_SEASONAL_BATCH_SIZE env var on the
-- edge function (default 25). Ramp via the Supabase Dashboard env
-- settings — no code change needed.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-seasonal-picks-weekly',
  '0 4 * * 1',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/refresh-seasonal-picks',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
