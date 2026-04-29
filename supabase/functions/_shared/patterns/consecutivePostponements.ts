import type { PatternDetector, PatternHit } from "./index.ts";

// Fires when a plant has been postponed 3+ times in a row without any completion.
// "Consecutive" = the most recent N events for that item are all postponements.
const consecutivePostponements: PatternDetector = {
  id: "consecutive_postponements",
  label: "Consecutive Postponements",

  async detect(userId, _homeId, db): Promise<PatternHit[]> {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const { data: events } = await db
      .from("user_events")
      .select("event_type, meta, created_at")
      .eq("user_id", userId)
      .in("event_type", ["task_postponed", "task_completed", "task_skipped"])
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    // Group ordered event types by first inventory item touched
    const byItem = new Map<string, string[]>();
    for (const e of events ?? []) {
      const ids = e.meta?.inventory_item_ids;
      const itemId = Array.isArray(ids) && ids.length ? ids[0] : null;
      if (!itemId) continue;
      if (!byItem.has(itemId)) byItem.set(itemId, []);
      byItem.get(itemId)!.push(e.event_type as string);
    }

    const hits: PatternHit[] = [];
    for (const [itemId, types] of byItem) {
      // Walk backwards from the most recent event; count the leading run of postponements
      let run = 0;
      for (let i = types.length - 1; i >= 0; i--) {
        if (types[i] === "task_postponed") run++;
        else break;
      }
      if (run >= 3) {
        hits.push({ inventoryItemId: itemId, rawData: { consecutive_postponements: run } });
      }
    }

    return hits;
  },
};

export default consecutivePostponements;
