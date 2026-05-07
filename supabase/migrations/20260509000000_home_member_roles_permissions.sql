-- Extend home_members: add 'admin' and 'viewer' roles + permissions JSONB override column

-- Widen the role check to include admin and viewer
ALTER TABLE home_members DROP CONSTRAINT IF EXISTS home_members_role_check;
ALTER TABLE home_members ADD CONSTRAINT home_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- Per-member permission overrides (empty object = use role defaults)
ALTER TABLE home_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';

-- Allow owner/admin to update other members' role and permissions
-- Constraint: cannot promote anyone to 'owner' via this policy
DROP POLICY IF EXISTS "owners_can_update_member_roles" ON home_members;
CREATE POLICY "owners_can_update_member_roles" ON home_members
  FOR UPDATE
  USING (
    home_id IN (
      SELECT home_id FROM home_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    role != 'owner'
  );
