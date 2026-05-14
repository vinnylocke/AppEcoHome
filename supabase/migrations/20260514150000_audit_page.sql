-- ── 1. Audit access flag on user profiles ────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS can_view_audit boolean NOT NULL DEFAULT false;

-- ── 2. SECURITY DEFINER helpers ──────────────────────────────────────────────

-- Lets home admins grant/revoke audit page access for members without exposing
-- a broad UPDATE policy on user_profiles.
CREATE OR REPLACE FUNCTION public.set_member_audit_access(
  target_user_id uuid,
  access         boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE user_profiles
  SET can_view_audit = access
  WHERE uid = target_user_id
    AND EXISTS (
      SELECT 1 FROM home_members hm_v
      JOIN  home_members hm_t ON hm_t.home_id = hm_v.home_id
                             AND hm_t.user_id = target_user_id
      WHERE hm_v.user_id = auth.uid()
        AND hm_v.role IN ('owner', 'admin')
    );
$$;
GRANT EXECUTE ON FUNCTION public.set_member_audit_access(uuid, boolean) TO authenticated;

-- Returns true if auth.uid() is allowed to read another user's audit data:
-- same home AND (viewer is owner/admin OR viewer has audit.view_all permission).
CREATE OR REPLACE FUNCTION public.can_audit_home_member(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM home_members hm_v
    JOIN  home_members hm_t ON hm_t.home_id = hm_v.home_id
                           AND hm_t.user_id = target_user_id
    WHERE hm_v.user_id = auth.uid()
      AND (
        hm_v.role IN ('owner', 'admin')
        OR (hm_v.permissions->>'audit.view_all')::boolean = true
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_audit_home_member(uuid) TO authenticated;

-- ── 3. user_events RLS — split FOR ALL into SELECT + INSERT ─────────────────
-- The original FOR ALL policy allowed only own events for both read and write.
-- New SELECT policy also allows home admins / audit-permission holders to read.
DROP POLICY IF EXISTS "users_own_events" ON user_events;

CREATE POLICY "user_events_select" ON user_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR can_audit_home_member(user_id));

CREATE POLICY "user_events_insert" ON user_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 4. ai_usage_log RLS — own usage always; others only with audit permission ─
-- Previous policy allowed all home members to read all home AI usage.
-- Tightened: members see only their own unless they have audit access.
DROP POLICY IF EXISTS "home_members_read_own_ai_usage" ON ai_usage_log;

CREATE POLICY "ai_usage_log_select" ON ai_usage_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (home_id IS NOT NULL AND can_audit_home_member(user_id))
  );

-- ── 5. Performance indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ai_usage_log_home_time
  ON ai_usage_log (home_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_log_user_time
  ON ai_usage_log (user_id, created_at DESC);
