-- Audit page (Item C) needs home-scoped reads on chat_tool_calls so admins
-- can see every member's AI actions — not just their own. Mirrors the
-- ai_usage_log policy ("home_members_read_own_ai_usage"). The Audit page
-- itself gates the cross-user *view* behind the audit.view_all permission;
-- RLS just needs to permit home-scoped SELECT.
--
-- The existing "users read own tool calls" policy stays — it's used by the
-- chat hydration path. This adds a second, broader read policy. Postgres
-- RLS is permissive-OR by default, so a row is readable if EITHER matches.

CREATE POLICY "home members read tool calls"
  ON public.chat_tool_calls
  FOR SELECT TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = (SELECT auth.uid())
    )
  );
