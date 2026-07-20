-- ============================================================
-- SEED 00 — Bootstrap: Test User, Home, and Membership
-- ============================================================
-- Fixed IDs used across all seed scripts:
--   Test user  : 00000000-0000-0000-0000-000000000001
--   Test home  : 00000000-0000-0000-0000-000000000002
--   Credentials: test@rhozly.com / TestPassword123!
--
-- Safe to re-run: all statements are idempotent.
-- ============================================================

-- 1. Auth user
-- Creates the Supabase auth user if it does not already exist.
-- The handle_new_user trigger will fire on first insert and create
-- the corresponding user_profiles row automatically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      email_change_token_current,
      reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test@rhozly.com',
      crypt('TestPassword123!', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      '',
      '',
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

-- 1a. Fix GoTrue-required columns for existing users.
-- instance_id must be all-zeros or GoTrue won't recognise the user as belonging to
-- the running instance. String columns must not be NULL (GoTrue scan error).
UPDATE auth.users
SET
  instance_id                = '00000000-0000-0000-0000-000000000000',
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 1b. Auth identity (required for email/password sign-in via GoTrue)
-- Without an identities row GoTrue returns "Database error querying schema" on sign-in.
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"test@rhozly.com","email_verified":false,"phone_verified":false}'::jsonb,
  'email',
  '00000000-0000-0000-0000-000000000001',
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- 2. User profile
-- Insert directly in case the trigger already fired (idempotent).
-- IMPORTANT: tier flags (ai_enabled, enable_perenual) get RESET on every reseed
-- so suites that toggle them mid-run can't leak state between runs.
INSERT INTO public.user_profiles (uid, email, ai_enabled, is_admin)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@rhozly.com',
  true,
  false
)
ON CONFLICT (uid) DO UPDATE SET
  ai_enabled = EXCLUDED.ai_enabled,
  is_admin   = EXCLUDED.is_admin;

-- 3. Home — lat/lng seeded (London) so the layout editor's sun overlay,
-- sun-time slider and Day/Live mode control are exercisable in E2E.
INSERT INTO public.homes (id, name, lat, lng)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Test Garden Home',
  51.5074,
  -0.1278
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  lat  = EXCLUDED.lat,
  lng  = EXCLUDED.lng;

-- 4. Home membership (owner)
INSERT INTO public.home_members (home_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'owner'
)
ON CONFLICT (home_id, user_id) DO NOTHING;

-- 5. Link profile to home, enable Perenual (for SHED E2E tests), and set a
--    subscription tier so the user lands on /dashboard instead of the
--    tier-selection gate (introduced by the subscription_tier migration —
--    NULL on a freshly seeded user always sends them through "Choose your
--    plan"). 'evergreen' matches the migration's backfill rule for users
--    with ai_enabled + enable_perenual, so tests see the full feature set.
--
--    onboarding_state: every Shepherd tour flow (src/onboarding/flowRegistry.ts)
--    is seeded 'dismissed'. Without this, `global_welcome` (route "global",
--    important:true — bypasses the daily throttle; its only re-fire guard is
--    sessionStorage, which is fresh in every Playwright context) fires a
--    centred, pointer-intercepting card ~800ms after EVERY navigation, on
--    every route, for any account with an empty state — silently sabotaging
--    raw-mouse tests and centre-of-screen clicks (root cause analysis:
--    docs/plans/glb-015-offscreen-canvas-and-tour-seeds.md). welcome_modal
--    is dismissed for the same determinism. Specs that need un-dismissed
--    flows mock their own profile fetch (tests/e2e/fixtures/welcome-modal-ready.ts).
--    This overwrite IS the canonical baseline — re-running seeds resets any
--    tour state accumulated by previous test runs.
UPDATE public.user_profiles
SET
  home_id           = '00000000-0000-0000-0000-000000000002',
  enable_perenual   = true,
  subscription_tier = 'evergreen',
  -- Explicit persona baseline: NULL = "never asked" (clients collapse to
  -- "new" / the Porch posture). Specs that need the experienced/Workbench
  -- composition force it via the rhozly:home:preset localStorage override —
  -- never by flipping this column, and any spec that DOES flip it (e.g. the
  -- garden-walk persona util) is reset here on reseed so leakage can't
  -- contaminate later specs.
  persona           = NULL,
  onboarding_state  = '{
    "welcome_modal": "dismissed",
    "global_welcome": "dismissed",
    "home_setup_tips": "dismissed",
    "dashboard_tour": "dismissed",
    "garden_hub_tour": "dismissed",
    "weather_insights_tour": "dismissed",
    "planner_tour": "dismissed",
    "task_schedule_tour": "dismissed",
    "tools_hub_tour": "dismissed",
    "plant_doctor_tour": "dismissed",
    "visualiser_tour": "dismissed",
    "add_manual_plant": "dismissed",
    "add_location_and_area": "dismissed",
    "guides_tour": "dismissed",
    "profile_quiz_tour": "dismissed",
    "quick_access_tour": "dismissed",
    "weekly_overview_tour": "dismissed",
    "notes_tour": "dismissed",
    "voice_chat_tour": "dismissed",
    "image_credits_tour": "dismissed",
    "garden_ai_chat_tour": "dismissed",
    "plantnet_identification_tour": "dismissed",
    "nursery_tour": "dismissed",
    "garden_walk_tour": "dismissed",
    "seasonal_picks_tour": "dismissed",
    "quick_launcher_customise_tour": "dismissed"
  }'::jsonb
WHERE uid = '00000000-0000-0000-0000-000000000001';
