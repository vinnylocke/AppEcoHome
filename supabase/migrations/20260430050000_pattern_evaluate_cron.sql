-- Runs pattern-evaluate 30 min after pattern-scan (same 6-hour cycle).
-- pattern-scan fires at :00, this fires at :30 — gives scan time to finish.

select cron.schedule(
  'pattern-evaluate-6h',
  '30 */6 * * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/pattern-evaluate',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
