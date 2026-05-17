-- Task Optimiser: add is_archived to task_blueprints and create optimisation_sessions

ALTER TABLE task_blueprints
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS task_blueprints_is_archived_idx
  ON task_blueprints (home_id, is_archived);

-- -----------------------------------------------------------------------
-- optimisation_sessions — tracks every apply action for rollback support
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimisation_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id                uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  area_id                uuid REFERENCES areas(id) ON DELETE SET NULL,
  applied_by             uuid NOT NULL REFERENCES auth.users(id),
  applied_at             timestamptz DEFAULT now() NOT NULL,
  archived_blueprint_ids uuid[] NOT NULL DEFAULT '{}',
  created_blueprint_ids  uuid[] NOT NULL DEFAULT '{}',
  is_reversed            boolean DEFAULT false NOT NULL,
  reversed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS optimisation_sessions_home_id_idx
  ON optimisation_sessions (home_id, applied_at DESC);

-- RLS
ALTER TABLE optimisation_sessions ENABLE ROW LEVEL SECURITY;

-- Home members can read sessions for their home
CREATE POLICY "optimisation_sessions_select"
  ON optimisation_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = optimisation_sessions.home_id
        AND home_members.user_id = auth.uid()
    )
  );

-- Home members can insert sessions for their home
CREATE POLICY "optimisation_sessions_insert"
  ON optimisation_sessions FOR INSERT
  WITH CHECK (
    applied_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = optimisation_sessions.home_id
        AND home_members.user_id = auth.uid()
    )
  );

-- Home members can update their own session (for reversals)
CREATE POLICY "optimisation_sessions_update"
  ON optimisation_sessions FOR UPDATE
  USING (
    applied_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM home_members
      WHERE home_members.home_id = optimisation_sessions.home_id
        AND home_members.user_id = auth.uid()
    )
  );
