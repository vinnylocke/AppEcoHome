-- AI Plant Overhaul — Wave 1 / RLS
--
-- Tightens the plants UPDATE policy so unauthenticated users can't tamper
-- with the new global AI catalogue rows, and adds row-level policies for
-- the three new tables (plant_care_revisions, user_plant_ack,
-- ai_plant_manual_refresh_log).
--
-- IMPORTANT: the existing Perenual write path (source != 'ai' with
-- home_id IS NULL) is preserved — only AI globals are locked down.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tighten plants UPDATE/DELETE so AI globals can't be modified by users
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update plants for their homes" ON public.plants;

CREATE POLICY "Users can update plants for their homes"
  ON public.plants
  FOR UPDATE
  TO authenticated
  USING (
    -- Home-scoped plants the caller belongs to.
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
    -- Global plants from non-AI providers (Perenual etc.) stay user-writable
    -- to preserve existing flows. Only AI globals are locked down.
    OR (home_id IS NULL AND source <> 'ai')
  )
  WITH CHECK (
    home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
    OR (home_id IS NULL AND source <> 'ai')
  );

-- Service role bypasses RLS, so the stale-check cron + the two SECURITY
-- DEFINER RPCs can still update AI global rows.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. plant_care_revisions — read for any user who can read the parent plant
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Read care revisions" ON public.plant_care_revisions;

CREATE POLICY "Read care revisions"
  ON public.plant_care_revisions
  FOR SELECT
  TO authenticated
  USING (
    plant_id IN (
      SELECT id FROM public.plants
       WHERE home_id IS NULL
          OR home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
    )
  );

-- Inserts / updates / deletes: deliberately no policy for authenticated.
-- Only service_role (cron, edge fns) can write to this table. The two RPCs
-- (fork / reset) defined in the next migration use SECURITY DEFINER so they
-- can write via their owning role.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. user_plant_ack — strictly per-user
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Own ack rows" ON public.user_plant_ack;

CREATE POLICY "Own ack rows"
  ON public.user_plant_ack
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- 4. ai_plant_manual_refresh_log — strictly per-user
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Own refresh log rows" ON public.ai_plant_manual_refresh_log;

CREATE POLICY "Own refresh log rows"
  ON public.ai_plant_manual_refresh_log
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Note: clients never INSERT directly into this table; the manual_refresh_ai_plant
-- edge function (Wave 2) writes via service role. The policy exists so users
-- can SELECT their own history if we ever surface it.
