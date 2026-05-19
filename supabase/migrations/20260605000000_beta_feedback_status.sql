-- ============================================================
-- BETA FEEDBACK ADMIN STATUS (Phase 2 mop-up)
-- Lets admins triage feedback (open → acknowledged → resolved) so
-- users can see what happened to feedback they submitted.
-- ============================================================

ALTER TABLE public.beta_feedback
  ADD COLUMN IF NOT EXISTS admin_status text NOT NULL DEFAULT 'open'
    CHECK (admin_status IN ('open', 'acknowledged', 'resolved'));

ALTER TABLE public.beta_feedback
  ADD COLUMN IF NOT EXISTS admin_response text;

CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_created
  ON public.beta_feedback (user_id, created_at DESC);

COMMENT ON COLUMN public.beta_feedback.admin_status IS
  'Triage status set by an admin. Surfaced on the user-facing My Feedback list so users see when their input has been acknowledged or resolved.';
