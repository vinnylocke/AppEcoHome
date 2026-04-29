import type { PatternDetector, PatternHit } from "./index.ts";

// Fires when a Planted inventory item hasn't had a task_completed event in 14+ days.
// We also require the item to have been planted 14+ days ago to avoid noise on
// newly planted items that haven't had any tasks scheduled yet.
const NEGLECT_DAYS = 14;

const neglectedPlant: PatternDetector = {
  id: "neglected_plant",
  label: "Neglected Plant",

  async detect(userId, homeId, db): Promise<PatternHit[]> {
    const cutoff = new Date(Date.now() - NEGLECT_DAYS * 86_400_000).toISOString();

    // 1. All item IDs touched by recent completions for this user
    const { data: recentEvents } = await db
      .from("user_events")
      .select("meta")
      .eq("user_id", userId)
      .eq("event_type", "task_completed")
      .gte("created_at", cutoff);

    const recentIds = new Set<string>();
    for (const e of recentEvents ?? []) {
      const ids = e.meta?.inventory_item_ids;
      if (Array.isArray(ids)) ids.forEach((id: string) => recentIds.add(id));
    }

    // 2. All Planted items for this home that are old enough to flag
    const { data: plantedItems } = await db
      .from("inventory_items")
      .select("id, plant_name, planted_at")
      .eq("home_id", homeId)
      .eq("status", "Planted");

    const hits: PatternHit[] = [];
    for (const item of plantedItems ?? []) {
      if (recentIds.has(item.id)) continue;
      // Skip items planted less than NEGLECT_DAYS ago — they may not have tasks yet
      if (!item.planted_at || item.planted_at > cutoff) continue;

      hits.push({
        inventoryItemId: item.id,
        rawData: { plant_name: item.plant_name, neglect_days: NEGLECT_DAYS },
      });
    }

    return hits;
  },
};

export default neglectedPlant;
