-- Plant Library — Gemini Batch API submissions
--
-- Admin submits one big batch (up to 5000 plants) via the
-- `submit-plant-library-batch` edge fn, which packs ~BATCH_SIZE
-- plants per batch line and POSTs to Gemini's
-- :batchGenerateContent endpoint. Gemini returns a `batches/<id>`
-- name; we store it here with status='pending'.
--
-- A 5-min pg_cron fires `poll-plant-library-batches`, which walks
-- non-terminal rows here, polls Gemini's batch status, and — when
-- a batch flips to JOB_STATE_SUCCEEDED — fetches the inline
-- results, parses each line, inserts plants into plant_library,
-- creates a plant_library_runs row for the headline numbers, and
-- marks this row processed.
--
-- Pricing: batch API is 50% of standard rates across the board.
-- The result_run_id points at the runs row that captured the
-- detailed per-model + per-token-type breakdown.

create extension if not exists pg_net;
create extension if not exists pg_cron;

CREATE TABLE IF NOT EXISTS public.plant_library_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text NOT NULL CHECK (kind = 'seed'),
  triggered_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  count_requested     integer NOT NULL,
  candidate_names     jsonb NOT NULL DEFAULT '[]'::jsonb,
  model               text NOT NULL,
  gemini_batch_name   text UNIQUE,
  status              text NOT NULL DEFAULT 'submitting'
                        CHECK (status IN ('submitting', 'pending', 'running',
                                          'succeeded', 'failed', 'processed',
                                          'cancelled')),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  last_polled_at      timestamptz,
  completed_at        timestamptz,
  processed_at        timestamptz,
  result_run_id       uuid REFERENCES public.plant_library_runs(id) ON DELETE SET NULL,
  estimated_cost_usd  numeric(10, 6),
  error_message       text
);

COMMENT ON TABLE public.plant_library_batches IS
  'Gemini Batch API submissions for the Plant Library seeder. Polled every 5 minutes by poll-plant-library-batches; processed inline when state flips to JOB_STATE_SUCCEEDED.';
COMMENT ON COLUMN public.plant_library_batches.candidate_names IS
  'Wikipedia-resolved candidate plant names actually sent to Gemini after skip reduction. Stored so we can re-process or audit even after Gemini purges the input.';
COMMENT ON COLUMN public.plant_library_batches.gemini_batch_name IS
  'Gemini operation name (e.g. "batches/abc123"). Null while we are still submitting; unique once assigned.';
COMMENT ON COLUMN public.plant_library_batches.estimated_cost_usd IS
  'Pre-submission cost estimate derived from historical avg $/plant across recent seed runs, halved for batch rate. Compare against the result run row''s actual cost after processing.';

CREATE INDEX IF NOT EXISTS plant_library_batches_non_terminal_idx
  ON public.plant_library_batches (last_polled_at NULLS FIRST)
  WHERE status IN ('pending', 'running', 'succeeded', 'submitting');

CREATE INDEX IF NOT EXISTS plant_library_batches_submitted_idx
  ON public.plant_library_batches (submitted_at DESC);

-- RLS — admin-only on all surfaces (mirrors plant_library_run_schedules).
ALTER TABLE public.plant_library_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_library_batches admin read" ON public.plant_library_batches;
CREATE POLICY "plant_library_batches admin read"
  ON public.plant_library_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

DROP POLICY IF EXISTS "plant_library_batches admin update" ON public.plant_library_batches;
CREATE POLICY "plant_library_batches admin update"
  ON public.plant_library_batches
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- The submit-plant-library-batch edge fn writes via the service-role
-- client, so admin INSERT isn't strictly required for inserts. We add
-- it anyway so any future admin-only INSERT paths work without
-- bypassing RLS.
DROP POLICY IF EXISTS "plant_library_batches admin insert" ON public.plant_library_batches;
CREATE POLICY "plant_library_batches admin insert"
  ON public.plant_library_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- 5-min cron — batches typically don't finish in <5 min, no reason
-- to be a noisier neighbour on Google's batch endpoint. The poll fn
-- is fast (one round-trip per pending batch) and safe to fire even
-- when there's nothing to do.
SELECT cron.schedule(
  'plant-library-batches-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/poll-plant-library-batches',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
