-- Small inspection helper. Lets service_role read cron.job + recent
-- cron.job_run_details via PostgREST so we can verify scheduled crons
-- from a remote script without dropping into the SQL editor.
--
-- Service-role only — RLS bypasses still respect role.

CREATE OR REPLACE FUNCTION public.cron_inspect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  jobs jsonb;
  recent_runs jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'jobid', jobid,
    'jobname', jobname,
    'schedule', schedule,
    'active', active,
    'command', command
  ) ORDER BY jobname)
  INTO jobs
  FROM cron.job;

  SELECT jsonb_agg(jsonb_build_object(
    'jobname', j.jobname,
    'runid', r.runid,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'status', r.status,
    'return_message', LEFT(COALESCE(r.return_message, ''), 200)
  ) ORDER BY r.start_time DESC)
  INTO recent_runs
  FROM cron.job_run_details r
  JOIN cron.job j ON j.jobid = r.jobid
  WHERE r.start_time > now() - interval '14 days'
  LIMIT 50;

  RETURN jsonb_build_object('jobs', jobs, 'recent_runs', recent_runs);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_inspect() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_inspect() TO service_role;
