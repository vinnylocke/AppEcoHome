-- Fix home-scoped data isolation for the plants table.
--
-- The original schema used USING (true) for all SELECT/UPDATE/INSERT policies,
-- meaning any authenticated user could read or modify any plant regardless of
-- home membership. This replaces those policies with home-member-scoped versions.
--
-- Note: plants.home_id is nullable. A NULL home_id indicates a globally-shared
-- plant entry (e.g. from the Perenual API) that has no home affiliation.
-- The updated SELECT policy grants access when:
--   • home_id IS NULL (global/API-sourced catalog entry), OR
--   • the user is a member of the home that owns the plant.

-- Drop the old permissive policies
DROP POLICY IF EXISTS "Allow public read access to global plants" ON "public"."plants";
DROP POLICY IF EXISTS "Allow authenticated users to insert plants" ON "public"."plants";
DROP POLICY IF EXISTS "Allow authenticated users to update plants" ON "public"."plants";
DROP POLICY IF EXISTS "Allow authenticated users to delete plants" ON "public"."plants";

-- Scoped SELECT: global plants (no home) + user's own home plants
CREATE POLICY "Users can read global and their home plants"
  ON "public"."plants"
  FOR SELECT
  TO authenticated
  USING (
    home_id IS NULL
    OR home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Scoped INSERT: only into the user's own home
CREATE POLICY "Users can insert plants for their homes"
  ON "public"."plants"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    home_id IS NULL
    OR home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Scoped UPDATE: only home's own plants
CREATE POLICY "Users can update plants for their homes"
  ON "public"."plants"
  FOR UPDATE
  TO authenticated
  USING (
    home_id IS NULL
    OR home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    home_id IS NULL
    OR home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

-- Scoped DELETE: only home's own plants
CREATE POLICY "Users can delete plants for their homes"
  ON "public"."plants"
  FOR DELETE
  TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );
