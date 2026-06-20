/**
 * Server mirror of `FEATURE_GATES.ai_insights` in src/constants/tierFeatures.ts.
 *
 * Which subscription tiers may GENERATE + see AI insights. Edge functions can't
 * import from src/, so this is a parallel constant — keep it in sync with the
 * client gate (the same way HOURLY_RATE_LIMITS mirrors rateLimit.ts).
 *
 * Evergreen-only for now. To amend, change BOTH this array and
 * FEATURE_GATES.ai_insights. See docs/plans/ai-insights-overhaul.md.
 */
export const AI_INSIGHT_TIERS = ["evergreen"] as const;

type AllowedTier = typeof AI_INSIGHT_TIERS[number];

/** Does this home's subscription tier get AI insights? */
export function tierAllowsInsights(tier: string | null | undefined): boolean {
  return (AI_INSIGHT_TIERS as readonly string[]).includes((tier ?? "sprout") as AllowedTier);
}
