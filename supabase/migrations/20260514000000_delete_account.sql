-- Migration: Account deletion support
--
-- 1. Makes community_guides.author_id nullable so guides are preserved
--    as anonymous when the author deletes their account.
-- 2. Changes the FK from ON DELETE CASCADE to ON DELETE SET NULL.
-- 3. Creates delete_own_account() — a SECURITY DEFINER RPC that:
--      a. Anonymises all guides created by the calling user
--      b. Leaves every home the user is in (promotes owner if needed,
--         deletes the home when empty)
--    Called by the delete-account edge function BEFORE it deletes the
--    auth user so that auth.uid() is still valid during cleanup.

-- ── 1. Make author_id nullable ───────────────────────────────────────────────

ALTER TABLE public.community_guides
  ALTER COLUMN author_id DROP NOT NULL;

-- ── 2. Swap the FK to ON DELETE SET NULL ────────────────────────────────────

-- Auto-generated name for the FK created in 20260512000000_community_guides.sql
ALTER TABLE public.community_guides
  DROP CONSTRAINT IF EXISTS community_guides_author_id_fkey;

ALTER TABLE public.community_guides
  ADD CONSTRAINT community_guides_author_id_fkey
  FOREIGN KEY (author_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 3. delete_own_account() RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_id  uuid;
  home_rec   RECORD;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no authenticated session';
  END IF;

  -- Detach all guides so they survive as anonymous content
  UPDATE community_guides
  SET author_id = NULL
  WHERE author_id = caller_id;

  -- Leave each home in a snapshot to avoid cursor issues while deleting rows
  FOR home_rec IN
    SELECT home_id
    FROM home_members
    WHERE user_id = caller_id
  LOOP
    -- leave_home promotes the next member to owner when the owner leaves,
    -- and deletes the home entirely when no members remain.
    PERFORM leave_home(home_rec.home_id);
  END LOOP;

  -- user_profiles, home_quiz_completions, community_guide_stars, etc. are
  -- all cleaned up by the cascade delete that fires when the auth user row
  -- is removed by the edge function immediately after this call returns.
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
