-- Fix 1: Create SECURITY DEFINER helpers so home_members policies
-- can check membership without querying the same table under RLS
-- (direct subqueries on home_members inside home_members policies
-- cause PostgreSQL error 42P17 — infinite recursion).

CREATE OR REPLACE FUNCTION public.is_home_admin(p_home_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM home_members
    WHERE home_id = p_home_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_home_owner(p_home_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM home_members
    WHERE home_id = p_home_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_home_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_home_owner(uuid) TO authenticated;

-- Fix 2: Rewrite owners_can_update_member_roles to use the helper
-- instead of an inline subquery (which caused the recursion).
DROP POLICY IF EXISTS "owners_can_update_member_roles" ON home_members;
CREATE POLICY "owners_can_update_member_roles" ON home_members
  FOR UPDATE TO authenticated
  USING (public.is_home_admin(home_id))
  WITH CHECK (role != 'owner');

-- Fix 3: Rewrite owners_can_remove_members for the same reason
-- (proactive — same recursion pattern on the DELETE policy).
DROP POLICY IF EXISTS "owners_can_remove_members" ON home_members;
CREATE POLICY "owners_can_remove_members" ON home_members
  FOR DELETE TO authenticated
  USING (user_id != auth.uid() AND public.is_home_owner(home_id));

-- Fix 4: Add the missing UPDATE policy on homes.
-- Without this, supabase .update() on homes silently affects 0 rows
-- even for valid owners, so country/timezone/name changes never persist.
DROP POLICY IF EXISTS "owners_can_update_home" ON homes;
CREATE POLICY "owners_can_update_home" ON homes
  FOR UPDATE TO authenticated
  USING (public.is_home_admin(id))
  WITH CHECK (true);
