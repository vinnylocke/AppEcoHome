import type { PatternDetector, PatternHit } from "./index.ts";

// Fires when >50% of a plant's task events in the last 30 days are postponements,
// with a minimum of 4 events to reduce noise from low-frequency plants.
const MIN_EVENTS = 4;
const RATE_THRESHOLD = 0.5;
const WINDOW_DAYS = 30;

const highPostponeRate: PatternDetector = {
  id: "high_postpone_rate",
  label: "High Postpone Rate",

  async detect(userId, _homeId, db): Promise<PatternHit[]> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    const { data: events } = await db
      .from("user_events")
      .select("event_type, meta")
      .eq("user_id", userId)
      .in("event_type", ["task_postponed", "task_completed"])
      .gte("created_at", since);

    // Tally postponed / completed per inventory item
    const byItem = new Map<string, { postponed: number; completed: number }>();
    for (const e of events ?? []) {
      const ids = e.meta?.inventory_item_ids;
      const itemId = Array.isArray(ids) && ids.length ? ids[0] : null;
      if (!itemId) continue;
      if (!byItem.has(itemId)) byItem.set(itemId, { postponed: 0, completed: 0 });
      const counts = byItem.get(itemId)!;
      if (e.event_type === "task_postponed") counts.postponed++;
      else counts.completed++;
    }

    const hits: PatternHit[] = [];
    for (const [itemId, counts] of byItem) {
      const total = counts.postponed + counts.completed;
      if (total < MIN_EVENTS) continue;
      const rate = counts.postponed / total;
      if (rate > RATE_THRESHOLD) {
        hits.push({
          inventoryItemId: itemId,
          rawData: {
            postponed: counts.postponed,
            completed: counts.completed,
            rate_pct: Math.round(rate * 100),
            window_days: WINDOW_DAYS,
          },
        });
      }
    }

    return hits;
  },
};

export default highPostponeRate;
