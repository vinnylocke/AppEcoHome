-- Idempotency guard for the weekly email digest.
--
-- `weekly-digest` (cron `weekly-digest-monday`, Mondays 08:00 UTC) had no
-- "already sent this week" tracking, so a duplicate invocation — a stray
-- duplicate cron.job, a pg_net retry, or a manual run alongside the cron —
-- re-sent the whole digest and users got two identical emails. The function now
-- claims the week in this table before sending; a second invocation finds the
-- row and bails.

CREATE TABLE IF NOT EXISTS public.weekly_digest_runs (
  week_iso text PRIMARY KEY,            -- the week's Monday date (UTC), e.g. '2026-06-22'
  ran_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.weekly_digest_runs IS
  'One row per week the weekly-digest email run claimed — idempotency guard so a duplicate invocation cannot send the digest twice. Server-only (weekly-digest edge fn, service role).';

ALTER TABLE public.weekly_digest_runs ENABLE ROW LEVEL SECURITY;

-- Server-only: claimed/read only by the weekly-digest edge function via the
-- service role. No anon/authenticated grants — the browser never touches it.
GRANT ALL ON TABLE public.weekly_digest_runs TO service_role;
