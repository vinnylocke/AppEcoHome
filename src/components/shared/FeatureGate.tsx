import React from "react";
import type { Feature } from "../../constants/tierFeatures";
import type { TierId } from "../../constants/tiers";
import { useEntitlements } from "../../hooks/useEntitlements";
import UpgradeNudge from "./UpgradeNudge";

/**
 * Gate a feature's UI behind its tier (config in src/constants/tierFeatures.ts).
 *
 * While the tier is still loading we render the children — every feature ships
 * open today, so there is no flash. When a feature is later gated, pass `tier`
 * (the live tier the parent already holds) to that gate to avoid a brief flash
 * of content before the cached tier resolves.
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
  if (loading || hasFeature(feature)) return <>{children}</>;
  // Only fall back to the default upsell when NO fallback was supplied. An
  // explicit `fallback={null}` means "render nothing when locked" — using `??`
  // here would treat that null as absent and wrongly show the full UpgradeNudge.
  return <>{fallback !== undefined ? fallback : <UpgradeNudge feature={feature} />}</>;
}
