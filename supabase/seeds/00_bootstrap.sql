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
INSERT INTO public.user_profiles (uid, email, ai_enabled, is_admin)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@rhozly.com',
  true,
  false
)
ON CONFLICT (uid) DO NOTHING;

-- 3. Home
INSERT INTO public.homes (id, name)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Test Garden Home'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 4. Home membership (owner)
INSERT INTO public.home_members (home_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'owner'
)
ON CONFLICT (home_id, user_id) DO NOTHING;

-- 5. Link profile to home and enable Perenual (for SHED E2E tests)
UPDATE public.user_profiles
SET
  home_id         = '00000000-0000-0000-0000-000000000002',
  enable_perenual = true
WHERE uid = '00000000-0000-0000-0000-000000000001';
