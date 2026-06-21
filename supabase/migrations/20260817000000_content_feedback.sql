-- User feedback on guides, documentation and workflows (👍/👎 + optional comment).
--
-- Distinct from `ai_feedback` (the AI "learning signal"): this is content-quality
-- feedback so users can flag a problem / inaccuracy / issue on any guide, help
-- answer or onboarding flow. Read by the admin Content Feedback viewer.

CREATE TABLE IF NOT EXISTS public.content_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_id      uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  -- Which kind of surface produced the content.
  surface      text NOT NULL,        -- 'rhozly-guide' | 'grow-guide' | 'app-help' | 'onboarding-flow'
  target_kind  text,                 -- 'guide' | 'answer' | 'flow'
  target_id    text,                 -- guide id / plant_<id> / question hash / flow id
  target_label text,                 -- human-readable (guide title, flow name) for the admin view
  rating       smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment      text
);

COMMENT ON TABLE public.content_feedback IS
  'User 👍/👎 + optional comment on guides, documentation and workflows. Distinct from ai_feedback (AI learning signal).';

ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;

-- Users may only insert rows attributed to themselves.
CREATE POLICY "users_insert_own_content_feedback" ON public.content_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users may amend their own row (the 👎 flow inserts the rating, then patches in
-- the optional comment a moment later — needs UPDATE on the own row).
CREATE POLICY "users_update_own_content_feedback" ON public.content_feedback
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users read their own; admins read everything (mirrors ai_feedback).
CREATE POLICY "users_read_own_or_admin_content_feedback" ON public.content_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS content_feedback_surface_idx ON public.content_feedback (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS content_feedback_rating_idx  ON public.content_feedback (rating);

-- Data API grants — required for tables created after 2026-10-30 (harmless before).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_feedback TO authenticated;
