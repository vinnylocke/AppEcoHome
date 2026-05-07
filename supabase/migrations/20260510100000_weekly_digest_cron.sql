create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'weekly-digest-monday',
  '0 8 * * 1',
  $$
  select net.http_post(
      url:='https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/weekly-digest',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
