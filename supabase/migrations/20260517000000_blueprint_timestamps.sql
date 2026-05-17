-- Add created_at and updated_at to task_blueprints.
-- Existing rows get NULL (canUndoSession treats NULL as appliedAt, so undo remains eligible).
-- New rows get now() automatically; updated_at is refreshed on every UPDATE via trigger.

ALTER TABLE task_blueprints
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE task_blueprints
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION set_blueprint_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blueprint_updated_at ON task_blueprints;
CREATE TRIGGER blueprint_updated_at
  BEFORE UPDATE ON task_blueprints
  FOR EACH ROW EXECUTE FUNCTION set_blueprint_updated_at();
