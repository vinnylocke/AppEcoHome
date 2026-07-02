-- pattern-evaluate retry bound (bug-audit-2026-07-02 §9.15).
--
-- Failed evaluations left evaluated=false with no attempt counter, so a hit
-- whose payload consistently fails (e.g. Gemini returning unparseable JSON
-- for that prompt) was retried — and billed — every 8-hour run, forever.
-- pattern-evaluate now gives up after 3 attempts (marks evaluated=true with
-- no insight).

ALTER TABLE public.user_pattern_hits
  ADD COLUMN IF NOT EXISTS eval_attempts int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_pattern_hits.eval_attempts IS
  'Failed pattern-evaluate attempts. At 3 the hit is marked evaluated with no insight instead of retrying (and paying Gemini) forever.';
