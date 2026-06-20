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
    if (cachedTier !== null) { setTier(cachedTier); return; }
    const l = (t: TierId) => setTier(t);
    listeners.add(l);
    loadTier();
    return () => { listeners.delete(l); };
  }, [tierProp]);

  const effective = tierProp ?? tier;
  return {
    tier: effective ?? "sprout",
    loading: effective === null,
    hasFeature: (f: Feature) => tierAllowsFeature(effective ?? "sprout", f),
  };
}
