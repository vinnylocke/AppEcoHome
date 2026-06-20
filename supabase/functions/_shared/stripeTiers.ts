// Tier ↔ Stripe mapping shared by the checkout, portal, and webhook functions.
//
// Mirrors src/constants/tiers.ts — the (ai_enabled, enable_perenual) flags per
// tier MUST stay in sync with that file, since they drive all tier-gating.

export type TierId = "sprout" | "botanist" | "sage" | "evergreen";

export interface TierFlags {
  subscription_tier: TierId;
  ai_enabled: boolean;
  enable_perenual: boolean;
}

const TIER_FLAGS: Record<TierId, TierFlags> = {
  sprout:    { subscription_tier: "sprout",    ai_enabled: false, enable_perenual: false },
  botanist:  { subscription_tier: "botanist",  ai_enabled: false, enable_perenual: true },
  sage:      { subscription_tier: "sage",      ai_enabled: true,  enable_perenual: false },
  evergreen: { subscription_tier: "evergreen", ai_enabled: true,  enable_perenual: true },
};

/** Paid tiers that have a Stripe price + go through Checkout. Sprout is free. */
export const PAID_TIERS: readonly TierId[] = ["botanist", "sage", "evergreen"];

export function isValidTier(t: unknown): t is TierId {
  return t === "sprout" || t === "botanist" || t === "sage" || t === "evergreen";
}

/** The feature flags + tier a user_profiles row should hold for a given tier. */
export function tierToFlags(tier: TierId): TierFlags {
  return TIER_FLAGS[tier] ?? TIER_FLAGS.sprout;
}

// Env var that holds the Stripe Price id for each paid tier. Sandbox vs live
// price ids differ, so they live in edge-function secrets, not in code.
const PRICE_ENV: Record<TierId, string | null> = {
  sprout: null,
  botanist: "STRIPE_PRICE_BOTANIST",
  sage: "STRIPE_PRICE_SAGE",
  evergreen: "STRIPE_PRICE_EVERGREEN",
};

/** Stripe Price id to start a Checkout for `tier`, or null if free/unconfigured. */
export function priceIdForTier(tier: TierId): string | null {
  const envName = PRICE_ENV[tier];
  if (!envName) return null;
  return Deno.env.get(envName) ?? null;
}

/** Reverse lookup via env: which paid tier a Stripe Price id maps to, or null. */
export function tierFromPriceId(priceId: string | null | undefined): TierId | null {
  if (!priceId) return null;
  for (const tier of PAID_TIERS) {
    if (priceIdForTier(tier) === priceId) return tier;
  }
  return null;
}

/** Tier from a Stripe object's metadata.tier (set on every product + price). */
export function tierFromMetadata(
  metadata: Record<string, string> | null | undefined,
): TierId | null {
  const t = metadata?.tier;
  return isValidTier(t) ? t : null;
}

// Stripe subscription statuses that should keep the user on their paid tier.
// past_due is included as a grace window — Smart Retries may still recover the
// payment; access is only revoked once Stripe fully cancels (canceled/unpaid).
export function statusGrantsAccess(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
