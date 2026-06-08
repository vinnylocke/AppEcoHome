-- Extends cron_inspect() to also surface non-200 HTTP responses logged by
-- pg_net in net._http_response. The plain cron.job_run_details only tells
-- us whether the SQL fired — not whether the HTTP call to the edge
-- function actually succeeded. This makes silent cron failures visible.

CREATE OR REPLACE FUNCTION public.cron_inspect()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  jobs jsonb;
  recent_runs jsonb;
  recent_http jsonb;
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

  -- Recent net.http_post responses. We filter to non-200 to surface
  -- silent failures (502, 504, function errors, timeouts).
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'created', created,
      'status_code', status_code,
      'content', LEFT(COALESCE(content, ''), 300),
      'error_msg', error_msg,
      'timed_out', timed_out
    ) ORDER BY created DESC)
    INTO recent_http
    FROM net._http_response
    WHERE created > now() - interval '14 days'
      AND (status_code IS DISTINCT FROM 200 OR error_msg IS NOT NULL OR timed_out IS TRUE)
    LIMIT 50;
  EXCEPTION WHEN OTHERS THEN
    recent_http := jsonb_build_object('error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'jobs', jobs,
    'recent_runs', recent_runs,
    'recent_http_non_200', recent_http
  );
END;
$$;
