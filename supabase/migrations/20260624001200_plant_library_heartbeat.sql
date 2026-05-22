-- Plant Library — heartbeat + admin sweep
--
-- Adds a per-batch heartbeat to plant_library_runs so we can tell the
-- difference between "still running" and "function vanished mid-flight"
-- (Supabase background-task timeout, OOM, mid-deploy kill).
--
-- The admin page sweeps runs with `status='running'` and a stale
-- heartbeat (>10 min) and marks them failed. The new UPDATE policy
-- lets admins do that directly from the client.

ALTER TABLE public.plant_library_runs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

COMMENT ON COLUMN public.plant_library_runs.last_heartbeat_at IS
  'Updated by the seed/verify edge fn after every batch. Used by the admin sweep to detect runs whose function died without marking them failed.';

-- Admin UPDATE policy — symmetric to the existing admin SELECT policy.
-- Lets the admin page flip stale-running rows to failed without a
-- server-side endpoint.
DROP POLICY IF EXISTS "plant_library_runs admin update" ON public.plant_library_runs;
CREATE POLICY "plant_library_runs admin update"
  ON public.plant_library_runs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.uid = auth.uid() AND up.is_admin = true
    )
  );
