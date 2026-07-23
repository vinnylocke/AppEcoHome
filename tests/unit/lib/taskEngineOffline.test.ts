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

  test("window ghost is suppressed by a completed task on a NON-window-start day (no phantom)", () => {
    // Regression (OS 35.0046): pre-existing pruning/harvest completed on an
    // arbitrary in-window day (materialised daily by the old cron) must
    // suppress the window ghost — an exact-window-start check emitted a
    // phantom pending ghost alongside the completed task.
    const bp = {
      id: "bp-w", home_id: "h", title: "Spring Pruning", task_type: "Pruning",
      frequency_days: 1, start_date: "2026-05-01", end_date: "2026-05-30", inventory_item_ids: [],
    };
    // completed on 2026-05-06 (NOT the window start 2026-05-01)
    const completed = {
      id: "done", blueprint_id: "bp-w", due_date: "2026-05-06", status: "Completed",
      type: "Pruning", window_end_date: "2026-05-30", updated_at: "2026-05-06T09:00:00.000Z",
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [completed], blueprints: [bp], skippedTombstones: [], ...RANGE,
    });
    expect(tasks.some((t) => t.isGhost)).toBe(false); // no phantom window ghost
    expect(tasks.filter((t) => !t.isGhost).map((t) => t.id)).toEqual(["done"]);
  });

  test("a completed WINDOW task stays visible while its window is still open (completed earlier)", () => {
    // Regression: a window task completed early in its window must not vanish
    // the next day — it stays shown (as completed) until the window closes.
    const completed = {
      id: "done", blueprint_id: null, due_date: "2026-04-20", status: "Completed",
      type: "Pruning", window_end_date: "2026-05-30",
      // completed + created well before the (today-only) range
      updated_at: "2026-04-21T09:00:00.000Z", created_at: "2026-04-21T09:00:00.000Z",
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [completed], blueprints: [], skippedTombstones: [], ...RANGE,
    });
    expect(tasks.some((t) => t.id === "done")).toBe(true);
  });

  test("multiple completed rows for the SAME window collapse to one (no '8 completed pruning')", () => {
    // Leftover daily rows the user completed under the pre-window model, all
    // backfilled with the same window_end_date, must render as ONE entry.
    const mk = (id: string, due: string) => ({
      id, blueprint_id: "bp-w", due_date: due, status: "Completed", type: "Pruning",
      window_end_date: "2026-05-30", updated_at: `${due}T09:00:00.000Z`,
    });
    const physicalTasks = [
      mk("d1", "2026-05-02"), mk("d2", "2026-05-03"), mk("d3", "2026-05-04"),
      mk("d4", "2026-05-05"), mk("d5", "2026-05-06"),
    ];
    const { tasks } = buildRenderTasks({
      physicalTasks, blueprints: [], skippedTombstones: [], ...RANGE,
    });
    const shown = tasks.filter((t) => t.blueprint_id === "bp-w");
    expect(shown).toHaveLength(1);          // one, not five
    expect(shown[0].id).toBe("d1");          // earliest-due representative
  });

  test("completed window tasks for DIFFERENT blueprints are both kept (distinct plants)", () => {
    const mk = (id: string, bp: string) => ({
      id, blueprint_id: bp, due_date: "2026-05-03", status: "Completed", type: "Pruning",
      window_end_date: "2026-05-30", updated_at: "2026-05-03T09:00:00.000Z",
    });
    const { tasks } = buildRenderTasks({
      physicalTasks: [mk("a", "bp-A"), mk("b", "bp-B")], blueprints: [], skippedTombstones: [], ...RANGE,
    });
    expect(tasks.filter((t) => t.status === "Completed")).toHaveLength(2);
  });

  test("a completed window task DROPS OFF once its window has closed", () => {
    const completed = {
      id: "done", blueprint_id: null, due_date: "2026-04-01", status: "Completed",
      type: "Pruning", window_end_date: "2026-04-15", // window closed before RANGE (May)
      updated_at: "2026-04-10T09:00:00.000Z", created_at: "2026-04-10T09:00:00.000Z",
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [completed], blueprints: [], skippedTombstones: [], ...RANGE,
    });
    expect(tasks.some((t) => t.id === "done")).toBe(false);
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

describe("buildRenderTasks — annual carry-over (Track B)", () => {
  // A band spanning this year AND next year, so a projected 2027 occurrence
  // becomes visible when the user navigates forward.
  const MULTI = { startDateStr: "2026-01-01", endDateStr: "2027-12-31", todayStr: "2026-07-01" };
  const harvestBp = (over: Record<string, unknown> = {}) => ({
    id: "bp-h", home_id: "h", title: "Summer Harvest", task_type: "Harvesting",
    frequency_days: 1, start_date: "2026-06-01", end_date: "2026-08-31", inventory_item_ids: [],
    ...over,
  });

  test("recurrence_kind 'once' (default) does NOT carry the window into next year", () => {
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [harvestBp({ recurrence_kind: "once" })], skippedTombstones: [], ...MULTI,
    });
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2026-06-01"]);
  });

  test("a blueprint with NO recurrence_kind defaults to 'once' (legacy cache safety)", () => {
    const bp = harvestBp();
    delete (bp as Record<string, unknown>).recurrence_kind;
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...MULTI,
    });
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2026-06-01"]);
  });

  test("recurrence_kind 'annual' emits one window ghost PER YEAR, same MM-DD", () => {
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [harvestBp({ recurrence_kind: "annual" })], skippedTombstones: [], ...MULTI,
    });
    const ghosts = tasks.filter((t) => t.isGhost);
    expect(ghosts.map((g) => [g.due_date, g.window_end_date])).toEqual([
      ["2026-06-01", "2026-08-31"],
      ["2027-06-01", "2027-08-31"],
    ]);
    // year-embedded ghost ids → distinct materialisation keys per year
    expect(ghosts.map((g) => g.id)).toEqual(["ghost-bp-h-2026-06-01", "ghost-bp-h-2027-06-01"]);
  });

  test("completing THIS year suppresses only this year's ghost — next year still shows (Point 2)", () => {
    // The owner's real case: 2026 window completed/skipped, 2027 must reappear.
    const completed2026 = {
      id: "c26", blueprint_id: "bp-h", due_date: "2026-06-05", window_end_date: "2026-08-31",
      status: "Completed", type: "Harvesting", completed_at: "2026-06-05T10:00:00.000Z",
    };
    const { tasks } = buildRenderTasks({
      physicalTasks: [completed2026], blueprints: [harvestBp({ recurrence_kind: "annual" })], skippedTombstones: [], ...MULTI,
    });
    // No 2026 ghost (its window has a real resolved task); 2027 ghost emitted.
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2027-06-01"]);
    // the 2026 completion itself is still present
    expect(tasks.some((t) => t.id === "c26")).toBe(true);
  });

  test("a Skipped 2026 tombstone likewise suppresses only 2026, not 2027", () => {
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [harvestBp({ recurrence_kind: "annual" })],
      skippedTombstones: [{ blueprint_id: "bp-h", due_date: "2026-06-01" }], ...MULTI,
    });
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2027-06-01"]);
  });

  test("annual seasonal FREQUENCY routine re-anchors each year and never bleeds into the off-season", () => {
    // Summer watering every 30 days; must appear in both summers, never in the gap.
    const bp = {
      id: "bp-w", home_id: "h", title: "Summer Watering", task_type: "Watering",
      frequency_days: 30, start_date: "2026-06-01", end_date: "2026-08-31",
      recurrence_kind: "annual", inventory_item_ids: [],
    };
    const dues = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...MULTI,
    }).tasks.filter((t) => t.isGhost).map((g) => g.due_date as string);
    expect(dues).toContain("2026-06-01");
    expect(dues).toContain("2027-06-01");
    // every occurrence sits inside a Jun–Aug window (no fall/winter bleed)
    expect(dues.every((d) => d.slice(5, 7) >= "06" && d.slice(5, 7) <= "08")).toBe(true);
    // and the routine carries NO window_end_date (it's a frequency task, not a window task)
    expect(buildRenderTasks({ physicalTasks: [], blueprints: [bp], skippedTombstones: [], ...MULTI })
      .tasks.filter((t) => t.isGhost).every((g) => g.window_end_date === undefined)).toBe(true);
  });

  test("lifecycle_capped stops projecting after recurs_until", () => {
    const bp = harvestBp({ recurrence_kind: "lifecycle_capped", recurs_until: "2027-08-31" });
    const { tasks } = buildRenderTasks({
      physicalTasks: [], blueprints: [bp], skippedTombstones: [],
      startDateStr: "2026-01-01", endDateStr: "2029-12-31", todayStr: "2026-07-01",
    });
    expect(tasks.filter((t) => t.isGhost).map((g) => g.due_date)).toEqual(["2026-06-01", "2027-06-01"]);
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
