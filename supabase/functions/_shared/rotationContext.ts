// Per-area rotation context for AI prompts.
//
// Mirrors the browser-side `src/lib/rotationEngine.ts` logic so the
// recommendation the user sees in the UI is the SAME recommendation
// the AI sees when it generates suggestions. Drift between the two
// would make recommendations inconsistent ("Rhozly told me to avoid
// solanaceae but suggested tomatoes" — a trust killer).
//
// This module is consumed by:
//   - `_shared/gardenContext.ts` (Garden Overhaul + anything else
//     calling `buildGardenContext`)
//   - `generate-swipe-plants` (directly, since it doesn't take garden
//     context today)
//   - `generate-tasks`, `smart-plant-scheduler`, `plant-doctor` when
//     the request is area-scoped
//   - `suggest-rotation-plants` (the Layer B edge fn)

import {
  ROTATION_FAMILY_RULES,
  normaliseFamilyKey,
  type RotationFamilyKey,
} from "./rotationFamilies.ts";

export interface InventoryRowForRotation {
  area_id: string | null;
  plant_name?: string | null;
  planted_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  family?: string | null;
}

export interface AreaRotationBlock {
  /** Year → families grown that year. Sorted descending. */
  history: Array<{ year: number; families: string[] }>;
  avoid: string[];
  prefer: string[];
}

function rowYear(row: InventoryRowForRotation): number | null {
  const raw = row.planted_at || row.ended_at || row.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

/**
 * Compute the rotation block for a single area from the supplied rows.
 * Pure function — no DB. The caller is responsible for filtering rows
 * to the home and joining `plants.family` before passing them in.
 */
export function buildAreaRotationBlock(
  areaId: string,
  rows: InventoryRowForRotation[],
  targetYear: number = new Date().getFullYear(),
): AreaRotationBlock {
  const buckets = new Map<number, Set<string>>();

  for (const row of rows) {
    if (row.area_id !== areaId) continue;
    const year = rowYear(row);
    if (year == null) continue;
    const key = normaliseFamilyKey(row.family ?? null);
    if (!key) continue;
    const canonical = ROTATION_FAMILY_RULES[key].family;
    if (!buckets.has(year)) buckets.set(year, new Set());
    buckets.get(year)!.add(canonical);
  }

  const history = Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, fams]) => ({ year, families: Array.from(fams).sort() }));

  // Avoid logic (mirrors src/lib/rotationEngine.ts:recommendRotation).
  const avoidKeys = new Set<RotationFamilyKey>();
  for (const [key, rule] of Object.entries(ROTATION_FAMILY_RULES) as Array<
    [RotationFamilyKey, typeof ROTATION_FAMILY_RULES[RotationFamilyKey]]
  >) {
    let mostRecentGrown: number | null = null;
    for (const [year, fams] of buckets.entries()) {
      if (fams.has(rule.family)) {
        mostRecentGrown = mostRecentGrown == null ? year : Math.max(mostRecentGrown, year);
      }
    }
    if (mostRecentGrown == null) continue;
    if (targetYear - mostRecentGrown < rule.avoidYears) {
      avoidKeys.add(key);
    }
  }

  const preferKeys = new Set<RotationFamilyKey>();
  for (const k of avoidKeys) {
    for (const partner of ROTATION_FAMILY_RULES[k].partners) preferKeys.add(partner);
  }
  for (const k of avoidKeys) preferKeys.delete(k);

  return {
    history,
    avoid: Array.from(avoidKeys)
      .map((k) => ROTATION_FAMILY_RULES[k].family)
      .sort(),
    prefer: Array.from(preferKeys)
      .map((k) => ROTATION_FAMILY_RULES[k].family)
      .sort(),
  };
}

/**
 * Format an area's rotation block as a compact prompt block. Empty
 * string when the area has no rotation history (so callers can skip
 * appending). The AI cares about three things: what's been grown, what
 * to avoid, what to prefer — anything else is noise.
 */
export function renderRotationBlock(
  areaName: string,
  block: AreaRotationBlock,
): string {
  if (block.history.length === 0) return "";
  const lines: string[] = [];
  lines.push(`Rotation history for "${areaName}":`);
  for (const season of block.history.slice(0, 5)) {
    lines.push(`  - ${season.year}: ${season.families.join(", ") || "(no known families)"}`);
  }
  if (block.avoid.length > 0) {
    lines.push(`  - AVOID this year: ${block.avoid.join(", ")}`);
  }
  if (block.prefer.length > 0) {
    lines.push(`  - PREFER this year: ${block.prefer.join(", ")}`);
  }
  return lines.join("\n");
}

// Hard bounds so a misbehaving home (e.g. an admin / test home with
// thousands of inventory rows) can't stall AI calls.
const INVENTORY_FETCH_LIMIT = 500;

/**
 * Inventory + plants are joined CLIENT-SIDE rather than via PostgREST's
 * embedded-resource syntax. The historical FK from `inventory_items.plant_id`
 * (text) → `plants.id` (integer) is type-mismatched and the embed syntax
 * `plants(family)` hangs / returns nothing as a result. Doing two
 * straightforward selects + a Map lookup is fast and predictable.
 */
async function joinFamiliesInCode(
  supabase: any,
  inventoryRows: Array<{
    area_id: string | null;
    plant_name: string | null;
    planted_at: string | null;
    ended_at: string | null;
    created_at: string | null;
    plant_id: string | null;
  }>,
): Promise<InventoryRowForRotation[]> {
  const plantIds = Array.from(
    new Set(
      inventoryRows
        .map((r) => r.plant_id)
        .filter((id): id is string => !!id && id.length > 0),
    ),
  );
  let familyByPlantId: Record<string, string | null> = {};
  if (plantIds.length > 0) {
    // plants.id is integer; supabase text values are coerced server-side
    // in the .in() filter when they parse as numbers. Non-numeric ids
    // (e.g. provider-prefixed strings) won't match a plants row and the
    // resulting row just gets family=null.
    const numericIds = plantIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    if (numericIds.length > 0) {
      const { data } = await supabase
        .from("plants")
        .select("id, family")
        .in("id", numericIds);
      for (const row of (data ?? []) as Array<{ id: number; family: string | null }>) {
        familyByPlantId[String(row.id)] = row.family ?? null;
      }
    }
  }
  return inventoryRows.map((r) => ({
    area_id: r.area_id,
    plant_name: r.plant_name ?? null,
    planted_at: r.planted_at ?? null,
    ended_at: r.ended_at ?? null,
    created_at: r.created_at ?? null,
    family: r.plant_id ? (familyByPlantId[r.plant_id] ?? null) : null,
  }));
}

/**
 * One-shot helper for callers that have a supabase client and just want
 * the block for a single area.
 */
export async function fetchAreaRotationBlock(
  supabase: any,
  homeId: string,
  areaId: string,
  targetYear: number = new Date().getFullYear(),
): Promise<AreaRotationBlock> {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("area_id, plant_name, planted_at, ended_at, created_at, plant_id")
      .eq("home_id", homeId)
      .eq("area_id", areaId)
      .limit(INVENTORY_FETCH_LIMIT);
    if (error || !data) return { history: [], avoid: [], prefer: [] };
    const rows = await joinFamiliesInCode(supabase, data as any[]);
    return buildAreaRotationBlock(areaId, rows, targetYear);
  } catch {
    return { history: [], avoid: [], prefer: [] };
  }
}

/**
 * Fetches rotation blocks for ALL areas in a home. Used by
 * `_shared/gardenContext.ts` so the prompt gets per-area rotation. The
 * caller is responsible for handling failures gracefully — this fn
 * never throws (returns {} on any error).
 */
export async function fetchHomeRotationBlocks(
  supabase: any,
  homeId: string,
  targetYear: number = new Date().getFullYear(),
): Promise<Record<string, AreaRotationBlock>> {
  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("area_id, plant_name, planted_at, ended_at, created_at, plant_id")
      .eq("home_id", homeId)
      .limit(INVENTORY_FETCH_LIMIT);
    if (error || !data) return {};
    const rows = await joinFamiliesInCode(supabase, data as any[]);
    const byArea: Record<string, InventoryRowForRotation[]> = {};
    for (const r of rows) {
      if (!r.area_id) continue;
      if (!byArea[r.area_id]) byArea[r.area_id] = [];
      byArea[r.area_id].push(r);
    }
    const out: Record<string, AreaRotationBlock> = {};
    for (const [areaId, areaRows] of Object.entries(byArea)) {
      out[areaId] = buildAreaRotationBlock(areaId, areaRows, targetYear);
    }
    return out;
  } catch {
    return {};
  }
}
