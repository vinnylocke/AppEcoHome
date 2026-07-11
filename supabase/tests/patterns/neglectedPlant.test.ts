import { assertEquals } from "@std/assert";
import neglectedPlant from "@shared/patterns/neglectedPlant.ts";
import { makeMockDb } from "../fixtures/mockDb.ts";

// Fires when a Planted item (planted 14+ days ago) has had NO care activity in
// 14 days. "Care" = a Completed task linked to it, a valve turned on in its
// area, or a recent journal entry (bug-audit-2026-07-10 #21). NEGLECT_DAYS = 14.
// The mock db ignores filters and returns each table's rows verbatim, so each
// test provides only the rows a correctly-filtered query would return.

const USER = "user-1";
const HOME = "home-1";
const ITEM = "inv-neglected";

const TWENTY_DAYS_AGO = new Date(Date.now() - 20 * 86_400_000).toISOString();
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 86_400_000).toISOString();
const SIXTEEN_DAYS_AGO = new Date(Date.now() - 16 * 86_400_000).toISOString();

const plantedTomato = { id: ITEM, plant_name: "Tomato", planted_at: TWENTY_DAYS_AGO, status: "Planted", area_id: "area-1" };

Deno.test("neglectedPlant — flags a planted item with no care activity in 14 days", async () => {
  const db = makeMockDb({ inventory_items: [plantedTomato] });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].inventoryItemId, ITEM);
});

Deno.test("neglectedPlant — a Completed task in the window clears it (any completion path)", async () => {
  const db = makeMockDb({
    inventory_items: [plantedTomato],
    // completed_at within window; the mock returns it, the detector collects its ids.
    tasks: [{ inventory_item_ids: [ITEM], status: "Completed", completed_at: FIVE_DAYS_AGO }],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — automation/manual watering in the plant's AREA clears it (RHOZLY strawberries case)", async () => {
  const db = makeMockDb({
    inventory_items: [plantedTomato], // area-1
    valve_events: [{ device_id: "dev-1", event_type: "turn_on", fired_at: FIVE_DAYS_AGO }],
    devices: [{ id: "dev-1", area_id: "area-1" }], // valve feeds area-1
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — a valve in a DIFFERENT area does not clear it", async () => {
  const db = makeMockDb({
    inventory_items: [plantedTomato], // area-1
    valve_events: [{ device_id: "dev-9", event_type: "turn_on", fired_at: FIVE_DAYS_AGO }],
    devices: [{ id: "dev-9", area_id: "area-other" }],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 1);
});

Deno.test("neglectedPlant — a recent journal entry clears it", async () => {
  const db = makeMockDb({
    inventory_items: [plantedTomato],
    plant_journals: [{ inventory_item_id: ITEM, created_at: FIVE_DAYS_AGO }],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — no hit for an item planted less than 14 days ago", async () => {
  const db = makeMockDb({
    inventory_items: [{ ...plantedTomato, plant_name: "New Seedling", planted_at: FIVE_DAYS_AGO }],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});

Deno.test("neglectedPlant — rawData includes plant_name and neglect_days", async () => {
  const db = makeMockDb({
    inventory_items: [{ ...plantedTomato, plant_name: "Basil" }],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals((hits[0].rawData as any).plant_name, "Basil");
  assertEquals((hits[0].rawData as any).neglect_days, 14);
});

Deno.test("neglectedPlant — detects multiple neglected items independently", async () => {
  const ITEM_B = "inv-also-neglected";
  const db = makeMockDb({
    inventory_items: [
      plantedTomato,
      { id: ITEM_B, plant_name: "Basil", planted_at: SIXTEEN_DAYS_AGO, status: "Planted", area_id: "area-2" },
    ],
  });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 2);
});

Deno.test("neglectedPlant — no hit when no planted items exist", async () => {
  const db = makeMockDb({ inventory_items: [] });
  const hits = await neglectedPlant.detect(USER, HOME, db as any);
  assertEquals(hits.length, 0);
});
