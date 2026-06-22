import type { TierId } from "./tiers";

// Features that can be tier-gated independently of the two AI/Perenual flags.
export type Feature =
  | "light_sensor"
  | "sun_tracker"
  | "microclimate"
  | "garden_layout"
  | "garden_layout_3d"
  | "visualiser"
  | "nursery"
  | "garden_walk"
  | "multiple_homes"
  | "ics_export"
  | "guide_authoring"
  | "integrations"
  | "shopping"
  | "ai_insights"
  | "head_gardener";

const ALL: TierId[] = ["sprout", "botanist", "sage", "evergreen"];
const PAID: TierId[] = ["botanist", "sage", "evergreen"];
const EVERGREEN: TierId[] = ["evergreen"];

/**
 * THE single knob for tier-gating non-AI / non-Perenual features.
 *
 * Every feature currently lists `ALL` tiers → open to everyone, so nothing
 * changes for users. To GATE a feature, change its array — e.g.:
 *   light_sensor:     PAID,                    // any paid tier (Sprout excluded)
 *   multiple_homes:   ["evergreen"],           // Evergreen-only
 *   garden_layout_3d: ["sage", "evergreen"],   // explicit list
 *
 * Tiers are a lattice (Sage ≠ "Botanist+"), so we list allowed tiers explicitly
 * rather than a numeric "minimum tier".
 * See docs/plans/tier-gating-features-analysis.md.
 */
export const FEATURE_GATES: Record<Feature, TierId[]> = {
  light_sensor: ALL,
  sun_tracker: ALL,
  microclimate: ALL,
  garden_layout: ALL,
  garden_layout_3d: ALL,
  visualiser: ALL,
  nursery: ALL,
  garden_walk: ALL,
  multiple_homes: ALL,
  ics_export: ALL,
  guide_authoring: ALL,
  integrations: ALL,
  shopping: ALL,
  // The whole AI-insights experience ships Evergreen-only for now. Flip this one
  // array (+ its server mirror in supabase/functions/_shared/insightTiers.ts) to amend.
  ai_insights: EVERGREEN,
  // The Head Gardener AI manager tab — same Evergreen gate, mirrored server-side by
  // tierAllowsInsights() in supabase/functions/_shared/insightTiers.ts.
  head_gardener: EVERGREEN,
};

export const FEATURE_LABELS: Record<Feature, string> = {
  light_sensor: "Light Sensor",
  sun_tracker: "Sun Tracker AR",
  microclimate: "Microclimate Report",
  garden_layout: "Garden Layout",
  garden_layout_3d: "3D Garden View",
  visualiser: "Plant Visualiser",
  nursery: "The Nursery",
  garden_walk: "Garden Walk",
  multiple_homes: "Multiple Homes",
  ics_export: "Calendar Export",
  guide_authoring: "Guide Authoring",
  integrations: "Smart Integrations",
  shopping: "Shopping Lists",
  ai_insights: "AI Insights",
  head_gardener: "Head Gardener",
};

/** Is this tier allowed to use the feature? Unknown tier → treated as Sprout. */
export function tierAllowsFeature(tier: TierId | null | undefined, f: Feature): boolean {
  return FEATURE_GATES[f].includes(tier ?? "sprout");
}

/** The tiers that DO include the feature — used by the upgrade-nudge copy. */
export function tiersWithFeature(f: Feature): TierId[] {
  return FEATURE_GATES[f];
}

export { ALL as ALL_TIERS, PAID as PAID_TIERS, EVERGREEN as EVERGREEN_TIERS };
