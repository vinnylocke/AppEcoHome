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

  test("a task completed TODAY but due earlier still renders in today's range (so cleared overdue work stays visible)", () => {
    // range = today-only (the dashboard Today list). Due yesterday, done today.
    // The engine keys "completed in window" on updated_at/created_at (its
    // proxy for completion time), which is set to now when a task is ticked.
    const overdueDoneToday = {
      id: "od",
      blueprint_id: null,
      due_date: "2026-04-30",
      status: "Completed",
      type: "Watering",
      updated_at: "2026-05-01T09:00:00.000Z",
      completed_at: "2026-05-01T09:00:00.000Z",
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [overdueDoneToday],
      blueprints: [],
      skippedTombstones: [],
      startDateStr: "2026-05-01",
      endDateStr: "2026-05-01",
      todayStr: "2026-05-01",
    });
    expect(tasks.some((t) => t.id === "od")).toBe(true);
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

  test("a seasonal PRUNING blueprint (end_date) emits ONE window ghost, not a task per day", () => {
    // freq 1 across a 28-day window — the OLD behaviour was a ghost every day.
    const bp = {
      id: "bp-p", home_id: "h", title: "Spring Pruning", task_type: "Pruning",
      frequency_days: 1, start_date: "2026-05-02", end_date: "2026-05-30", inventory_item_ids: [],
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    const ghosts = tasks.filter((t) => t.isGhost);
    expect(ghosts).toHaveLength(1); // ONE window task, not 14
    expect(ghosts[0].due_date).toBe("2026-05-02");
    expect(ghosts[0].window_end_date).toBe("2026-05-30");
    expect(ghosts[0].type).toBe("Pruning");
  });

  test("a frequency PRUNING blueprint (no end_date) still recurs per frequency", () => {
    const bp = {
      id: "bp-pf", home_id: "h", title: "Prune", task_type: "Pruning",
      frequency_days: 7, start_date: "2026-05-01", end_date: null, inventory_item_ids: [],
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    const ghosts = tasks.filter((t) => t.isGhost);
    // 2026-05-01 and 2026-05-08 within the 01–14 window, no window_end_date.
    expect(ghosts.map((g) => g.due_date)).toEqual(["2026-05-01", "2026-05-08"]);
    expect(ghosts[0].window_end_date).toBeUndefined();
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

  test("injectOfflineBlueprint replaces an existing blueprint by id (edit in place)", () => {
    store.set("tasks:home-1", {
      physicalTasks: [],
      blueprints: [{ id: "bp-1", title: "Old", frequency_days: 7 }],
      skippedTombstones: [],
    });
    TaskEngine.injectOfflineBlueprint("home-1", { id: "bp-1", title: "New", frequency_days: 3 });
    const snap = store.get("tasks:home-1");
    expect(snap.blueprints).toHaveLength(1); // replaced, not duplicated
    expect(snap.blueprints[0]).toMatchObject({ id: "bp-1", title: "New", frequency_days: 3 });
  });

  test("injectOfflineTask replaces an existing task by id", () => {
    store.set("tasks:home-1", {
      physicalTasks: [{ id: "t1", status: "Pending" }],
      blueprints: [],
      skippedTombstones: [],
    });
    TaskEngine.injectOfflineTask("home-1", { id: "t1", status: "Completed" });
    const snap = store.get("tasks:home-1");
    expect(snap.physicalTasks).toHaveLength(1);
    expect(snap.physicalTasks[0].status).toBe("Completed");
  });
});
