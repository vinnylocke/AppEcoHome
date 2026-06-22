/**
 * Garden Brief vocabulary — the goals + constraints the Head Gardener works toward.
 *
 * These option ids are the SINGLE source of truth for the brief enums and MUST stay
 * in sync with the server enums in supabase/functions/synthesize-garden-brief/index.ts
 * and the column comments in supabase/migrations/20260820000000_head_gardener.sql.
 */

export interface BriefOption {
  id: string;
  label: string;
  /** Short helper shown under the option in the editor. */
  hint?: string;
}

export const GOAL_OPTIONS: BriefOption[] = [
  { id: "grow_your_own", label: "Grow my own food", hint: "Fruit, veg & herbs" },
  { id: "year_round_colour", label: "Year-round colour", hint: "Something in flower every season" },
  { id: "attract_wildlife", label: "Attract wildlife", hint: "Bees, butterflies & birds" },
  { id: "low_maintenance", label: "Low maintenance", hint: "Set-and-forget where possible" },
  { id: "container_only", label: "Containers & pots", hint: "Little or no open soil" },
  { id: "family_safe", label: "Family & pet safe", hint: "Avoid toxic / hazardous plants" },
  { id: "calm_retreat", label: "A calm retreat", hint: "A relaxing place to unwind" },
  { id: "privacy_screening", label: "Privacy & screening", hint: "Hide boundaries, block views" },
];

export const STYLE_OPTIONS: BriefOption[] = [
  { id: "cottage", label: "Cottage" },
  { id: "modern_minimal", label: "Modern & minimal" },
  { id: "tropical", label: "Tropical & lush" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "wild_natural", label: "Wild & natural" },
  { id: "kitchen_veg", label: "Kitchen / veg patch" },
];

export const TIME_OPTIONS: BriefOption[] = [
  { id: "under_1h", label: "Under 1 hour / week" },
  { id: "1_3h", label: "1–3 hours / week" },
  { id: "3_7h", label: "3–7 hours / week" },
  { id: "7h_plus", label: "7+ hours / week" },
];

export const EXPERIENCE_OPTIONS: BriefOption[] = [
  { id: "beginner", label: "Beginner" },
  { id: "improving", label: "Getting the hang of it" },
  { id: "confident", label: "Confident" },
  { id: "expert", label: "Expert" },
];

export const BUDGET_OPTIONS: BriefOption[] = [
  { id: "budget", label: "Budget-conscious" },
  { id: "moderate", label: "Moderate" },
  { id: "premium", label: "Premium" },
];
