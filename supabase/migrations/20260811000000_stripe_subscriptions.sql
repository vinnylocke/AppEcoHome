-- Migration: Stripe subscription linkage
--
-- Adds the columns needed to tie a user_profiles row to its Stripe customer and
-- active subscription. The existing `subscription_tier` / `ai_enabled` /
-- `enable_perenual` columns remain the read path that drives all tier-gating —
-- the `stripe-webhook` edge function keeps them in sync from Stripe events.
--
-- user_profiles is an existing (pre-2026-10-30) table, so no new Data API grants
-- are required for added columns.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS subscription_status     text,
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz;

-- The webhook looks the profile up by Stripe customer id; index it.
CREATE INDEX IF NOT EXISTS user_profiles_stripe_customer_id_idx
  ON public.user_profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.stripe_customer_id IS
  'Stripe Customer id (cus_…). One per user, created on first checkout. Sandbox + live ids differ.';
COMMENT ON COLUMN public.user_profiles.stripe_subscription_id IS
  'Active Stripe Subscription id (sub_…), or NULL when on the free Sprout tier.';
COMMENT ON COLUMN public.user_profiles.subscription_status IS
  'Latest Stripe subscription status (active, past_due, canceled, …). NULL = free / never subscribed.';
COMMENT ON COLUMN public.user_profiles.subscription_period_end IS
  'current_period_end of the active subscription — when the paid access lapses if not renewed.';
