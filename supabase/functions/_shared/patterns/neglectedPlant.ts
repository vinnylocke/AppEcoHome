import type { PatternDetector, PatternHit } from "./index.ts";

// Fires when a Planted inventory item has had NO care activity in 14+ days.
// "Care" is any of, home-scoped, within the window (bug-audit-2026-07-10 #21 —
// the old detector only counted manual `task_completed` user_events, so a plant
// auto-watered daily by an automation, or one whose task was auto/bulk-completed,
// still read as neglected — the strawberries-flagged-despite-daily-watering bug):
//   1. a Completed task linked to the item (ANY completion path — completed_at,
//      not the user_events stream, so auto/window/bulk completions all count);
//   2. a valve turned on in the item's area (automation OR manual watering);
//   3. a recent journal entry for the item (a photo/note is engagement).
// We also require the item to have been planted 14+ days ago to avoid noise on
// newly planted items that haven't had any tasks scheduled yet.
const NEGLECT_DAYS = 14;

const neglectedPlant: PatternDetector = {
  id: "neglected_plant",
  label: "Neglected Plant",

  async detect(_userId, homeId, db): Promise<PatternHit[]> {
    const cutoff = new Date(Date.now() - NEGLECT_DAYS * 86_400_000).toISOString();

    // Planted items for this home old enough to flag.
    const { data: plantedItems } = await db
      .from("inventory_items")
      .select("id, plant_name, planted_at, area_id")
      .eq("home_id", homeId)
      .eq("status", "Planted");
    if (!plantedItems || plantedItems.length === 0) return [];

    // ── Build the set of "cared-for" item ids from real state. ────────────────
    const touchedIds = new Set<string>();

    // 1. Completed tasks in the window — every completion path (manual, weather/
    //    window auto-complete, bulk) lands here via status + completed_at.
    const { data: completedTasks } = await db
      .from("tasks")
      .select("inventory_item_ids")
      .eq("home_id", homeId)
      .eq("status", "Completed")
      .gte("completed_at", cutoff);
    for (const t of completedTasks ?? []) {
      for (const id of (t.inventory_item_ids ?? []) as string[]) touchedIds.add(id);
    }

    // 2. Recent journal entries (a logged photo/note is engagement).
    const { data: journals } = await db
      .from("plant_journals")
      .select("inventory_item_id")
      .eq("home_id", homeId)
      .gte("created_at", cutoff);
    for (const j of journals ?? []) {
      if (j.inventory_item_id) touchedIds.add(j.inventory_item_id as string);
    }

    // 3. Areas watered by a valve (automation or manual) in the window → every
    //    planted item in that area is being cared for even with no task/journal.
    const wateredAreas = new Set<string>();
    const { data: valveEvents } = await db
      .from("valve_events")
      .select("device_id")
      .eq("home_id", homeId)
      .eq("event_type", "turn_on")
      .gte("fired_at", cutoff);
    const deviceIds = [...new Set((valveEvents ?? []).map((v) => v.device_id).filter(Boolean))];
    if (deviceIds.length > 0) {
      const { data: devices } = await db
        .from("devices")
        .select("id, area_id")
        .in("id", deviceIds);
      const deviceArea = new Map<string, string>();
      for (const d of devices ?? []) {
        if (d.area_id) deviceArea.set(d.id as string, d.area_id as string);
      }
      for (const v of valveEvents ?? []) {
        const area = deviceArea.get(v.device_id as string);
        if (area) wateredAreas.add(area);
      }
    }

    // ── Flag the genuinely idle. ──────────────────────────────────────────────
    const hits: PatternHit[] = [];
    for (const item of plantedItems) {
      // Skip items planted less than NEGLECT_DAYS ago — they may not have tasks yet.
      if (!item.planted_at || item.planted_at > cutoff) continue;
      if (touchedIds.has(item.id)) continue;
      if (item.area_id && wateredAreas.has(item.area_id)) continue;

      hits.push({
        inventoryItemId: item.id,
        rawData: { plant_name: item.plant_name, neglect_days: NEGLECT_DAYS },
      });
    }

    return hits;
  },
};

export default neglectedPlant;
