import type { PatternHit } from "@shared/patterns/index.ts";

// ---- PatternHit factory ----

export function makePatternHit(overrides: Partial<PatternHit> = {}): PatternHit {
  return {
    inventoryItemId: "inv-test-1",
    blueprintId: null,
    rawData: {},
    ...overrides,
  };
}

// ---- user_events row shape (matches `user_events` table) ----

export interface UserEvent {
  id?: string;
  user_id: string;
  home_id: string;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export function makeUserEvent(overrides: Partial<UserEvent> = {}): UserEvent {
  return {
    user_id: "user-test-1",
    home_id: "home-test-1",
    event_type: "task_completed",
    meta: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Event sequence builders ----
// These produce arrays of events that trigger (or intentionally don't trigger)
// a specific pattern, useful for passing into a mock Supabase client.

/** N consecutive postponements for one inventory item — triggers consecutivePostponements. */
export function makePostponementRun(
  itemId: string,
  count: number,
  userId = "user-test-1",
): UserEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date("2026-04-01T10:00:00Z");
    d.setDate(d.getDate() + i);
    return makeUserEvent({
      user_id: userId,
      event_type: "task_postponed",
      meta: { inventory_item_ids: [itemId] },
      created_at: d.toISOString(),
    });
  });
}

/** Postponements interrupted by a completion — should NOT trigger consecutivePostponements. */
export function makeInterruptedPostponements(
  itemId: string,
  userId = "user-test-1",
): UserEvent[] {
  return [
    makeUserEvent({ user_id: userId, event_type: "task_postponed", meta: { inventory_item_ids: [itemId] }, created_at: "2026-04-01T10:00:00Z" }),
    makeUserEvent({ user_id: userId, event_type: "task_postponed", meta: { inventory_item_ids: [itemId] }, created_at: "2026-04-02T10:00:00Z" }),
    makeUserEvent({ user_id: userId, event_type: "task_completed", meta: { inventory_item_ids: [itemId] }, created_at: "2026-04-03T10:00:00Z" }),
    makeUserEvent({ user_id: userId, event_type: "task_postponed", meta: { inventory_item_ids: [itemId] }, created_at: "2026-04-04T10:00:00Z" }),
    makeUserEvent({ user_id: userId, event_type: "task_postponed", meta: { inventory_item_ids: [itemId] }, created_at: "2026-04-05T10:00:00Z" }),
  ];
}

/** No activity for an item for `days` days — simulates neglect. */
export function makeNeglectedItemEvents(
  itemId: string,
  daysSinceLastActivity: number,
  userId = "user-test-1",
): UserEvent[] {
  const lastActive = new Date();
  lastActive.setDate(lastActive.getDate() - daysSinceLastActivity);
  return [
    makeUserEvent({
      user_id: userId,
      event_type: "task_completed",
      meta: { inventory_item_ids: [itemId] },
      created_at: lastActive.toISOString(),
    }),
  ];
}
