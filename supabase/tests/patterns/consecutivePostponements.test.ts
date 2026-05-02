import { assertEquals } from "@std/assert";
import consecutivePostponements from "@shared/patterns/consecutivePostponements.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
import {
  makeUserEvent,
  makePostponementRun,
  makeInterruptedPostponements,
} from "../fixtures/patternData.ts";

// Fires when the last 3+ events for an inventory item are ALL postponements.
// MIN_CONSECUTIVE = 3; looks back 90 days.

const USER = "user-1";
const HOME = "home-1";
const ITEM = "inv-item-1";

Deno.test("consecutivePostponements — hit when 3 consecutive postponements", async () => {
  const db = makeMockDb({
    user_events: makePostponementRun(ITEM, 3, USER),
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].inventoryItemId, ITEM);
});

Deno.test("consecutivePostponements — hit when 5 consecutive postponements", async () => {
  const db = makeMockDb({
    user_events: makePostponementRun(ITEM, 5, USER),
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals((hits[0].rawData as any).consecutive_postponements, 5);
});

Deno.test("consecutivePostponements — no hit for 2 consecutive postponements (below threshold)", async () => {
  const db = makeMockDb({
    user_events: makePostponementRun(ITEM, 2, USER),
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("consecutivePostponements — no hit when streak is broken by a completion", async () => {
  const db = makeMockDb({
    user_events: makeInterruptedPostponements(ITEM, USER),
    // sequence: postpone, postpone, complete, postpone, postpone → run = 2 at the end
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("consecutivePostponements — no hit when events have no inventory_item_ids", async () => {
  const db = makeMockDb({
    user_events: [
      makeUserEvent({ user_id: USER, event_type: "task_postponed", meta: {} }),
      makeUserEvent({ user_id: USER, event_type: "task_postponed", meta: {} }),
      makeUserEvent({ user_id: USER, event_type: "task_postponed", meta: {} }),
    ],
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("consecutivePostponements — detects hits independently for two items", async () => {
  const ITEM_A = "inv-a";
  const ITEM_B = "inv-b";
  const db = makeMockDb({
    user_events: [
      ...makePostponementRun(ITEM_A, 4, USER),
      ...makePostponementRun(ITEM_B, 3, USER),
    ],
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals(hits.length, 2);
  const hitItemIds = hits.map((h) => h.inventoryItemId).sort();
  assertEquals(hitItemIds, [ITEM_A, ITEM_B].sort());
});

Deno.test("consecutivePostponements — rawData contains the run count", async () => {
  const db = makeMockDb({
    user_events: makePostponementRun(ITEM, 4, USER),
  });
  const hits = await consecutivePostponements.detect(USER, HOME, db as any);
  assertEquals((hits[0].rawData as any).consecutive_postponements, 4);
});
