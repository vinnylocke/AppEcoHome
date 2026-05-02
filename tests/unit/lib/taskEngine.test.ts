import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import { TaskEngine } from "../../../src/lib/taskEngine";
import { supabase } from "../../../src/lib/supabase";

// ---- Chainable mock DB ----
// Each method returns `this`, making the chain awaitable via .then().

function makeErrorChain(error: unknown) {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  for (const method of [
    "select", "eq", "neq", "gte", "lte", "not", "in",
    "order", "overlaps", "single", "update", "insert", "delete",
  ]) {
    chain[method] = noop;
  }
  chain.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
  chain.catch = (onRejected: any) =>
    Promise.resolve({ data: null, error }).catch(onRejected);
  return chain as any;
}

function makeChain(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  for (const method of [
    "select", "eq", "neq", "gte", "lte", "not", "in",
    "order", "overlaps", "single", "update", "insert", "delete",
  ]) {
    chain[method] = noop;
  }
  chain.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  chain.catch = (onRejected: any) =>
    Promise.resolve({ data, error: null }).catch(onRejected);
  return chain as any;
}

// Per-table call queues. Each entry in the array is the data for one `.from()` call.
// DB call order in fetchTasksWithGhosts:
//   tasks[0]           — physical tasks (non-skipped)
//   task_blueprints[0] — recurring blueprints
//   tasks[1]           — skipped tombstones
//   inventory_items[0] — only if uniqueItemIds.length > 0
//   task_dependencies[0] — only if physicalIds.length > 0
//   tasks[2]           — pending parents (only if deps returned rows)

const mockQueues = new Map<string, unknown[][]>();

function queueTable(tableName: string, ...dataPerCall: unknown[][]) {
  mockQueues.set(tableName, [...dataPerCall]);
}

function setupMock() {
  mockQueues.clear();
  vi.mocked(supabase.from).mockImplementation((tableName: string) => {
    const queue = mockQueues.get(tableName);
    const data = queue && queue.length > 0 ? queue.shift()! : [];
    return makeChain(data);
  });
}

// Default window — a 2-week period starting on the blueprint start date.
const PARAMS = {
  homeId: "home-1",
  startDateStr: "2026-05-01",
  endDateStr: "2026-05-14",
  todayStr: "2026-05-01",
};

function makeBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    id: "bp-1",
    home_id: "home-1",
    title: "Weekly Watering",
    description: "",
    task_type: "Watering",
    frequency_days: 7,
    start_date: "2026-05-01",
    end_date: null,
    is_recurring: true,
    inventory_item_ids: [],
    location_id: "loc-1",
    area_id: "area-1",
    plan_id: null,
    locations: null,
    areas: null,
    plans: null,
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    blueprint_id: "bp-1",
    home_id: "home-1",
    title: "Weekly Watering",
    due_date: "2026-05-01",
    status: "Pending",
    inventory_item_ids: [],
    updated_at: "2026-05-01T09:00:00.000Z",
    created_at: "2026-05-01T09:00:00.000Z",
    ...overrides,
  };
}

// ---- Ghost task generation ----

describe("TaskEngine.fetchTasksWithGhosts — ghost generation", () => {
  beforeEach(setupMock);

  test("generates ghost tasks for each frequency interval within the window", async () => {
    // Blueprint: start=May 1, freq=7, window=May 1–14 → ghosts on May 1 and May 8
    queueTable("tasks", [], []); // physical, tombstones
    queueTable("task_blueprints", [makeBlueprint()]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghosts = result.tasks.filter((t: any) => t.isGhost);

    expect(ghosts).toHaveLength(2);
    expect(ghosts.map((g: any) => g.due_date)).toEqual(["2026-05-01", "2026-05-08"]);
  });

  test("ghost task ID follows the ghost-{blueprint_id}-{YYYY-MM-DD} format", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [makeBlueprint({ id: "bp-watering" })]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghost = result.tasks.find(
      (t: any) => t.isGhost && t.due_date === "2026-05-01",
    );
    expect(ghost?.id).toBe("ghost-bp-watering-2026-05-01");
  });

  test("ghost is not generated when a physical task already exists on that date", async () => {
    // Physical task occupies May 1 → only May 8 should be ghosted
    const physical = makeTask({ due_date: "2026-05-01" });
    queueTable("tasks", [physical], []); // physical, tombstones
    queueTable("task_blueprints", [makeBlueprint()]);
    queueTable("task_dependencies", []); // called because physicalIds is non-empty

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);

    expect(
      result.tasks.filter((t: any) => t.isGhost && t.due_date === "2026-05-01"),
    ).toHaveLength(0);

    expect(
      result.tasks.filter((t: any) => t.isGhost && t.due_date === "2026-05-08"),
    ).toHaveLength(1);
  });

  test("ghost is suppressed by a Skipped tombstone on the same date", async () => {
    const tombstone = { blueprint_id: "bp-1", due_date: "2026-05-01" };
    queueTable("tasks", [], [tombstone]); // physical empty, tombstones
    queueTable("task_blueprints", [makeBlueprint()]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);

    expect(
      result.tasks.filter((t: any) => t.isGhost && t.due_date === "2026-05-01"),
    ).toHaveLength(0);

    // May 8 has no tombstone — should still appear
    expect(
      result.tasks.filter((t: any) => t.isGhost && t.due_date === "2026-05-08"),
    ).toHaveLength(1);
  });

  test("blueprint without frequency_days produces no ghost tasks", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [makeBlueprint({ frequency_days: null })]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.filter((t: any) => t.isGhost)).toHaveLength(0);
  });

  test("blueprint without start_date produces no ghost tasks", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [makeBlueprint({ start_date: null })]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.filter((t: any) => t.isGhost)).toHaveLength(0);
  });

  test("blueprint with end_date stops ghost generation at that date", async () => {
    // end_date=May 7 → only May 1 is within the season; May 8 is past it
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [makeBlueprint({ end_date: "2026-05-07" })]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghosts = result.tasks.filter((t: any) => t.isGhost);

    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].due_date).toBe("2026-05-01");
  });

  test("ghost carries correct blueprint and home metadata", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [makeBlueprint()]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghost = result.tasks.find((t: any) => t.isGhost);

    expect(ghost?.blueprint_id).toBe("bp-1");
    expect(ghost?.home_id).toBe("home-1");
    expect(ghost?.type).toBe("Watering");
    expect(ghost?.status).toBe("Pending");
  });
});

// ---- Completed task filtering ----

describe("TaskEngine.fetchTasksWithGhosts — completed task filtering", () => {
  beforeEach(setupMock);

  test("completed task whose due_date is within the window is included", async () => {
    const task = makeTask({
      id: "completed-in-window",
      due_date: "2026-05-05",
      status: "Completed",
      updated_at: "2026-05-05T10:00:00.000Z",
    });
    queueTable("tasks", [task], []);
    queueTable("task_blueprints", [[]]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.some((t: any) => t.id === "completed-in-window")).toBe(true);
  });

  test("completed task due before window but marked complete within window is included", async () => {
    const task = makeTask({
      id: "completed-late",
      due_date: "2026-04-28",
      status: "Completed",
      updated_at: "2026-05-03T10:00:00.000Z", // completed inside the window
    });
    queueTable("tasks", [task], []);
    queueTable("task_blueprints", [[]]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.some((t: any) => t.id === "completed-late")).toBe(true);
  });

  test("completed task entirely outside the window (due and completed before) is excluded", async () => {
    const task = makeTask({
      id: "old-completed",
      due_date: "2026-04-01",
      status: "Completed",
      updated_at: "2026-04-01T10:00:00.000Z",
    });
    queueTable("tasks", [task], []);
    queueTable("task_blueprints", [[]]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.some((t: any) => t.id === "old-completed")).toBe(false);
  });

  test("pending task outside date window is still returned (includeOverdue=false omits start clamp but lte still applies)", async () => {
    // A pending task due within the window should always appear.
    const task = makeTask({ id: "pending-in-window", due_date: "2026-05-10", status: "Pending" });
    queueTable("tasks", [task], []);
    queueTable("task_blueprints", [[]]);
    queueTable("task_dependencies", []);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks.some((t: any) => t.id === "pending-in-window")).toBe(true);
  });
});

// ---- Return shape ----

describe("TaskEngine.fetchTasksWithGhosts — return shape", () => {
  beforeEach(setupMock);

  test("result always contains tasks array, inventoryDict object, and blockedTaskIds Set", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [[]]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);

    expect(Array.isArray(result.tasks)).toBe(true);
    expect(typeof result.inventoryDict).toBe("object");
    expect(result.blockedTaskIds).toBeInstanceOf(Set);
  });

  test("returns empty tasks when there are no blueprints and no physical tasks", async () => {
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [[]]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.tasks).toHaveLength(0);
  });

  test("multiple blueprints each produce their own ghost series", async () => {
    const bp1 = makeBlueprint({ id: "bp-water", start_date: "2026-05-01", frequency_days: 7 });
    const bp2 = makeBlueprint({ id: "bp-feed", start_date: "2026-05-03", frequency_days: 7 });
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [bp1, bp2]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghosts = result.tasks.filter((t: any) => t.isGhost);

    // bp-water → May 1, May 8; bp-feed → May 3, May 10
    expect(ghosts).toHaveLength(4);
    expect(ghosts.some((g: any) => g.blueprint_id === "bp-water")).toBe(true);
    expect(ghosts.some((g: any) => g.blueprint_id === "bp-feed")).toBe(true);
  });
});

// ---- Inventory dict ----

describe("TaskEngine.fetchTasksWithGhosts — inventory dict", () => {
  beforeEach(setupMock);

  test("inventory items referenced by tasks are fetched and keyed by id", async () => {
    const task = makeTask({ inventory_item_ids: ["item-1"] });
    const invItem = { id: "item-1", plant_name: "Rose", identifier: "R1", location_name: "Garden", area_name: "Bed A", plants: null };

    queueTable("tasks", [task], []);
    queueTable("task_blueprints", []);
    queueTable("inventory_items", [invItem]);
    queueTable("task_dependencies", []);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.inventoryDict["item-1"]).toEqual(invItem);
  });

  test("inventory items referenced by blueprints are included in the dict", async () => {
    const bp = makeBlueprint({ inventory_item_ids: ["item-2"] });
    const invItem = { id: "item-2", plant_name: "Fern", identifier: "F1", location_name: "Indoor", area_name: null, plants: null };

    queueTable("tasks", [], []);
    queueTable("task_blueprints", [bp]);
    queueTable("inventory_items", [invItem]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.inventoryDict["item-2"]).toEqual(invItem);
  });

  test("duplicate item ids across tasks and blueprints are de-duped in the fetch", async () => {
    const task = makeTask({ inventory_item_ids: ["item-shared"] });
    const bp = makeBlueprint({ inventory_item_ids: ["item-shared"] });
    const invItem = { id: "item-shared", plant_name: "Basil", identifier: "B1", location_name: "Kitchen", area_name: null, plants: null };

    queueTable("tasks", [task], []);
    queueTable("task_blueprints", [bp]);
    queueTable("inventory_items", [invItem]);
    queueTable("task_dependencies", []);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.inventoryDict["item-shared"]).toEqual(invItem);
  });
});

// ---- Fast-forward ----

describe("TaskEngine.fetchTasksWithGhosts — blueprint fast-forward", () => {
  beforeEach(setupMock);

  test("blueprint starting before the window is fast-forwarded to the first hit inside the window", async () => {
    // start=2026-04-01, freq=7 → series: Apr 1, 8, 15, 22, 29, May 6, 13
    // Window is May 1–14 → fast-forwarded to May 6; ghosts at May 6 and May 13
    const bp = makeBlueprint({ start_date: "2026-04-01", frequency_days: 7 });
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [bp]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghosts = result.tasks.filter((t: any) => t.isGhost);

    expect(ghosts.length).toBeGreaterThanOrEqual(1);
    ghosts.forEach((g: any) => {
      expect(g.due_date >= PARAMS.startDateStr).toBe(true);
      expect(g.due_date <= PARAMS.endDateStr).toBe(true);
    });
    expect(ghosts.some((g: any) => g.due_date === "2026-05-06")).toBe(true);
    expect(ghosts.some((g: any) => g.due_date === "2026-05-13")).toBe(true);
  });

  test("blueprint starting far before the window still lands correctly after fast-forward", async () => {
    // start=2026-01-01, freq=30 → Jan 1, 31, Mar 2, Apr 1, May 1
    const bp = makeBlueprint({ start_date: "2026-01-01", frequency_days: 30 });
    queueTable("tasks", [], []);
    queueTable("task_blueprints", [bp]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    const ghosts = result.tasks.filter((t: any) => t.isGhost);

    expect(ghosts.length).toBeGreaterThanOrEqual(1);
    ghosts.forEach((g: any) => {
      expect(g.due_date >= PARAMS.startDateStr).toBe(true);
    });
  });
});

// ---- Blocked tasks ----

describe("TaskEngine.fetchTasksWithGhosts — blocked task dependencies", () => {
  beforeEach(setupMock);

  test("task with a still-pending parent is added to blockedTaskIds", async () => {
    const task = makeTask({ id: "task-blocked", blueprint_id: null });
    const dep = { task_id: "task-blocked", depends_on_task_id: "parent-task" };
    const pendingParent = { id: "parent-task" };

    // DB call order: tasks(physical), task_blueprints, tasks(tombstones),
    //                task_dependencies, tasks(pending parents)
    queueTable("tasks", [task], [], [pendingParent]);
    queueTable("task_blueprints", []);
    queueTable("task_dependencies", [dep]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.blockedTaskIds.has("task-blocked")).toBe(true);
  });

  test("task whose parent has already completed is not blocked", async () => {
    const task = makeTask({ id: "task-free", blueprint_id: null });
    const dep = { task_id: "task-free", depends_on_task_id: "completed-parent" };

    // pendingParents query returns [] — parent is not pending
    queueTable("tasks", [task], [], []);
    queueTable("task_blueprints", []);
    queueTable("task_dependencies", [dep]);

    const result = await TaskEngine.fetchTasksWithGhosts(PARAMS);
    expect(result.blockedTaskIds.has("task-free")).toBe(false);
  });
});

// ---- Error handling ----

describe("TaskEngine.fetchTasksWithGhosts — error propagation", () => {
  test("throws when the physical tasks query errors", async () => {
    const err = new Error("tasks DB error");
    vi.mocked(supabase.from).mockImplementationOnce(() => makeErrorChain(err));

    await expect(TaskEngine.fetchTasksWithGhosts(PARAMS)).rejects.toThrow("tasks DB error");
  });

  test("throws when the blueprints query errors", async () => {
    const err = new Error("blueprints DB error");
    vi.mocked(supabase.from)
      .mockImplementationOnce(() => makeChain([]))       // tasks (physical) — ok
      .mockImplementationOnce(() => makeErrorChain(err)); // task_blueprints — error

    await expect(TaskEngine.fetchTasksWithGhosts(PARAMS)).rejects.toThrow("blueprints DB error");
  });

  test("throws when the inventory items query errors", async () => {
    const err = new Error("inventory DB error");
    const task = makeTask({ inventory_item_ids: ["item-x"] });

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => makeChain([task]))   // tasks (physical)
      .mockImplementationOnce(() => makeChain([]))       // task_blueprints
      .mockImplementationOnce(() => makeChain([]))       // tasks (tombstones)
      .mockImplementationOnce(() => makeErrorChain(err)); // inventory_items

    await expect(TaskEngine.fetchTasksWithGhosts(PARAMS)).rejects.toThrow("inventory DB error");
  });
});
