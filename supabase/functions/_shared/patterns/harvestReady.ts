import type { PatternDetector, PatternHit } from "./index.ts";
import { careMatchKey } from "../careRanges.ts";

/**
 * Gap-fill insight (Plants): flags a planted item that has reached its
 * days-to-harvest window. Resolves maturity via the proven join
 * inventory_items.plant_id → plants.scientific_name → plant_library
 * (`days_to_harvest_min/max`, matched by scientific_name_key).
 *
 * Annuals/biennials only — perennials harvest by season, not days-from-planting,
 * so days-since-planting would mis-flag them. Bounded to a sensible window after
 * maturity so a long-past plant isn't flagged forever.
 */
const MAX_HITS = 8;
const WINDOW_PAD_DAYS = 45;

const harvestReady: PatternDetector = {
  id: "harvest_ready",
  label: "Harvest ready",

  async detect(_userId, homeId, db): Promise<PatternHit[]> {
    const { data: items } = await db
      .from("inventory_items")
      .select("id, plant_name, plant_id, planted_at")
      .eq("home_id", homeId)
      .eq("status", "Planted");
    const rows = (items ?? []).filter((i) => i.planted_at && i.plant_id != null);
    if (rows.length === 0) return [];

    const plantIds = [...new Set(rows.map((i) => i.plant_id as number))];
    const { data: plants } = await db
      .from("plants")
      .select("id, common_name, scientific_name, cycle")
      .in("id", plantIds);
    const plantById = new Map<number, { sci: unknown; common: string; cycle: string | null }>();
    for (const p of plants ?? []) {
      plantById.set(p.id as number, {
        sci: p.scientific_name,
        common: (p.common_name as string) ?? "",
        cycle: (p.cycle as string | null) ?? null,
      });
    }

    // Resolve days-to-harvest from the library by scientific_name_key.
    const keys = [...new Set(
      [...plantById.values()].map((p) => careMatchKey(p.sci, p.common)).filter((k): k is string => !!k),
    )];
    const libByKey = new Map<string, { min: number | null; max: number | null }>();
    if (keys.length) {
      const { data: lib } = await db
        .from("plant_library")
        .select("scientific_name_key, days_to_harvest_min, days_to_harvest_max")
        .in("scientific_name_key", keys);
      for (const l of lib ?? []) {
        libByKey.set((l.scientific_name_key as string).toLowerCase(), {
          min: (l.days_to_harvest_min as number | null) ?? null,
          max: (l.days_to_harvest_max as number | null) ?? null,
        });
      }
    }

    const hits: PatternHit[] = [];
    const now = Date.now();
    for (const item of rows) {
      const plant = plantById.get(item.plant_id as number);
      if (!plant) continue;
      if (plant.cycle && plant.cycle.toLowerCase().includes("perennial")) continue;
      const key = careMatchKey(plant.sci, plant.common);
      const lib = key ? libByKey.get(key) : undefined;
      const min = lib?.min ?? null;
      if (min == null) continue;
      const daysSince = Math.floor((now - new Date(item.planted_at as string).getTime()) / 86_400_000);
      const windowEnd = (lib?.max ?? min) + WINDOW_PAD_DAYS;
      if (daysSince >= min && daysSince <= windowEnd) {
        hits.push({ inventoryItemId: item.id as string, rawData: { plant_name: plant.common, days: daysSince } });
        if (hits.length >= MAX_HITS) break;
      }
    }
    return hits;
  },
};

export default harvestReady;
