import { describe, test, expect, vi, beforeEach } from "vitest";

// Records every terminal DB op so we can assert what the flush did, and lets
// each test control what the "find existing materialised task" query returns.
const { calls, findResult, supabaseMock } = vi.hoisted(() => {
  const calls: any[] = [];
  const findResult = { value: [] as any[] };
  function chain(table: string) {
    const state: any = { table, mode: null, payload: null };
    const api: any = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      limit: () => Promise.resolve({ data: findResult.value, error: null }),
      insert: (p: any) => {
        calls.push({ table, op: "insert", payload: p });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (p: any, opts: any) => {
        calls.push({ table, op: "upsert", payload: p, opts });
        state.mode = "upsert";
        return api;
      },
      single: () => Promise.resolve({ data: { id: "resolved-real-id" }, error: null }),
    };
    return api;
  }
  const supabaseMock = {
    from: vi.fn((t: string) => chain(t)),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: "u1" } } } })) },
  };
  return { calls, findResult, supabaseMock };
});

vi.mock("../../../src/lib/supabase", () => ({ supabase: supabaseMock }));

// jsdom's localStorage is a no-op in this setup, so back it with a Map.
function installMockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
  });
}

import { enqueue, flushQueue, clearQueue } from "../../../src/lib/offlineQueue";

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

describe("offlineQueue — task-dep-link (resolve-on-flush)", () => {
  beforeEach(() => {
    installMockLocalStorage();
    clearQueue();
    calls.length = 0;
    findResult.value = [];
    setOnline(true);
    supabaseMock.from.mockClear();
  });

  test("concrete target: inserts the dependency directly, no task query/upsert", async () => {
    enqueue({ kind: "task-dep-link", createdTaskId: "new-1", orientation: "waiting_on", targetTaskId: "real-2" });
    await flushQueue();
    const deps = calls.filter((c) => c.table === "task_dependencies");
    expect(deps).toHaveLength(1);
    expect(deps[0].payload).toEqual({ task_id: "new-1", depends_on_task_id: "real-2" });
    // No task materialisation happened.
    expect(calls.some((c) => c.table === "tasks")).toBe(false);
  });

  test("blocks orientation flips the columns", async () => {
    enqueue({ kind: "task-dep-link", createdTaskId: "new-1", orientation: "blocks", targetTaskId: "real-2" });
    await flushQueue();
    const dep = calls.find((c) => c.table === "task_dependencies");
    expect(dep.payload).toEqual({ task_id: "real-2", depends_on_task_id: "new-1" });
  });

  test("ghost target already materialised (cron or prior flush): links to the found id, no upsert", async () => {
    findResult.value = [{ id: "cron-made-id" }];
    enqueue({
      kind: "task-dep-link", createdTaskId: "new-1", orientation: "waiting_on",
      targetGhost: { home_id: "h", blueprint_id: "bp", due_date: "2026-07-03", title: "T", description: null, type: "Watering", location_id: null, area_id: null, plan_id: null, inventory_item_ids: [] },
    });
    await flushQueue();
    expect(calls.some((c) => c.op === "upsert")).toBe(false); // no duplicate insert
    const dep = calls.find((c) => c.table === "task_dependencies");
    expect(dep.payload).toEqual({ task_id: "new-1", depends_on_task_id: "cron-made-id" });
  });

  test("ghost target not yet materialised: upserts on (blueprint_id,due_date) then links to the returned id", async () => {
    findResult.value = []; // nothing exists yet
    enqueue({
      kind: "task-dep-link", createdTaskId: "new-1", orientation: "waiting_on",
      targetGhost: { home_id: "h", blueprint_id: "bp", due_date: "2026-07-03", title: "T", description: null, type: "Watering", location_id: null, area_id: null, plan_id: null, inventory_item_ids: [] },
    });
    await flushQueue();
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert.table).toBe("tasks");
    expect(upsert.opts).toEqual({ onConflict: "blueprint_id,due_date" });
    const dep = calls.find((c) => c.table === "task_dependencies");
    expect(dep.payload).toEqual({ task_id: "new-1", depends_on_task_id: "resolved-real-id" });
  });
});
