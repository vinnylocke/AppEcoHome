-- Create a Stripe Customer when a user signs up (2026-06-25).
--
-- Previously a Stripe customer was created lazily only at checkout
-- (stripe-create-checkout), so free-tier users — and any account whose tier was
-- set manually — never had one. This trigger fires on every new user_profiles
-- row (email AND OAuth signups) to find-or-create the customer up front via the
-- `stripe-ensure-customer` function. Best-effort + idempotent; the lazy
-- find-or-create at checkout remains the fallback.
--
-- Auth: PUBLISHABLE (anon) key as the Bearer token — public, already used by the
-- other triggers/crons (no secret in git). `stripe-ensure-customer` find-or-
-- creates only the customer this uid is meant to have, so the call is bounded.

CREATE OR REPLACE FUNCTION public.ensure_stripe_customer_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget via pg_net. Never let a Stripe hiccup roll back the signup —
  -- the profile insert must always win; checkout's find-or-create is the fallback.
  BEGIN
    PERFORM net.http_post(
      url     := 'https://yiuuzlfhtsxbspdyibam.supabase.co/functions/v1/stripe-ensure-customer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K'
      ),
      body    := jsonb_build_object('uid', NEW.uid)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'stripe-ensure-customer fan-out failed for uid %: %', NEW.uid, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_stripe_customer_on_profile_insert ON public.user_profiles;
CREATE TRIGGER ensure_stripe_customer_on_profile_insert
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_stripe_customer_on_signup();
