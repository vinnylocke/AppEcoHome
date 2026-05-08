-- Migration: Subscription tier system
--
-- Adds a subscription_tier column to user_profiles so the app knows which
-- plan each user is on (sprout / botanist / sage / evergreen) and sets the
-- correct feature flags (ai_enabled, enable_perenual) accordingly.
--
-- Existing users are backfilled from their current flag values so they are
-- never shown the tier-selection gate on their next login.
-- New users get subscription_tier = NULL until they complete tier selection
-- during onboarding (the App.tsx gate checks for NULL).

-- ── 1. Fix ai_enabled default (new accounts should start as Sprout = free) ──

ALTER TABLE public.user_profiles
  ALTER COLUMN ai_enabled SET DEFAULT false;

-- ── 2. Add subscription_tier column ─────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text
  CHECK (subscription_tier IN ('sprout', 'botanist', 'sage', 'evergreen'));

-- ── 3. Backfill existing users so they skip the onboarding gate ──────────────

UPDATE public.user_profiles
SET subscription_tier = CASE
  WHEN ai_enabled = true  AND enable_perenual = true  THEN 'evergreen'
  WHEN ai_enabled = true  AND enable_perenual = false THEN 'sage'
  WHEN ai_enabled = false AND enable_perenual = true  THEN 'botanist'
  ELSE 'sprout'
END
WHERE subscription_tier IS NULL;
