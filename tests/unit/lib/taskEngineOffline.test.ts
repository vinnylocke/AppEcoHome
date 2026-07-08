import { describe, test, expect, vi, beforeEach } from "vitest";

// In-memory snapshot store so we can assert what inject* writes, and an
// isOffline toggle. supabase is mocked to a no-op (these tests never fetch).
const { store, isOfflineMock } = vi.hoisted(() => ({
  store: new Map<string, any>(),
  isOfflineMock: vi.fn(() => true),
}));

vi.mock("../../../src/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../../../src/hooks/useOnline", () => ({ isOffline: isOfflineMock }));
vi.mock("../../../src/lib/snapshotCache", () => ({
  readSnapshot: (name: string, scope: string) => {
    const v = store.get(`${name}:${scope}`);
    return v ? { data: v, cachedAt: 0 } : null;
  },
  writeSnapshot: (name: string, scope: string, data: any) => {
    store.set(`${name}:${scope}`, data);
  },
}));

import { TaskEngine, buildRenderTasks } from "../../../src/lib/taskEngine";

const RANGE = { startDateStr: "2026-05-01", endDateStr: "2026-05-14", todayStr: "2026-05-01" };

describe("buildRenderTasks (pure)", () => {
  test("passes a one-off physical task through unchanged", () => {
    const oneOff = { id: "t1", blueprint_id: null, due_date: "2026-05-03", status: "Pending", type: "Watering" };
    const { tasks } = buildRenderTasks({
      physicalTasks: [oneOff], blueprints: [], skippedTombstones: [], ...RANGE,
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("t1");
    expect(tasks[0].isGhost).toBeUndefined();
  });

  test("generates recurring ghosts from a blueprint across the range", () => {
    const bp = {
      id: "bp-1", home_id: "h", title: "Weekly Watering", task_type: "Watering",
      frequency_days: 7, start_date: "2026-05-01", end_date: null, inventory_item_ids: [],
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    const ghosts = tasks.filter((t) => t.isGhost);
    // 2026-05-01 and 2026-05-08 fall inside the 01–14 window (7-day cadence).
    expect(ghosts.map((g) => g.due_date)).toEqual(["2026-05-01", "2026-05-08"]);
    expect(ghosts[0].id).toBe("ghost-bp-1-2026-05-01");
  });

  test("a materialised physical task suppresses the ghost at that date", () => {
    const bp = {
      id: "bp-1", home_id: "h", title: "Weekly Watering", task_type: "Watering",
      frequency_days: 7, start_date: "2026-05-01", end_date: null, inventory_item_ids: [],
    };
    const physical = { id: "t1", blueprint_id: "bp-1", due_date: "2026-05-01", status: "Pending", type: "Watering" };
    const { tasks } = buildRenderTasks({
      physicalTasks: [physical], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    // No ghost at 05-01 (materialised); ghost at 05-08 remains.
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2026-05-08"]);
    expect(tasks.some((t) => t.id === "t1")).toBe(true);
  });

  test("harvest blueprint with an end_date emits one window ghost", () => {
    const bp = {
      id: "bp-h", home_id: "h", title: "Tomato Harvest", task_type: "Harvesting",
      frequency_days: 1, start_date: "2026-05-02", end_date: "2026-05-30", inventory_item_ids: [],
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    const ghosts = tasks.filter((t) => t.isGhost);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].due_date).toBe("2026-05-02");
    expect(ghosts[0].window_end_date).toBe("2026-05-30");
  });
});

describe("TaskEngine.injectOffline*", () => {
  beforeEach(() => {
    store.clear();
    TaskEngine.invalidateCache();
  });

  test("injectOfflineTask prepends to the snapshot's physicalTasks", () => {
    store.set("tasks:home-1", { physicalTasks: [{ id: "old" }], blueprints: [], skippedTombstones: [] });
    TaskEngine.injectOfflineTask("home-1", { id: "new", due_date: "2026-05-05" });
    const snap = store.get("tasks:home-1");
    expect(snap.physicalTasks.map((t: any) => t.id)).toEqual(["new", "old"]);
    expect(snap.blueprints).toEqual([]); // untouched
  });

  test("injectOfflineBlueprint prepends to the snapshot's blueprints", () => {
    store.set("tasks:home-1", { physicalTasks: [], blueprints: [{ id: "bp-old" }], skippedTombstones: [] });
    TaskEngine.injectOfflineBlueprint("home-1", { id: "bp-new", frequency_days: 7, start_date: "2026-05-01", task_type: "Watering" });
    const snap = store.get("tasks:home-1");
    expect(snap.blueprints.map((b: any) => b.id)).toEqual(["bp-new", "bp-old"]);
  });

  test("inject is a safe no-op when no snapshot exists yet", () => {
    expect(() => TaskEngine.injectOfflineTask("home-none", { id: "x" })).not.toThrow();
    expect(store.get("tasks:home-none")).toBeUndefined();
  });
});
