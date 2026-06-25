// Find-or-create a user's Stripe Customer and persist it on
// `user_profiles.stripe_customer_id`. Idempotent. Shared by `stripe-create-
// checkout` (lazy at checkout) and `stripe-ensure-customer` (on signup +
// backfill) so both produce identical customers (email + `metadata.uid`).
//
// `db` / `stripe` are `any` so callers pinned to different supabase-js / Stripe
// versions pass cleanly (same reasoning as the other shared executors).

import { log } from "./logger.ts";

const FN = "ensure-stripe-customer";

export interface CustomerProfile {
  uid: string;
  email: string | null;
  stripe_customer_id: string | null;
}

export async function ensureStripeCustomer(
  // deno-lint-ignore no-explicit-any
  db: any,
  // deno-lint-ignore no-explicit-any
  stripe: any,
  profile: CustomerProfile,
): Promise<string> {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: profile.email ?? undefined,
    metadata: { uid: profile.uid },
  });

  const { error } = await db
    .from("user_profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("uid", profile.uid);
  if (error) {
    // Persist failed — surface it so the caller can decide; the Stripe customer
    // exists but isn't linked yet (the next find-or-create would create a dup,
    // so callers should treat a throw here as fatal for this request).
    throw new Error(`Failed to persist stripe_customer_id: ${error.message}`);
  }

  log(FN, "created", { uid: profile.uid, customer: customer.id });
  return customer.id as string;
}
