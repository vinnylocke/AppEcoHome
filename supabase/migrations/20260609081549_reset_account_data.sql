-- ─── reset_own_account_data() — admin-only testing helper ─────────────
--
-- Wipes garden data + onboarding state for the calling admin so they
-- can return to a fresh-account experience for testing without losing
-- their login. Mirrors `delete_own_account()` but stops short of
-- deleting the auth user.
--
-- Cleared:
--   - Every home the caller is a member of (via leave_home, which
--     cascade-deletes home-scoped tables when the caller is the last
--     member).
--   - Community guides anonymised (author_id → NULL).
--   - planner_preferences, notifications, user_insights,
--     user_behaviour_summary — user-scoped rows that aren't home-scoped.
--   - user_profiles fields reset: onboarding_state, onboarding_steps,
--     welcomed_at, quick_launcher_pins, voice_settings, persona, home_id.
--
-- Preserved:
--   - auth.users (the user keeps their login).
--   - user_profiles identity fields: uid, email, names, subscription_tier,
--     avatar_url, is_admin, can_view_audit, is_beta, fcm_token,
--     ai_enabled, enable_perenual, notification_interval_hours,
--     auto_update_journal_categories.
--   - user_devices (push notifications keep working).

CREATE OR REPLACE FUNCTION public.reset_own_account_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_id    uuid;
  is_admin_v   boolean;
  home_rec     RECORD;
  homes_left   int := 0;
  guides_anon  int := 0;
  prefs_del    int := 0;
  notifs_del   int := 0;
  insights_del int := 0;
  behav_del    int := 0;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no authenticated session';
  END IF;

  -- Admin gate. The RPC is destructive and only useful for testing,
  -- so we lock it down even though the UI also hides the button.
  SELECT is_admin INTO is_admin_v
  FROM user_profiles
  WHERE uid = caller_id;

  IF NOT COALESCE(is_admin_v, false) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- 1. Anonymise guides so they survive as community content.
  WITH updated AS (
    UPDATE community_guides
    SET author_id = NULL
    WHERE author_id = caller_id
    RETURNING 1
  )
  SELECT count(*) INTO guides_anon FROM updated;

  -- 2. Leave every home (snapshot first so we don't trip the cursor).
  FOR home_rec IN
    SELECT home_id FROM home_members WHERE user_id = caller_id
  LOOP
    PERFORM leave_home(home_rec.home_id);
    homes_left := homes_left + 1;
  END LOOP;

  -- 3. Clear user-scoped tables that survive home deletion.
  --    Each table is wrapped in DO/BEGIN so a missing table (e.g. on
  --    a partially-migrated dev DB) doesn't abort the whole reset.
  BEGIN
    WITH d AS (DELETE FROM planner_preferences WHERE user_id = caller_id RETURNING 1)
    SELECT count(*) INTO prefs_del FROM d;
  EXCEPTION WHEN undefined_table THEN prefs_del := -1; END;

  BEGIN
    WITH d AS (DELETE FROM notifications WHERE user_id = caller_id RETURNING 1)
    SELECT count(*) INTO notifs_del FROM d;
  EXCEPTION WHEN undefined_table THEN notifs_del := -1; END;

  BEGIN
    WITH d AS (DELETE FROM user_insights WHERE user_id = caller_id RETURNING 1)
    SELECT count(*) INTO insights_del FROM d;
  EXCEPTION WHEN undefined_table THEN insights_del := -1; END;

  BEGIN
    WITH d AS (DELETE FROM user_behaviour_summary WHERE user_id = caller_id RETURNING 1)
    SELECT count(*) INTO behav_del FROM d;
  EXCEPTION WHEN undefined_table THEN behav_del := -1; END;

  -- 4. Reset user_profiles onboarding + preference fields. Identity
  --    fields (display_name, email, subscription_tier, etc.) are left
  --    untouched so the user keeps their account intact.
  UPDATE user_profiles
  SET onboarding_state    = '{}'::jsonb,
      onboarding_steps    = '{}'::jsonb,
      welcomed_at         = NULL,
      quick_launcher_pins = NULL,
      voice_settings      = NULL,
      persona             = NULL,
      home_id             = NULL
  WHERE uid = caller_id;

  RETURN jsonb_build_object(
    'homes_left',  homes_left,
    'guides_anon', guides_anon,
    'prefs_del',   prefs_del,
    'notifs_del',  notifs_del,
    'insights_del', insights_del,
    'behav_del',   behav_del
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_own_account_data() TO authenticated;
