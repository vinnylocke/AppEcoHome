-- Atomic per-user/per-day notification claims (bug-audit-2026-07-02 §9.6/9.7).
--
-- daily-batch-notifications deduped with a read-then-write on recent
-- `notifications` rows: overlapping invocations (pg_net retry, slow run
-- overlapping the next 15-min tick) both saw "not sent" and double-pushed,
-- a transient error on the dedup read failed OPEN (re-notified everyone),
-- and the unbounded select truncated at max_rows=1000 (user #1001 got
-- daily duplicates). generate-weekly-overviews / weekly-optimise-digest had
-- no claim at all.
--
-- The fix is the standard CAS shape (cf. weekly_digest_runs.week_iso):
-- INSERT ... ON CONFLICT DO NOTHING on a composite PK, BEFORE the
-- side-effect. Whoever wins the insert sends; everyone else skips.
--   kind:       'daily_batch' | 'golden_hour' | 'weekly_overview' | 'optimise_digest'
--   claim_date: the user's LOCAL calendar date (daily kinds) or the
--               week-start date (weekly kinds).
--
-- Service-role only — clients never read or write claims, so RLS is enabled
-- with no policies and no authenticated/anon grants.

CREATE TABLE public.notification_claims (
  user_id    uuid NOT NULL,
  kind       text NOT NULL,
  claim_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, claim_date)
);

ALTER TABLE public.notification_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notification_claims IS
  'Atomic send-once claims for cron-generated notifications. A row here means the (user, kind, local day/week) notification has been claimed by a run; inserts race via the PK and losers must not send.';

-- Rows are only meaningful for the dedup horizon; the writing functions
-- prune anything older than a week on each run.
CREATE INDEX idx_notification_claims_date ON public.notification_claims (claim_date);
