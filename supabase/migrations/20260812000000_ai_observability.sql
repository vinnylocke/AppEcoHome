-- AI observability + cost accuracy — Phase 1 of docs/plans/ai-audit-and-improvement.md.
--
-- Extends ai_usage_log with an accurate cost breakdown + the context / prompt /
-- raw-result payloads so every AI call is fully auditable, adds an admin read
-- policy for the "AI calls" admin view, and adds ai_feedback for the 👍/👎
-- learning signal.

-- ── 1. Extend ai_usage_log ──────────────────────────────────────────────────

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS cached_tokens   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thoughts_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms     integer,
  ADD COLUMN IF NOT EXISTS status          text    NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS error           text,
  ADD COLUMN IF NOT EXISTS context_block   text,
  ADD COLUMN IF NOT EXISTS prompt          text,
  ADD COLUMN IF NOT EXISTS raw_result      jsonb;

COMMENT ON COLUMN public.ai_usage_log.cached_tokens IS
  'Prompt tokens served from Gemini context cache (billed at the discounted cache rate).';
COMMENT ON COLUMN public.ai_usage_log.thoughts_tokens IS
  'Reasoning / "thinking" tokens — billed at the model output rate.';
COMMENT ON COLUMN public.ai_usage_log.status IS 'ok | error | fallback.';
COMMENT ON COLUMN public.ai_usage_log.context_block IS
  'Grounding context the function built for this call (truncated; nulled after 30d by the prune cron).';
COMMENT ON COLUMN public.ai_usage_log.prompt IS
  'Prompt / messages sent to the model (truncated; nulled after 30d).';
COMMENT ON COLUMN public.ai_usage_log.raw_result IS
  'Raw model response, base64 image bytes stripped (nulled after 30d).';

-- Admin view + per-user Stripe cost rollup.
CREATE INDEX IF NOT EXISTS ai_usage_log_user_created_idx
  ON public.ai_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_fn_created_idx
  ON public.ai_usage_log (function_name, created_at DESC);

-- Admins read every row (the "AI calls" admin view); the existing
-- home_members_read_own_ai_usage policy still powers the per-user AI Usage panel.
CREATE POLICY "admins_read_all_ai_usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

-- ── 2. ai_feedback (👍/👎 learning signal) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  home_id         uuid REFERENCES public.homes(id) ON DELETE CASCADE,
  -- The specific AI call being rated (nullable — payloads are pruned but the row stays).
  ai_usage_log_id uuid REFERENCES public.ai_usage_log(id) ON DELETE SET NULL,
  function_name   text NOT NULL,
  action          text,
  rating          smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment         text,
  -- Optional pointer to the rated artefact (e.g. 'diagnosis', 'guide', 'chat_message').
  target_kind     text,
  target_id       text
);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_ai_feedback" ON public.ai_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_read_own_or_admin_ai_feedback" ON public.ai_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS ai_feedback_log_idx ON public.ai_feedback (ai_usage_log_id);
CREATE INDEX IF NOT EXISTS ai_feedback_fn_idx  ON public.ai_feedback (function_name, created_at DESC);

-- Data API grants — required for tables created after 2026-10-30 (harmless before).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_feedback TO authenticated;
