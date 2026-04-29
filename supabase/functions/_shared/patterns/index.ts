import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import consecutivePostponements from "./consecutivePostponements.ts";
import neglectedPlant from "./neglectedPlant.ts";
import highPostponeRate from "./highPostponeRate.ts";
import blueprintPostponeRate from "./blueprintPostponeRate.ts";

export interface PatternHit {
  inventoryItemId?: string | null;
  blueprintId?: string | null;
  rawData: Record<string, unknown>;
}

export interface PatternDetector {
  id: string;
  label: string;
  detect: (userId: string, homeId: string, db: SupabaseClient) => Promise<PatternHit[]>;
}

export const PATTERNS: PatternDetector[] = [
  consecutivePostponements,
  neglectedPlant,
  highPostponeRate,
  blueprintPostponeRate,
  // Add new pattern: one file in this folder + one line here
];
