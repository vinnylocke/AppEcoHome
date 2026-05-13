-- IP-based rate limit log for unauthenticated endpoints (e.g. report-error)
-- Stores a SHA-256 hash of the caller's IP, never the raw address.

CREATE TABLE public.ip_rate_limit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash       text        NOT NULL,
  function_name text        NOT NULL,
  window_start  timestamptz NOT NULL,
  call_count    integer     NOT NULL DEFAULT 1,
  UNIQUE (ip_hash, function_name, window_start)
);

CREATE INDEX ON public.ip_rate_limit_log (ip_hash, function_name, window_start DESC);

ALTER TABLE public.ip_rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Edge functions use service role and bypass RLS.
-- Block all direct client access as a safety net.
CREATE POLICY "deny direct client access"
  ON public.ip_rate_limit_log
  FOR ALL TO authenticated
  USING (false);
