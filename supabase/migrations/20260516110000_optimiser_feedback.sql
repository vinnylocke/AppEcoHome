-- Optimiser proposal feedback — thumbs up/down per AI proposal, feeds into regenerate context

CREATE TABLE IF NOT EXISTS optimiser_proposal_feedback (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id           uuid        NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  area_id           uuid        REFERENCES areas(id) ON DELETE SET NULL,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id       text        NOT NULL,
  proposal_snapshot jsonb       NOT NULL,
  rating            text        NOT NULL CHECK (rating IN ('positive', 'negative')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, area_id, proposal_id)
);

ALTER TABLE optimiser_proposal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "optimiser_feedback_insert"
  ON optimiser_proposal_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "optimiser_feedback_select"
  ON optimiser_proposal_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS optimiser_feedback_user_area_idx
  ON optimiser_proposal_feedback (user_id, area_id, created_at DESC);
