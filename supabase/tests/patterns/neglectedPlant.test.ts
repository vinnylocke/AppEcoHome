import { assertEquals } from "@std/assert";
import neglectedPlant from "@shared/patterns/neglectedPlant.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";
import { makeUserEvent } from "../fixtures/patternData.ts";

// Fires when a Planted item has had no task_completed event in 14+ days
// AND the item was planted 14+ days ago (planted_at <= cutoff).
// NEGLECT_DAYS = 14

const USER = "user-1";
const HOME = "home-1";
const ITEM = "inv-neglected";

const TWENTY_DAYS_AGO = new Date(Date.now() - 20 * 86_400_000).toISOString();
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 86_400_000).toISOString();
const SIXTEEN_DAYS_AGO = new Date(Date.now() - 16 * 86_400_000).toISOString();

Deno.test("neglectedPlant — detects item with no completions in 14 days", async () => {
  const db = makeMockDb({
    user_events: [],                            // no completions at all
    inventory_items: [
      { id: ITEM, plant_name: "Tomato", planted_at: TWENTY_DAYS_AGO, status: "Planted" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].inventoryItemId, ITEM);
});

Deno.test("neglectedPlant — no hit when item was completed within 14 days", async () => {
  const db = makeMockDb({
    user_events: [
      makeUserEvent({
        user_id: USER,
        event_type: "task_completed",
        meta: { inventory_item_ids: [ITEM] },
        created_at: FIVE_DAYS_AGO,             // within cutoff window
      }),
    ],
    inventory_items: [
      { id: ITEM, plant_name: "Tomato", planted_at: TWENTY_DAYS_AGO, status: "Planted" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — no hit for item planted less than 14 days ago", async () => {
  const db = makeMockDb({
    user_events: [],
    inventory_items: [
      { id: ITEM, plant_name: "New Seedling", planted_at: FIVE_DAYS_AGO, status: "Planted" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — rawData includes plant_name and neglect_days", async () => {
  const db = makeMockDb({
    user_events: [],
    inventory_items: [
      { id: ITEM, plant_name: "Basil", planted_at: TWENTY_DAYS_AGO, status: "Planted" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals((hits[0].rawData as any).plant_name, "Basil");
  assertEquals((hits[0].rawData as any).neglect_days, 14);
});

Deno.test("neglectedPlant — detects multiple neglected items independently", async () => {
  const ITEM_B = "inv-also-neglected";
  const db = makeMockDb({
    user_events: [],
    inventory_items: [
      { id: ITEM, plant_name: "Tomato", planted_at: TWENTY_DAYS_AGO, status: "Planted" },
      { id: ITEM_B, plant_name: "Basil", planted_at: SIXTEEN_DAYS_AGO, status: "Planted" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 2);
});

Deno.test("neglectedPlant — no hit when no planted items exist", async () => {
  const db = makeMockDb({ user_events: [], inventory_items: [] });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});
