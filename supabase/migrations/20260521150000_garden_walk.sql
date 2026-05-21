-- ============================================================
-- GARDEN WALK
--
-- Tables that back the Garden Walk mode — a guided full-screen
-- "walk every plant in your garden" experience on /walk.
--
--   garden_walk_sessions  one row per walk a user starts.
--                         Holds start/end + rolled-up metrics so
--                         the Stats / Awards tabs can read counts
--                         without scanning the per-card visit log.
--
--   garden_walk_visits    one row per plant card outcome during a
--                         walk. Drives "skip 'all good' for N days"
--                         logic via the per-instance last-visit
--                         lookup, and gives the pattern engine
--                         richer per-plant signal over time.
--
-- Trust model: home-scoped via existing is_home_member() helper.
-- Members of a home can read sessions/visits in the home; only the
-- user who started a session can mutate that session's rows.
--
-- Idempotent — safe to re-run via `supabase migration up`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.garden_walk_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id)   ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,

  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,

  -- Rolled-up summary metrics, written when the walk ends so we
  -- don't have to count visits at every Stats / Awards read.
  plants_visited        int  NOT NULL DEFAULT 0,
  photos_taken          int  NOT NULL DEFAULT 0,
  notes_added           int  NOT NULL DEFAULT 0,
  tasks_completed       int  NOT NULL DEFAULT 0,
  ailments_flagged      int  NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.garden_walk_sessions IS
  'One row per Garden Walk a user starts. Rolled-up metrics are written when the walk ends.';

CREATE INDEX IF NOT EXISTS garden_walk_sessions_home_user_idx
  ON public.garden_walk_sessions (home_id, user_id, started_at DESC);

-- updated_at trigger so the row tracks its own freshness without
-- the client having to remember to set it on every patch.
CREATE OR REPLACE FUNCTION public.touch_garden_walk_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS garden_walk_sessions_set_updated_at ON public.garden_walk_sessions;
CREATE TRIGGER garden_walk_sessions_set_updated_at
  BEFORE UPDATE ON public.garden_walk_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_garden_walk_sessions_updated_at();

-- ============================================================

CREATE TABLE IF NOT EXISTS public.garden_walk_visits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES public.garden_walk_sessions(id) ON DELETE CASCADE,
  inventory_item_id     uuid NOT NULL REFERENCES public.inventory_items(id)      ON DELETE CASCADE,

  visited_at            timestamptz NOT NULL DEFAULT now(),

  -- What happened on this card. The ordering algorithm in
  -- lib/gardenWalk.ts uses recent 'all_good' outcomes to skip
  -- the plant from the next few walks.
  outcome               text NOT NULL
                        CHECK (outcome IN ('all_good', 'snapped', 'noted', 'ailment_flagged', 'task_completed', 'skipped'))
);

COMMENT ON TABLE public.garden_walk_visits IS
  'One row per plant card outcome during a Garden Walk. Drives skip-for-N-days logic.';

CREATE INDEX IF NOT EXISTS garden_walk_visits_session_idx
  ON public.garden_walk_visits (session_id);

CREATE INDEX IF NOT EXISTS garden_walk_visits_item_idx
  ON public.garden_walk_visits (inventory_item_id, visited_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.garden_walk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_walk_visits   ENABLE ROW LEVEL SECURITY;

-- Sessions: any home member can read (so a shared-home Stats screen
-- can show "the home walked X times this week" if we ever surface
-- that), but only the user who started a session can write to it.
DROP POLICY IF EXISTS "home_members_read_walk_sessions" ON public.garden_walk_sessions;
CREATE POLICY "home_members_read_walk_sessions"
  ON public.garden_walk_sessions FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

DROP POLICY IF EXISTS "user_writes_own_walk_sessions" ON public.garden_walk_sessions;
CREATE POLICY "user_writes_own_walk_sessions"
  ON public.garden_walk_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_home_member(home_id));

DROP POLICY IF EXISTS "user_updates_own_walk_sessions" ON public.garden_walk_sessions;
CREATE POLICY "user_updates_own_walk_sessions"
  ON public.garden_walk_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Visits inherit the session's user via the FK. We let any home
-- member read visits in the home so the per-instance "last walked
-- at" lookup works across users; only the session owner can write.
DROP POLICY IF EXISTS "home_members_read_walk_visits" ON public.garden_walk_visits;
CREATE POLICY "home_members_read_walk_visits"
  ON public.garden_walk_visits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.garden_walk_sessions s
      WHERE s.id = garden_walk_visits.session_id
        AND public.is_home_member(s.home_id)
    )
  );

DROP POLICY IF EXISTS "session_owner_writes_walk_visits" ON public.garden_walk_visits;
CREATE POLICY "session_owner_writes_walk_visits"
  ON public.garden_walk_visits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.garden_walk_sessions s
      WHERE s.id = garden_walk_visits.session_id
        AND s.user_id = auth.uid()
    )
  );
