import React from "react";
import { tierAllowsFeature, type Feature } from "../../constants/tierFeatures";
import type { TierId } from "../../constants/tiers";
import { useEntitlements } from "../../hooks/useEntitlements";
import UpgradeNudge from "./UpgradeNudge";

/**
 * Gate a feature's UI behind its tier (config in src/constants/tierFeatures.ts).
 *
 * While the tier is still loading: features open to every tier render their
 * children immediately (no flash possible); gated features render NOTHING
 * until the tier resolves. Rendering children during load mounted Evergreen
 * surfaces (Head Gardener, Week Ahead) for Sprout users on every cold start —
 * a visible flash plus their mount-effect fetches. Pass `tier` (the live tier
 * the parent already holds) to skip the loading state entirely.
 */
export default function FeatureGate({
  feature,
  tier,
  fallback,
  children,
}: {
  feature: Feature;
  tier?: TierId | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { loading, hasFeature } = useEntitlements(tier);
  if (loading) {
    return tierAllowsFeature("sprout", feature) ? <>{children}</> : null;
  }
  if (hasFeature(feature)) return <>{children}</>;
  // Only fall back to the default upsell when NO fallback was supplied. An
  // explicit `fallback={null}` means "render nothing when locked" — using `??`
  // here would treat that null as absent and wrongly show the full UpgradeNudge.
  return <>{fallback !== undefined ? fallback : <UpgradeNudge feature={feature} />}</>;
}
