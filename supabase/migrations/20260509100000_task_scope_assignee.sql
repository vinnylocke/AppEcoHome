-- Add scope, created_by, assigned_to to tasks and task_blueprints
-- Rewrite task SELECT policy to enforce personal task visibility rules

-- tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'home'
    CHECK (scope IN ('home', 'personal')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- task_blueprints
ALTER TABLE task_blueprints
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'home'
    CHECK (scope IN ('home', 'personal')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill created_by on existing tasks using the home owner (best-effort)
UPDATE tasks t
SET created_by = hm.user_id
FROM home_members hm
WHERE hm.home_id = t.home_id
  AND hm.role = 'owner'
  AND t.created_by IS NULL;

-- Replace broad SELECT policy with scope-aware version
-- Personal tasks are only visible to: creator, assignee, owner/admin,
-- or members with tasks.view_members permission override enabled
DROP POLICY IF EXISTS "Users can view their home tasks" ON tasks;
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT
  USING (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
    AND (
      scope = 'home'
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM home_members hm
        WHERE hm.home_id = tasks.home_id
          AND hm.user_id = auth.uid()
          AND hm.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM home_members hm
        WHERE hm.home_id = tasks.home_id
          AND hm.user_id = auth.uid()
          AND (hm.permissions->>'tasks.view_members')::boolean = true
      )
    )
  );

-- Replace INSERT policy to enforce created_by = caller
DROP POLICY IF EXISTS "Users can insert their home tasks" ON tasks;
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT
  WITH CHECK (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );
