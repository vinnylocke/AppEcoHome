import { describe, test, expect } from "vitest";
import {
  analyseArea,
  canUndoSession,
  type OptimiserBlueprint,
  type OptimiserPlantInstance,
} from "../../../src/lib/taskOptimiser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeBp(overrides: Partial<OptimiserBlueprint> & { id: string }): OptimiserBlueprint {
  return {
    title: overrides.id,
    task_type: "Watering",
    frequency_days: 2,
    start_date: "2024-01-01",
    area_id: null,
    location_id: null,
    inventory_item_ids: [],
    description: null,
    is_recurring: true,
    updated_at: null,
    ...overrides,
  };
}

function makeInstance(id: string, areaId: string, name?: string): OptimiserPlantInstance {
  return { id, plant_name: name ?? id, area_id: areaId };
}

const AREA = "area-1";

function instanceMap(...instances: OptimiserPlantInstance[]): Map<string, OptimiserPlantInstance> {
  return new Map(instances.map((i) => [i.id, i]));
}

// ---------------------------------------------------------------------------
// Scenario A — Fragmentation
// ---------------------------------------------------------------------------
describe("analyseArea — Scenario A (Fragmentation)", () => {
  test("produces fragmentation proposal when frequencies differ", () => {
    const map = instanceMap(
      makeInstance("p1", AREA, "Tomato"),
      makeInstance("p2", AREA, "Basil"),
    );
    const bps = [
      makeBp({ id: "bp1", inventory_item_ids: ["p1"], frequency_days: 2 }),
      makeBp({ id: "bp2", inventory_item_ids: ["p2"], frequency_days: 4 }),
    ];
    const results = analyseArea(AREA, "Raised Bed 1", bps, map);
    expect(results).toHaveLength(1);
    expect(results[0].scenario).toBe("fragmentation");
    expect(results[0].source).toBe("rule");
    expect(results[0].blueprintsToArchive).toContain("bp1");
    expect(results[0].blueprintsToArchive).toContain("bp2");
    expect(results[0].newBlueprintFrequencyDays).toBe(2);
    expect(results[0].plantInstanceIdsForNewBlueprint).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  test("produces fragmentation proposal when same frequency but different day offsets", () => {
    const map = instanceMap(
      makeInstance("p1", AREA),
      makeInstance("p2", AREA),
    );
    const bps = [
      makeBp({ id: "bp1", inventory_item_ids: ["p1"], frequency_days: 3, start_date: "2024-01-01" }),
      makeBp({ id: "bp2", inventory_item_ids: ["p2"], frequency_days: 3, start_date: "2024-01-02" }),
    ];
    const results = analyseArea(AREA, "Bed A", bps, map);
    expect(results).toHaveLength(1);
    expect(results[0].scenario).toBe("fragmentation");
  });

  test("skips non-optimisable categories (Maintenance)", () => {
    const map = instanceMap(makeInstance("p1", AREA), makeInstance("p2", AREA));
    const bps = [
      makeBp({ id: "bp1", task_type: "Maintenance", inventory_item_ids: ["p1"] }),
      makeBp({ id: "bp2", task_type: "Maintenance", inventory_item_ids: ["p2"] }),
    ];
    const results = analyseArea(AREA, "Bed", bps, map);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario B — Redundant Overlap
// ---------------------------------------------------------------------------
describe("analyseArea — Scenario B (Redundant Overlap)", () => {
  test("detects area blueprint + instance blueprint redundancy", () => {
    const map = instanceMap(makeInstance("p1", AREA, "Courgette"));
    const bps = [
      makeBp({ id: "area-bp", area_id: AREA, inventory_item_ids: [], frequency_days: 3 }),
      makeBp({ id: "instance-bp", inventory_item_ids: ["p1"], frequency_days: 3 }),
    ];
    const results = analyseArea(AREA, "Greenhouse", bps, map);
    expect(results).toHaveLength(1);
    expect(results[0].scenario).toBe("redundant");
    expect(results[0].blueprintsToArchive).toEqual(["instance-bp"]);
    expect(results[0].after[0].retainedBlueprintId).toBe("area-bp");
  });
});

// ---------------------------------------------------------------------------
// Scenario C — Two-Tier Split
// ---------------------------------------------------------------------------
describe("analyseArea — Scenario C (Two-Tier)", () => {
  test("splits mainstream from outlier when >2x frequency difference", () => {
    const map = instanceMap(
      makeInstance("p1", AREA, "Tomato"),
      makeInstance("p2", AREA, "Basil"),
      makeInstance("p3", AREA, "Cactus"),
    );
    const bps = [
      makeBp({ id: "bp1", inventory_item_ids: ["p1"], frequency_days: 2 }),
      makeBp({ id: "bp2", inventory_item_ids: ["p2"], frequency_days: 2 }),
      makeBp({ id: "bp3", inventory_item_ids: ["p3"], frequency_days: 14 }),
    ];
    const results = analyseArea(AREA, "Polytunnel", bps, map);
    expect(results).toHaveLength(1);
    expect(results[0].scenario).toBe("two-tier");
    // Mainstream bps archived, outlier retained
    expect(results[0].blueprintsToArchive).toContain("bp1");
    expect(results[0].blueprintsToArchive).toContain("bp2");
    expect(results[0].blueprintsToArchive).not.toContain("bp3");
    // After section has the new area bp + the retained outlier
    const newItem = results[0].after.find((a) => a.isNew);
    expect(newItem?.frequencyDays).toBe(2);
    const keptItem = results[0].after.find((a) => !a.isNew);
    expect(keptItem?.retainedBlueprintId).toBe("bp3");
  });
});

// ---------------------------------------------------------------------------
// Scenario D — Same-Day Pile-Up
// ---------------------------------------------------------------------------
describe("analyseArea — Scenario D (Same-Day Pile-Up)", () => {
  test("consolidates 3 compatible blueprints firing on same day", () => {
    const map = instanceMap(
      makeInstance("p1", AREA),
      makeInstance("p2", AREA),
      makeInstance("p3", AREA),
    );
    const bps = [
      makeBp({ id: "bp1", inventory_item_ids: ["p1"], frequency_days: 2, start_date: "2024-01-01" }),
      makeBp({ id: "bp2", inventory_item_ids: ["p2"], frequency_days: 2, start_date: "2024-01-01" }),
      makeBp({ id: "bp3", inventory_item_ids: ["p3"], frequency_days: 2, start_date: "2024-01-01" }),
    ];
    const results = analyseArea(AREA, "Veg Patch", bps, map);
    expect(results).toHaveLength(1);
    expect(results[0].scenario).toBe("pileup");
    expect(results[0].blueprintsToArchive).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// No issues
// ---------------------------------------------------------------------------
describe("analyseArea — no issues", () => {
  test("returns empty when only one blueprint in area", () => {
    const map = instanceMap(makeInstance("p1", AREA));
    const bps = [makeBp({ id: "bp1", inventory_item_ids: ["p1"] })];
    expect(analyseArea(AREA, "Bed", bps, map)).toHaveLength(0);
  });

  test("ignores blueprints from other areas", () => {
    const map = instanceMap(
      makeInstance("p1", AREA),
      makeInstance("p2", "other-area"),
    );
    const bps = [
      makeBp({ id: "bp1", inventory_item_ids: ["p1"], frequency_days: 2 }),
      makeBp({ id: "bp2", inventory_item_ids: ["p2"], frequency_days: 4 }),
    ];
    // p2 is in a different area — should not trigger fragmentation for AREA
    expect(analyseArea(AREA, "Bed", bps, map)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// canUndoSession
// ---------------------------------------------------------------------------
describe("canUndoSession", () => {
  const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago

  test("eligible when session is recent and blueprints unedited", () => {
    const result = canUndoSession(
      { applied_at: recent, is_reversed: false },
      [{ updated_at: recent, created_at: recent }],
    );
    expect(result.eligible).toBe(true);
  });

  test("ineligible when already reversed", () => {
    const result = canUndoSession({ applied_at: recent, is_reversed: true }, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("Already reversed");
  });

  test("ineligible when blueprint was edited after apply", () => {
    const editedAt = new Date(Date.now() - 1000 * 30).toISOString(); // 30 seconds ago
    const result = canUndoSession(
      { applied_at: recent, is_reversed: false },
      [{ updated_at: editedAt, created_at: recent }],
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/manually edited/);
  });

  test("ineligible when session is older than 90 days", () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const result = canUndoSession({ applied_at: old, is_reversed: false }, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/90 days/);
  });
});
