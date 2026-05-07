create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'weekly-digest-monday',
  '0 8 * * 1',
  $$
  select net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-digest',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
