-- inventory_items RLS: scope by home MEMBERSHIP, not the user's active-home
-- pointer (bug-audit-2026-07-02 §6.2).
--
-- The original policy (20260407104724_task_engine_and_rls.sql) trusted
-- user_profiles.home_id — the user's OWN "currently active home" pointer:
--
--   USING (home_id IN (SELECT home_id FROM user_profiles WHERE uid = auth.uid()))
--
-- Two failures:
--   1. Removing a member deletes only their home_members row; their profile
--      still points at the home, so a kicked member kept full read/write/
--      delete over the entire shed until they happened to switch homes.
--   2. A legitimate member of a second home couldn't see that home's shed
--      unless it was their active profile home (broke multiple_homes).
--
-- Replace with the canonical home_members pattern used everywhere else
-- (19-rls-patterns.md). auth.uid() is wrapped in a SELECT per the initplan
-- performance mandate.

DROP POLICY IF EXISTS "Users can manage their home's inventory" ON public.inventory_items;

CREATE POLICY "home_members_can_manage_inventory"
  ON public.inventory_items FOR ALL TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = (SELECT auth.uid())
    )
  );
