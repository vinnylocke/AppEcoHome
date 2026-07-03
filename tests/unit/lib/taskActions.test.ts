import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("../../../src/events/registry", () => ({
  EVENT: {
    TASK_COMPLETED: "task_completed",
    TASK_SKIPPED: "task_skipped",
    TASK_POSTPONED: "task_postponed",
  },
  logEvent: vi.fn(),
}));
vi.mock("../../../src/services/journalAutoUpdateService", () => ({
  maybeCreateAutoEntry: vi.fn().mockResolvedValue(undefined),
}));

import {
  completeTask,
  materialiseGhost,
  postponeTask,
  skipTask,
  snoozeHarvestTask,
  type ActionableTask,
} from "../../../src/lib/taskActions";
import { supabase } from "../../../src/lib/supabase";
import { logEvent } from "../../../src/events/registry";
import { maybeCreateAutoEntry } from "../../../src/services/journalAutoUpdateService";

// ---- Recording chainable mock DB ----
// Each `.from()` call records the table + every chained method call, and
// resolves (via .then) with the next result in the queue.

interface RecordedCall {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}

let calls: RecordedCall[] = [];
let results: Array<{ data?: unknown; error?: unknown }> = [];

function queueResult(result: { data?: unknown; error?: unknown }) {
  results.push(result);
}

function setupMock() {
  calls = [];
  results = [];
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const record: RecordedCall = { table, ops: [] };
    calls.push(record);
    const result = () =>
      results.length > 0 ? results.shift()! : { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["insert", "update", "delete", "select", "eq", "in", "single"]) {
      chain[method] = (...args: unknown[]) => {
        record.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (onFulfilled: any, onRejected?: any) =>
      Promise.resolve(result()).then(onFulfilled, onRejected);
    return chain as any;
  });
  vi.mocked(logEvent).mockClear();
  vi.mocked(maybeCreateAutoEntry).mockClear();
}

function opArgs(call: RecordedCall, method: string): unknown[] | undefined {
  return call.ops.find((o) => o.method === method)?.args;
}

const CTX = { homeId: "home-1", userId: "user-1" };

function mkGhost(over: Partial<ActionableTask> = {}): ActionableTask {
  return {
    id: "ghost-bp-1-2026-07-02",
    home_id: "home-1",
    blueprint_id: "bp-1",
    title: "Water the beds",
    description: "desc",
    type: "Watering",
    due_date: "2026-07-02",
    status: "Pending",
    location_id: "loc-1",
    area_id: "area-1",
    plan_id: null,
    inventory_item_ids: ["item-1"],
    window_end_date: null,
    next_check_at: null,
    isGhost: true,
    ...over,
  };
}

function mkPhysical(over: Partial<ActionableTask> = {}): ActionableTask {
  return { ...mkGhost(over), id: over.id ?? "task-1", isGhost: false, blueprint_id: over.blueprint_id ?? null };
}

// ---- completeTask ----

describe("taskActions.completeTask", () => {
  beforeEach(setupMock);

  test("physical task → UPDATE status/completed_at/completed_by by id", async () => {
    const task = mkPhysical();
    await completeTask(task, CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("tasks");
    const update = opArgs(calls[0], "update")![0] as Record<string, unknown>;
    expect(update.status).toBe("Completed");
    expect(update.completed_by).toBe("user-1");
    expect(typeof update.completed_at).toBe("string");
    expect(opArgs(calls[0], "eq")).toEqual(["id", "task-1"]);

    expect(logEvent).toHaveBeenCalledWith("task_completed", {
      task_id: "task-1",
      task_type: "Watering",
      inventory_item_ids: ["item-1"],
    });
    expect(maybeCreateAutoEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", type: "Watering" }),
      { homeId: "home-1", userId: "user-1" },
    );
  });

  test("ghost task → INSERT materialised Completed row (buildGhostPayload shape)", async () => {
    queueResult({ data: { id: "new-row" }, error: null });
    const ghost = mkGhost({ window_end_date: "2026-07-09" });
    await completeTask(ghost, CTX);

    expect(calls[0].table).toBe("tasks");
    const inserted = (opArgs(calls[0], "insert")![0] as Record<string, unknown>[])[0];
    expect(inserted).toMatchObject({
      home_id: "home-1",
      blueprint_id: "bp-1",
      title: "Water the beds",
      due_date: "2026-07-02",
      status: "Completed",
      completed_by: "user-1",
      // Wave-20.8 — window context survives materialisation
      window_end_date: "2026-07-09",
    });
    expect(logEvent).toHaveBeenCalledWith(
      "task_completed",
      expect.objectContaining({ task_type: "Watering" }),
    );
  });

  test("ghost unique-violation (23505) → falls back to UPDATE on the materialised slot", async () => {
    queueResult({ data: null, error: { code: "23505" } }); // insert hits unique_blueprint_date
    queueResult({ data: { id: "existing-row" }, error: null }); // fallback update
    const ghost = mkGhost();
    const row = await completeTask(ghost, CTX);

    expect(calls).toHaveLength(2);
    const fallback = calls[1];
    expect(fallback.table).toBe("tasks");
    const update = opArgs(fallback, "update")![0] as Record<string, unknown>;
    expect(update.status).toBe("Completed");
    expect(update.completed_by).toBe("user-1");
    const eqOps = fallback.ops.filter((o) => o.method === "eq").map((o) => o.args);
    expect(eqOps).toEqual([
      ["blueprint_id", "bp-1"],
      ["due_date", "2026-07-02"],
    ]);
    expect(row).toEqual({ id: "existing-row" });
  });

  test("non-unique insert error is rethrown", async () => {
    queueResult({ data: null, error: { code: "42501", message: "rls" } });
    await expect(completeTask(mkGhost(), CTX)).rejects.toMatchObject({ code: "42501" });
    expect(logEvent).not.toHaveBeenCalled();
  });
});

// ---- skipTask ----

describe("taskActions.skipTask", () => {
  beforeEach(setupMock);

  test("physical task → UPDATE status='Skipped'", async () => {
    await skipTask(mkPhysical());
    expect(opArgs(calls[0], "update")![0]).toEqual({ status: "Skipped" });
    expect(opArgs(calls[0], "eq")).toEqual(["id", "task-1"]);
    expect(logEvent).toHaveBeenCalledWith("task_skipped", expect.objectContaining({ task_id: "task-1" }));
  });

  test("ghost task → INSERT Skipped tombstone at the ghost's slot", async () => {
    queueResult({ data: { id: "tomb" }, error: null });
    await skipTask(mkGhost());
    const inserted = (opArgs(calls[0], "insert")![0] as Record<string, unknown>[])[0];
    expect(inserted).toMatchObject({
      blueprint_id: "bp-1",
      due_date: "2026-07-02",
      status: "Skipped",
    });
    expect(logEvent).toHaveBeenCalledWith("task_skipped", expect.anything());
  });
});

// ---- postponeTask ----

describe("taskActions.postponeTask", () => {
  beforeEach(setupMock);

  test("same date → no-op, no DB calls, no event", async () => {
    await postponeTask(mkPhysical(), "2026-07-02");
    expect(calls).toHaveLength(0);
    expect(logEvent).not.toHaveBeenCalled();
  });

  test("ghost → single INSERT of [Skipped tombstone, Pending at new date]", async () => {
    await postponeTask(mkGhost(), "2026-07-05");
    expect(calls).toHaveLength(1);
    const payloads = opArgs(calls[0], "insert")![0] as Record<string, unknown>[];
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ status: "Skipped", due_date: "2026-07-02" });
    expect(payloads[1]).toMatchObject({ status: "Pending", due_date: "2026-07-05" });
    expect(logEvent).toHaveBeenCalledWith("task_postponed", expect.objectContaining({ delay_days: 3 }));
  });

  test("physical blueprint-linked → UPDATE Skipped + INSERT Pending at new date", async () => {
    await postponeTask(mkPhysical({ blueprint_id: "bp-1" }), "2026-07-04");
    expect(calls).toHaveLength(2);
    expect(opArgs(calls[0], "update")![0]).toEqual({ status: "Skipped" });
    expect(opArgs(calls[0], "eq")).toEqual(["id", "task-1"]);
    const inserted = (opArgs(calls[1], "insert")![0] as Record<string, unknown>[])[0];
    expect(inserted).toMatchObject({
      blueprint_id: "bp-1",
      status: "Pending",
      due_date: "2026-07-04",
    });
    expect(logEvent).toHaveBeenCalledWith("task_postponed", expect.objectContaining({ delay_days: 2 }));
  });

  test("standalone physical → UPDATE due_date in place (no tombstone)", async () => {
    await postponeTask(mkPhysical({ blueprint_id: null }), "2026-07-03");
    expect(calls).toHaveLength(1);
    expect(opArgs(calls[0], "update")![0]).toEqual({ due_date: "2026-07-03" });
    expect(opArgs(calls[0], "eq")).toEqual(["id", "task-1"]);
    expect(logEvent).toHaveBeenCalledWith("task_postponed", expect.objectContaining({ delay_days: 1 }));
  });

  test("ghost pair insert unique-violation → recovers row-by-row and still logs", async () => {
    queueResult({ data: null, error: { code: "23505" } }); // pair insert fails
    queueResult({ data: null, error: { code: "23505" } }); // tombstone insert also exists
    queueResult({ data: { id: "existing" }, error: null }); // tombstone fallback update
    queueResult({ data: null, error: { code: "23505" } }); // pending insert already exists → tolerated
    await postponeTask(mkGhost(), "2026-07-05");
    expect(logEvent).toHaveBeenCalledWith("task_postponed", expect.anything());
  });
});

// ---- snoozeHarvestTask (RHO-17 Phase 3 — harvest sheets in-walk) ----

describe("taskActions.snoozeHarvestTask", () => {
  beforeEach(() => {
    setupMock();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("physical task → UPDATE next_check_at = today + days", async () => {
    const backOn = await snoozeHarvestTask(
      mkPhysical({ window_end_date: "2026-07-20" }),
      3,
    );
    expect(backOn).toBe("2026-07-05");
    expect(calls).toHaveLength(1);
    expect(opArgs(calls[0], "update")![0]).toEqual({ next_check_at: "2026-07-05" });
    expect(opArgs(calls[0], "eq")).toEqual(["id", "task-1"]);
  });

  test("snooze is CAPPED at window_end_date — never pushes past the window", async () => {
    const backOn = await snoozeHarvestTask(
      mkPhysical({ window_end_date: "2026-07-04" }),
      7,
    );
    expect(backOn).toBe("2026-07-04");
    expect(opArgs(calls[0], "update")![0]).toEqual({ next_check_at: "2026-07-04" });
  });

  test("ghost → materialise a Pending row first, then snooze the new row", async () => {
    queueResult({
      data: { id: "materialised-row", window_end_date: "2026-07-09" },
      error: null,
    });
    const backOn = await snoozeHarvestTask(
      mkGhost({ window_end_date: "2026-07-09" }),
      5,
    );
    expect(backOn).toBe("2026-07-07");
    expect(calls).toHaveLength(2);
    const inserted = (opArgs(calls[0], "insert")![0] as Record<string, unknown>[])[0];
    expect(inserted).toMatchObject({
      blueprint_id: "bp-1",
      due_date: "2026-07-02",
      status: "Pending",
      window_end_date: "2026-07-09",
    });
    expect(opArgs(calls[1], "update")![0]).toEqual({ next_check_at: "2026-07-07" });
    expect(opArgs(calls[1], "eq")).toEqual(["id", "materialised-row"]);
  });

  test("days are floored at 1 so a zero/negative estimate still snoozes", async () => {
    const backOn = await snoozeHarvestTask(
      mkPhysical({ window_end_date: "2026-07-20" }),
      0,
    );
    expect(backOn).toBe("2026-07-03");
  });
});

// ---- materialiseGhost select passthrough ----

describe("taskActions.materialiseGhost", () => {
  beforeEach(setupMock);

  test("passes the caller's select string through (TaskList joined-row parity)", async () => {
    queueResult({ data: { id: "row", locations: null }, error: null });
    const select = "*, locations(name, is_outside), areas(name), plans(ai_blueprint, name)";
    await materialiseGhost(mkGhost(), "Completed", { completed_at: "t", completed_by: "u" }, select);
    expect(opArgs(calls[0], "select")).toEqual([select]);
    expect(opArgs(calls[0], "single")).toEqual([]);
  });
});
