create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Runs at 8am UTC on the 1st of every month.
-- Sends the monthly garden report for the previous month.
-- On 1st January it also sends the previous year's Year in Review.
select cron.schedule(
  'garden-reports-monthly',
  '0 8 1 * *',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/garden-reports',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
