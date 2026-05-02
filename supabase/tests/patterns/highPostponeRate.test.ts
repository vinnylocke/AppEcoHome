import { assertEquals } from "@std/assert";
import highPostponeRate from "@shared/patterns/highPostponeRate.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
import { makeUserEvent } from "../fixtures/patternData.ts";

// Fires when >50% of task events in the last 30 days are postponements,
// with a minimum of 4 total events.
// MIN_EVENTS = 4, RATE_THRESHOLD = 0.5

const USER = "user-1";
const HOME = "home-1";
const ITEM = "inv-item-1";

function postpone(itemId = ITEM) {
  return makeUserEvent({ user_id: USER, event_type: "task_postponed", meta: { inventory_item_ids: [itemId] } });
}
function complete(itemId = ITEM) {
  return makeUserEvent({ user_id: USER, event_type: "task_completed", meta: { inventory_item_ids: [itemId] } });
}

Deno.test("highPostponeRate — hit when >50% postponements with 4+ events", async () => {
  // 3 postponed, 1 completed = 75% rate (> 50%) with 4 total events ✓
  const db = makeMockDb({
    user_events: [postpone(), postpone(), postpone(), complete()],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].inventoryItemId, ITEM);
});

Deno.test("highPostponeRate — rawData includes rate_pct and counts", async () => {
  const db = makeMockDb({
    user_events: [postpone(), postpone(), postpone(), complete()],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals((hits[0].rawData as any).rate_pct, 75);
  assertEquals((hits[0].rawData as any).postponed, 3);
  assertEquals((hits[0].rawData as any).completed, 1);
});

Deno.test("highPostponeRate — no hit when fewer than 4 total events (noise guard)", async () => {
  // 2 postponed, 1 completed = 66% but only 3 events < MIN_EVENTS
  const db = makeMockDb({
    user_events: [postpone(), postpone(), complete()],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("highPostponeRate — no hit when rate is exactly 50% (threshold is strictly >)", async () => {
  // 2 postponed, 2 completed = 50% — not > 50%
  const db = makeMockDb({
    user_events: [postpone(), postpone(), complete(), complete()],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("highPostponeRate — no hit when majority are completions", async () => {
  // 1 postponed, 4 completed = 20%
  const db = makeMockDb({
    user_events: [postpone(), complete(), complete(), complete(), complete()],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("highPostponeRate — detects hits for multiple items independently", async () => {
  const ITEM_A = "inv-a";
  const ITEM_B = "inv-b";
  const db = makeMockDb({
    user_events: [
      postpone(ITEM_A), postpone(ITEM_A), postpone(ITEM_A), complete(ITEM_A), // 75% A
      postpone(ITEM_B), postpone(ITEM_B), postpone(ITEM_B), complete(ITEM_B), // 75% B
    ],
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 2);
});

Deno.test("highPostponeRate — no hit when events have no inventory_item_ids", async () => {
  const db = makeMockDb({
    user_events: Array.from({ length: 5 }, () =>
      makeUserEvent({ user_id: USER, event_type: "task_postponed", meta: {} })
    ),
  });
  const hits = await highPostponeRate.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});
