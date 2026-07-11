import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn() },
}));
vi.mock("../../../src/events/registry", () => ({
  EVENT: {
    CARE_ADJUSTMENT_APPLIED: "care_adjustment_applied",
    CARE_ADJUSTMENT_DISMISSED: "care_adjustment_dismissed",
  },
  logEvent: vi.fn(),
}));
vi.mock("../../../src/services/blueprintService", () => ({
  BlueprintService: { generateBlueprintTasks: vi.fn() },
}));

import {
  applyCareAdjustment,
  dismissCareAdjustment,
  fetchCareAdjustment,
  type CareAdjustmentRow,
} from "../../../src/lib/careAdjustments";
import { supabase } from "../../../src/lib/supabase";
import { logEvent } from "../../../src/events/registry";
import { BlueprintService } from "../../../src/services/blueprintService";

// ---- Recording chainable mock DB (same shape as taskActions.test.ts) ----

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
    for (const method of ["insert", "update", "delete", "select", "eq", "in", "single", "maybeSingle"]) {
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
  vi.mocked(BlueprintService.generateBlueprintTasks).mockClear();
}

function opArgs(call: RecordedCall, method: string): unknown[] | undefined {
  return call.ops.find((o) => o.method === method)?.args;
}

const OPTS = { homeId: "home-1", currentUserId: "user-1" };

function mkAdj(over: Partial<CareAdjustmentRow> = {}): CareAdjustmentRow {
  return {
    id: "adj-1",
    area_id: "area-1",
    blueprint_id: "bp-1",
    kind: "tighten_watering",
    suggested_frequency_days: 2,
    evidence: { headline: "Bed A dries fast" },
    ...over,
  };
}

beforeEach(setupMock);

describe("applyCareAdjustment — tighten/stretch", () => {
  test("claims the proposal (CAS) then updates the blueprint frequency", async () => {
    queueResult({ data: [{ id: "adj-1" }], error: null }); // claim wins
    const res = await applyCareAdjustment(mkAdj(), OPTS);

    expect(res.ok).toBe(true);
    // The FIRST DB call is the atomic claim on care_adjustments, gated on status.
    const claim = calls[0];
    expect(claim.table).toBe("care_adjustments");
    const patch = opArgs(claim, "update")?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("applied");
    expect(patch.applied_by).toBe("user-1");
    expect(typeof patch.applied_at).toBe("string");
    const eqOps = claim.ops.filter((o) => o.method === "eq").map((o) => o.args);
    expect(eqOps).toContainEqual(["status", "proposed"]); // the CAS guard

    const bp = calls.find((c) => c.table === "task_blueprints")!;
    expect(opArgs(bp, "update")?.[0]).toEqual({ frequency_days: 2 });
    expect(opArgs(bp, "eq")).toEqual(["id", "bp-1"]);
    expect(logEvent).toHaveBeenCalledWith("care_adjustment_applied", expect.objectContaining({ kind: "tighten_watering" }));
  });

  test("double-apply is prevented: a lost claim (0 rows) → ok:false, no mutation", async () => {
    queueResult({ data: [], error: null }); // someone else already claimed it
    const res = await applyCareAdjustment(mkAdj(), OPTS);

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/already been handled/);
    expect(calls.some((c) => c.table === "task_blueprints")).toBe(false); // never mutated
    expect(logEvent).not.toHaveBeenCalled();
  });

  test("blueprint update failure after claiming → revert to proposed, ok:false", async () => {
    queueResult({ data: [{ id: "adj-1" }], error: null }); // claim wins
    queueResult({ error: { message: "boom" } });            // blueprint update fails
    const res = await applyCareAdjustment(mkAdj({ kind: "stretch_watering", suggested_frequency_days: 5 }), OPTS);

    expect(res.ok).toBe(false);
    // The last care_adjustments write reverts the claim so it can be retried.
    const adjCalls = calls.filter((c) => c.table === "care_adjustments");
    const revert = opArgs(adjCalls[adjCalls.length - 1], "update")?.[0] as Record<string, unknown>;
    expect(revert.status).toBe("proposed");
    expect(revert.applied_at).toBeNull();
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("applyCareAdjustment — create_watering_routine", () => {
  test("claims, then creates the blueprint + first task, kicks generation", async () => {
    queueResult({ data: [{ id: "adj-1" }], error: null }); // claim wins (first call)
    queueResult({ data: { name: "Raised Bed A", location_id: "loc-1" } }); // areas
    queueResult({ data: [{ id: "item-1" }, { id: "item-2" }] }); // planted instances
    queueResult({ data: { id: "bp-new", title: "Watering — Raised Bed A", description: "d" } }); // blueprint insert
    queueResult({ error: null }); // task insert

    const res = await applyCareAdjustment(
      mkAdj({ kind: "create_watering_routine", blueprint_id: null, suggested_frequency_days: 3 }),
      OPTS,
    );

    expect(res.ok).toBe(true);
    const bp = calls.find((c) => c.table === "task_blueprints")!;
    const bpRow = (opArgs(bp, "insert")?.[0] as Record<string, unknown>[])[0];
    expect(bpRow.frequency_days).toBe(3);
    expect(bpRow.area_id).toBe("area-1");
    expect(bpRow.inventory_item_ids).toEqual(["item-1", "item-2"]);
    expect(bpRow.is_recurring).toBe(true);

    const task = calls.find((c) => c.table === "tasks")!;
    const taskRow = (opArgs(task, "insert")?.[0] as Record<string, unknown>[])[0];
    expect(taskRow.blueprint_id).toBe("bp-new");
    expect(taskRow.type).toBe("Watering");
    expect(taskRow.status).toBe("Pending");

    expect(BlueprintService.generateBlueprintTasks).toHaveBeenCalledWith("bp-new", expect.any(String));
  });
});

describe("applyCareAdjustment — stress_risk", () => {
  test("acknowledges only: the claim IS the whole write, no blueprint/task mutation", async () => {
    queueResult({ data: [{ id: "adj-1" }], error: null }); // claim wins
    const res = await applyCareAdjustment(
      mkAdj({ kind: "stress_risk", blueprint_id: null, suggested_frequency_days: null }),
      OPTS,
    );

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Noted/);
    // Only the claim on care_adjustments — no separate status write, no mutation.
    expect(calls.map((c) => c.table)).toEqual(["care_adjustments"]);
  });
});

describe("dismissCareAdjustment", () => {
  test("sets status dismissed + dismissed_at and logs the event", async () => {
    const res = await dismissCareAdjustment(mkAdj());

    expect(res.ok).toBe(true);
    const adj = calls.find((c) => c.table === "care_adjustments")!;
    const patch = opArgs(adj, "update")?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("dismissed");
    expect(typeof patch.dismissed_at).toBe("string"); // cooldown anchor (bug-audit #19)
    expect(logEvent).toHaveBeenCalledWith("care_adjustment_dismissed", expect.objectContaining({ kind: "tighten_watering" }));
  });

  test("update error returns ok:false", async () => {
    queueResult({ error: { message: "nope" } });
    const res = await dismissCareAdjustment(mkAdj());
    expect(res.ok).toBe(false);
  });
});

describe("fetchCareAdjustment", () => {
  test("returns the row when still proposed", async () => {
    queueResult({ data: { id: "adj-1", status: "proposed", kind: "tighten_watering" } });
    const row = await fetchCareAdjustment("adj-1");
    expect(row?.id).toBe("adj-1");
  });

  test("returns null when already applied/dismissed or missing", async () => {
    queueResult({ data: { id: "adj-1", status: "applied" } });
    expect(await fetchCareAdjustment("adj-1")).toBeNull();
    queueResult({ data: null });
    expect(await fetchCareAdjustment("adj-2")).toBeNull();
  });
});
