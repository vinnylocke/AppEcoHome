// Crop-rotation engine — pure functions only.
//
// Inputs come from `inventory_items` (one row per plant instance) joined
// to `plants.family`. Output is a per-area history timeline plus a
// recommendation (avoid + prefer chips) for the target year.
//
// Display lookback is unlimited (every year the user has data for shows
// in the timeline). The "avoid" rule uses the family's own `avoidYears`
// value because that's biology — different families clear from soil at
// different rates.

import {
  getRotationRule,
  familyDisplayLabel,
  normaliseFamilyKey,
  ROTATION_FAMILY_RULES,
  type RotationFamilyKey,
  type RotationFamilyRule,
} from "./rotationFamilies";

export interface InventoryItemForRotation {
  id: string;
  area_id: string | null;
  plant_name?: string | null;
  /** Reference dates — the engine uses the first non-null in this order:
   *  planted_at → ended_at → created_at. */
  planted_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  /** Resolved family — caller is responsible for joining `plants.family`
   *  (or `plant_library.family` when applicable) and passing the raw
   *  string here. May be null for unlinked / AI plants. */
  family?: string | null;
}

export interface RotationHistoryPlant {
  name: string;
  family: string | null;
}

export interface RotationHistoryFamilyEntry {
  /** Raw family value from the DB (e.g. "Solanaceae"). */
  family: string;
  /** Friendly + Latin pair from familyDisplayLabel. */
  display: { common: string; latin: string | null };
  /** Plants of this family grown in this season. */
  plants: string[];
}

export interface RotationHistorySeason {
  /** Calendar year. */
  year: number;
  /** Grouped by family (raw value); unknown-family rows go in `unknown`. */
  families: RotationHistoryFamilyEntry[];
  /** Plants whose family is null/unresolved — listed but not classifiable. */
  unknown: string[];
}

export interface RotationHistory {
  areaId: string;
  seasons: RotationHistorySeason[];
}

export interface RotationAvoidChip {
  family: string;
  commonName: string;
  /** "grown 2 of last 3 years" — used as the chip tooltip / secondary line. */
  reason: string;
}

export interface RotationPreferChip {
  family: string;
  commonName: string;
  /** "Uses the nitrogen the legumes left behind…" — from the family rule. */
  reason: string;
}

export interface RotationRecommendation {
  /** Families to avoid this season + the data-driven reason. */
  avoid: RotationAvoidChip[];
  /** Families that pair well after the avoid set. */
  prefer: RotationPreferChip[];
  /** True when nothing notable to avoid — UI uses this to render the
   *  "looking good" empty state. */
  isClear: boolean;
}

/**
 * Coerce a row's reference date into a calendar year. Returns null when
 * no date is parseable — the caller drops those rows.
 */
function rowYear(row: InventoryItemForRotation): number | null {
  const raw = row.planted_at || row.ended_at || row.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

/**
 * Roll the supplied inventory rows into a per-year history for a single
 * area. Years are sorted descending so the most recent year appears
 * first (matching the UI). Display walks every year — there is no
 * server-side lookback cap; the caller decides how many years to render.
 */
export function buildAreaRotationHistory(
  areaId: string,
  rows: InventoryItemForRotation[],
): RotationHistory {
  const buckets = new Map<number, Map<string, string[]>>();
  const unknownByYear = new Map<number, string[]>();

  for (const row of rows) {
    if (row.area_id !== areaId) continue;
    const year = rowYear(row);
    if (year == null) continue;
    const plantName = (row.plant_name ?? "Unnamed plant").trim() || "Unnamed plant";
    const familyKey = normaliseFamilyKey(row.family ?? null);
    if (!familyKey) {
      if (row.family && row.family.trim().length > 0) {
        // Family present but unknown to our rules — group by raw value so
        // the timeline still shows it cleanly.
        const byFam = buckets.get(year) ?? new Map<string, string[]>();
        const key = row.family.trim();
        const list = byFam.get(key) ?? [];
        list.push(plantName);
        byFam.set(key, list);
        buckets.set(year, byFam);
      } else {
        const list = unknownByYear.get(year) ?? [];
        list.push(plantName);
        unknownByYear.set(year, list);
      }
      continue;
    }
    const canonicalFamily = ROTATION_FAMILY_RULES[familyKey].family;
    const byFam = buckets.get(year) ?? new Map<string, string[]>();
    const list = byFam.get(canonicalFamily) ?? [];
    list.push(plantName);
    byFam.set(canonicalFamily, list);
    buckets.set(year, byFam);
  }

  const allYears = new Set<number>([...buckets.keys(), ...unknownByYear.keys()]);
  const seasons: RotationHistorySeason[] = Array.from(allYears)
    .sort((a, b) => b - a)
    .map((year) => {
      const byFam = buckets.get(year) ?? new Map();
      const families: RotationHistoryFamilyEntry[] = Array.from(byFam.entries()).map(
        ([family, plants]) => ({
          family,
          display: familyDisplayLabel(family),
          plants: [...new Set(plants)],
        }),
      );
      families.sort((a, b) => a.display.common.localeCompare(b.display.common));
      return {
        year,
        families,
        unknown: [...new Set(unknownByYear.get(year) ?? [])],
      };
    });

  return { areaId, seasons };
}

/**
 * Decide which families to avoid + prefer for the target year, given the
 * history. Pure function — no side effects, no IO.
 *
 * "Avoid" logic per family in the rules map:
 *   - If grown in the most recent `avoidYears` calendar years (relative
 *     to targetYear), it's flagged.
 *   - Additionally, if grown 2+ times within the last 3 years, the
 *     reason gets sharpened ("grown N of last 3 years").
 *
 * "Prefer" logic:
 *   - Union of `partners` for every avoided family.
 *   - Minus any family currently in the avoid set.
 *
 * Families outside the rules map produce neither avoid nor prefer chips
 * (we only have biology data for the known ones).
 */
export function recommendRotation(
  history: RotationHistory,
  targetYear: number = new Date().getFullYear(),
): RotationRecommendation {
  const avoidChips: RotationAvoidChip[] = [];
  const seenAvoid = new Set<string>();
  const preferKeys = new Set<RotationFamilyKey>();
  const avoidKeys = new Set<RotationFamilyKey>();

  // Build a per-family year tally for the lookback window.
  const lookbackWindow = 3; // last 3 years for the "X of last Y" reason
  const familyYearTally = new Map<RotationFamilyKey, Set<number>>();

  for (const season of history.seasons) {
    const yearsAgo = targetYear - season.year;
    if (yearsAgo < 0) continue; // future entries (data anomaly) ignored
    for (const famEntry of season.families) {
      const key = normaliseFamilyKey(famEntry.family);
      if (!key) continue;
      if (!familyYearTally.has(key)) familyYearTally.set(key, new Set());
      familyYearTally.get(key)!.add(season.year);
    }
  }

  for (const [key, yearsGrown] of familyYearTally.entries()) {
    const rule = ROTATION_FAMILY_RULES[key];
    const mostRecent = Math.max(...yearsGrown);
    const yearsAgo = targetYear - mostRecent;
    const recentYears = Array.from(yearsGrown).filter(
      (y) => y > targetYear - lookbackWindow,
    );

    if (yearsAgo < rule.avoidYears) {
      avoidKeys.add(key);
      const reason =
        recentYears.length >= 2
          ? `Grown ${recentYears.length} of the last ${lookbackWindow} years.`
          : `Grown ${yearsAgo === 0 ? "this year" : `${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago`} — leave at least ${rule.avoidYears} year${rule.avoidYears === 1 ? "" : "s"} before replanting.`;
      if (!seenAvoid.has(rule.family)) {
        seenAvoid.add(rule.family);
        avoidChips.push({
          family: rule.family,
          commonName: rule.commonName,
          reason,
        });
      }
      for (const partner of rule.partners) preferKeys.add(partner);
    }
  }

  // Remove avoided keys from the prefer set.
  for (const k of avoidKeys) preferKeys.delete(k);

  const preferChips: RotationPreferChip[] = Array.from(preferKeys).map((key) => {
    const rule = ROTATION_FAMILY_RULES[key];
    return {
      family: rule.family,
      commonName: rule.commonName,
      reason: rule.preferReason,
    };
  });
  preferChips.sort((a, b) => a.commonName.localeCompare(b.commonName));
  avoidChips.sort((a, b) => a.commonName.localeCompare(b.commonName));

  return {
    avoid: avoidChips,
    prefer: preferChips,
    isClear: avoidChips.length === 0,
  };
}

// Re-exports for callers that just want the family rule shape.
export type { RotationFamilyKey, RotationFamilyRule };
export { getRotationRule, familyDisplayLabel } from "./rotationFamilies";
