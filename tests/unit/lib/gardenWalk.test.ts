import { describe, test, expect } from "vitest";
import {
  composeAndOrderWalk,
  DEFAULT_WALK_SETTINGS,
  type InventoryItemRow,
  type WalkPlant,
} from "../../../src/lib/gardenWalk";

// All rows use this home id for brevity.
const HOME = "00000000-0000-0000-0000-000000000001";

function mkItem(over: Partial<InventoryItemRow>): InventoryItemRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    home_id: HOME,
    plant_id: over.plant_id ?? null,
    plant_name: over.plant_name ?? "Plant",
    nickname: over.nickname ?? null,
    status: over.status ?? "Planted",
    area_id: over.area_id ?? "area-1",
    area_name: over.area_name ?? "Back bed",
    location_id: over.location_id ?? "loc-1",
    location_name: over.location_name ?? "Garden",
    environment: over.environment ?? "Outdoors",
    planted_at: over.planted_at ?? null,
  };
}

function bandOf(list: WalkPlant[], id: string): string | undefined {
  return list.find((p) => p.inventoryItemId === id)?.band;
}

describe("composeAndOrderWalk", () => {
  test("plants with active ailments go in the critical band first", () => {
    const ailing = mkItem({ id: "ailing", plant_name: "Tomato" });
    const healthy = mkItem({ id: "healthy", plant_name: "Lavender" });

    const out = composeAndOrderWalk(
      [ailing, healthy],
      [],
      [{ plant_instance_id: ailing.id }],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out[0].inventoryItemId).toBe("ailing");
    expect(out[0].band).toBe("critical");
    expect(bandOf(out, "healthy")).toBe("stale");
  });

  test("overdue tasks beat due-today tasks beat fresh hits", () => {
    const overdue = mkItem({ id: "od", plant_name: "Cucumber" });
    const dueToday = mkItem({ id: "dt", plant_name: "Basil" });
    const hit = mkItem({ id: "hit", plant_name: "Sage" });

    const out = composeAndOrderWalk(
      [overdue, dueToday, hit],
      [],
      [],
      [
        { inventory_item_ids: [overdue.id],  due_date: "2026-05-20T08:00:00Z", status: "Pending" },
        { inventory_item_ids: [dueToday.id], due_date: "2026-05-21T08:00:00Z", status: "Pending" },
      ],
      [{ inventory_item_id: hit.id, created_at: "2026-05-21T07:00:00Z" }],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["od", "dt", "hit"]);
    expect(out[0].band).toBe("overdue");
    expect(out[1].band).toBe("due_today");
    expect(out[2].band).toBe("fresh_hit");
  });

  test("recently-walked 'all good' plants drop to everything_else band", () => {
    const fresh = mkItem({ id: "fresh", plant_name: "Mint" });
    const seen = mkItem({ id: "seen", plant_name: "Thyme" });

    const out = composeAndOrderWalk(
      [fresh, seen],
      [],
      [],
      [],
      [],
      [
        // seen was walked yesterday and marked "all good"
        { inventory_item_id: seen.id, outcome: "all_good", visited_at: "2026-05-20T07:00:00Z" },
      ],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(bandOf(out, "fresh")).toBe("stale");
    expect(bandOf(out, "seen")).toBe("everything_else");
    // stale beats everything_else
    expect(out.map((p) => p.inventoryItemId)).toEqual(["fresh", "seen"]);
  });

  test("indoor plants are excluded when skipIndoor is true", () => {
    const indoor = mkItem({ id: "indoor", plant_name: "Aloe", environment: "Indoors" });
    const outdoor = mkItem({ id: "outdoor", plant_name: "Aster" });

    const out = composeAndOrderWalk(
      [indoor, outdoor],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, skipIndoor: true },
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["outdoor"]);
  });

  test("indoor plants are kept when skipIndoor is false", () => {
    const indoor = mkItem({ id: "indoor", plant_name: "Aloe", environment: "Indoors" });
    const outdoor = mkItem({ id: "outdoor", plant_name: "Aster" });

    const out = composeAndOrderWalk(
      [indoor, outdoor],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, skipIndoor: false },
      "2026-05-21",
    );

    expect(new Set(out.map((p) => p.inventoryItemId))).toEqual(new Set(["indoor", "outdoor"]));
  });

  test("plants visited (any outcome) earlier today are not re-walked", () => {
    const visitedToday = mkItem({ id: "today", plant_name: "Onion" });
    const fresh = mkItem({ id: "fresh", plant_name: "Garlic" });

    const out = composeAndOrderWalk(
      [visitedToday, fresh],
      [],
      [],
      [],
      [],
      [
        { inventory_item_id: visitedToday.id, outcome: "noted", visited_at: "2026-05-21T06:30:00Z" },
      ],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );

    expect(out.map((p) => p.inventoryItemId)).toEqual(["fresh"]);
  });

  test("within a band, sorts by area then plant name for stable physical order", () => {
    const items = [
      mkItem({ id: "a", plant_name: "Rosemary",  area_name: "Back bed"  }),
      mkItem({ id: "b", plant_name: "Mint",      area_name: "Back bed"  }),
      mkItem({ id: "c", plant_name: "Coriander", area_name: "Front bed" }),
    ];
    const out = composeAndOrderWalk(
      items,
      [],
      [],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    // all stale band — area asc, then plant asc
    expect(out.map((p) => p.inventoryItemId)).toEqual(["b", "a", "c"]);
  });

  test("nickname takes precedence over plant_name for display", () => {
    const item = mkItem({ id: "n", plant_name: "Tomato", nickname: "Big Red" });
    const out = composeAndOrderWalk(
      [item],
      [],
      [],
      [],
      [],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    expect(out[0].plantName).toBe("Big Red");
  });

  test("maxPerWalk caps the result length", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      mkItem({ id: `i${i}`, plant_name: `Plant ${String(i).padStart(2, "0")}` }),
    );
    const out = composeAndOrderWalk(
      items,
      [],
      [],
      [],
      [],
      [],
      new Map(),
      { ...DEFAULT_WALK_SETTINGS, maxPerWalk: 10 },
      "2026-05-21",
    );
    expect(out.length).toBe(10);
  });

  test("counts on the WalkPlant payload match the input signal counts", () => {
    const item = mkItem({ id: "x", plant_name: "Rose" });
    const out = composeAndOrderWalk(
      [item],
      [
        { inventory_item_id: item.id, subject: "Note",  description: "n", image_url: null, created_at: "2026-05-19" },
      ],
      [{ plant_instance_id: item.id }, { plant_instance_id: item.id }],
      [
        { inventory_item_ids: [item.id], due_date: "2026-05-20T00:00:00Z", status: "Pending" },
        { inventory_item_ids: [item.id], due_date: "2026-05-21T00:00:00Z", status: "Pending" },
        { inventory_item_ids: [item.id], due_date: "2026-05-21T00:00:00Z", status: "Pending" },
      ],
      [
        { inventory_item_id: item.id, created_at: "2026-05-21" },
      ],
      [],
      new Map(),
      DEFAULT_WALK_SETTINGS,
      "2026-05-21",
    );
    expect(out[0].activeAilmentCount).toBe(2);
    expect(out[0].overdueTaskCount).toBe(1);
    expect(out[0].dueTodayTaskCount).toBe(2);
    expect(out[0].freshInsightCount).toBe(1);
    expect(out[0].lastJournalSubject).toBe("Note");
    // critical because there are ailments — beats the overdue tasks
    expect(out[0].band).toBe("critical");
  });
});
