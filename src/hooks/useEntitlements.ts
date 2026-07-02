import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { TierId } from "../constants/tiers";
import { tierAllowsFeature, type Feature } from "../constants/tierFeatures";

// Module-level cache so the tier is fetched once per session, not once per gate.
let cachedTier: TierId | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(t: TierId) => void>();

async function loadTier(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      cachedTier = "sprout";
    } else {
      const { data } = await supabase
        .from("user_profiles")
        .select("subscription_tier")
        .eq("uid", user.id)
        .maybeSingle();
      cachedTier = (data?.subscription_tier as TierId) ?? "sprout";
    }
    listeners.forEach((l) => l(cachedTier!));
  })();
  return inFlight;
}

/**
 * Drop the cached tier and re-resolve. Call after anything that changes the
 * user's tier (plan upgrade/downgrade, account switch) — without this, every
 * mounted FeatureGate kept the stale tier until a full reload, so a user who
 * just upgraded stayed locked out of the features they paid for.
 * Mounted gates keep showing the last-known tier until the fresh one lands
 * (no flash of locked/unlocked while re-fetching).
 */
export function invalidateEntitlements(): void {
  cachedTier = null;
  inFlight = null;
  if (listeners.size > 0) void loadTier();
}

export interface Entitlements {
  tier: TierId;
  loading: boolean;
  hasFeature: (f: Feature) => boolean;
}

/**
 * Tier entitlements for feature-gating (see src/constants/tierFeatures.ts).
 * Pass `tierProp` when the caller already holds the live tier (avoids a fetch +
 * stale-cache races, mirroring the AIUsagePanel `tier` prop). Otherwise the tier
 * is read from user_profiles once per session and cached module-wide.
 */
export function useEntitlements(tierProp?: TierId | null): Entitlements {
  const [tier, setTier] = useState<TierId | null>(tierProp ?? cachedTier);

  useEffect(() => {
    if (tierProp) { setTier(tierProp); return; }
    // Stay subscribed even when the cache is warm, so invalidateEntitlements
    // (tier switch) propagates to already-mounted gates.
    const l = (t: TierId) => setTier(t);
    listeners.add(l);
    if (cachedTier !== null) setTier(cachedTier);
    else void loadTier();
    return () => { listeners.delete(l); };
  }, [tierProp]);

  const effective = tierProp ?? tier;
  return {
    tier: effective ?? "sprout",
    loading: effective === null,
    hasFeature: (f: Feature) => tierAllowsFeature(effective ?? "sprout", f),
  };
}
