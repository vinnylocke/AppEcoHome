import { assertEquals } from "@std/assert";
import { fanoutActions } from "@shared/fanoutActions.ts";

// Mock supabase client: per-table FIFO queues of responses. Every chain method
// returns the same thenable; awaiting it pops the next queued response for the
// table. Updates are recorded so we can assert which task ids were completed.

interface Call { table: string; filters: Record<string, unknown>; kind: "select" | "update"; payload?: unknown }

function makeDb(queues: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, filters: {}, kind: "select" };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "order", "maybeSingle", "single"]) chain[m] = self;
      chain.update = (payload: unknown) => { call.kind = "update"; call.payload = payload; return chain; };
      chain.eq = (col: string, val: unknown) => { call.filters[`eq:${col}`] = val; return chain; };
      chain.lte = (col: string, val: unknown) => { call.filters[`lte:${col}`] = val; return chain; };
      chain.in = (col: string, val: unknown) => { call.filters[`in:${col}`] = val; return chain; };
      chain.is = (col: string, val: unknown) => { call.filters[`is:${col}`] = val; return chain; };
      chain.not = (col: string, op: string, val: unknown) => { call.filters[`not:${col}`] = `${op}:${val}`; return chain; };
      chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        calls.push(call);
        const next = (queues[table] ?? []).length > 0 ? (queues[table] as unknown[]).shift() : { data: null, error: null };
        return Promise.resolve(next).then(onF, onR);
      };
      return chain;
    },
    _calls: calls,
  };
  return db;
}

const AUTOMATION = { id: "auto-1", home_id: "home-1", name: "Morning water" };
const NOW = new Date("2026-07-10T07:00:00Z");

Deno.test("FAN-WX-001: complete_task also completes weather tasks in the blueprint's area", async () => {
  const db = makeDb({
    automation_actions: [{
      data: [{ id: "a1", action_kind: "complete_task", notification_title: null, notification_body: null, target_device_id: null, target_blueprint_id: "bp-1", valve_duration_seconds: null, ord: 0 }],
    }],
    tasks: [
      { data: [{ id: "t-bp", title: "Water bed", blueprint_id: "bp-1" }] }, // blueprint-keyed dueTasks
      { data: null, error: null },                                          // update t-bp
      { data: [{ id: "t-wx", title: "Extra watering — Raised Bed A" }] },   // weather tasks select
      { data: null, error: null },                                          // update t-wx
    ],
    task_blueprints: [
      { data: { task_type: "Watering", area_id: "area-1" } },               // bpTarget lookup
    ],
  });

  const res = await fanoutActions(db, AUTOMATION, "run-1", NOW);

  // Both the blueprint task AND the weather task completed.
  assertEquals(res.tasks_completed.length, 2);
  const updates = db._calls.filter((c) => c.table === "tasks" && c.kind === "update");
  assertEquals(updates.length, 2);
  assertEquals(updates.map((u) => u.filters["eq:id"]).sort(), ["t-bp", "t-wx"]);
  // Every completion is stamped as automation-completed.
  for (const u of updates) {
    assertEquals((u.payload as { auto_completed_reason: string }).auto_completed_reason, "automation");
  }
  // The weather select was standalone-only (blueprint_id IS NULL, key NOT NULL, right area/type).
  const wxSelect = db._calls.find((c) => c.table === "tasks" && c.filters["is:blueprint_id"] === null && "not:weather_event_key" in c.filters)!;
  assertEquals(wxSelect.filters["eq:area_id"], "area-1");
  assertEquals(wxSelect.filters["eq:type"], "Watering");
  assertEquals(wxSelect.filters["eq:home_id"], "home-1");
});

Deno.test("FAN-WX-002: no weather sweep when the blueprint has no area (nothing to match on)", async () => {
  const db = makeDb({
    automation_actions: [{
      data: [{ id: "a1", action_kind: "complete_task", notification_title: null, notification_body: null, target_device_id: null, target_blueprint_id: "bp-1", valve_duration_seconds: null, ord: 0 }],
    }],
    tasks: [
      { data: [] },                                       // no blueprint-keyed dueTasks
    ],
    task_blueprints: [
      { data: { task_type: "Watering", area_id: null } }, // area-less blueprint
    ],
  });

  const res = await fanoutActions(db, AUTOMATION, "run-1", NOW);
  assertEquals(res.tasks_completed.length, 0);
  // Only ONE tasks query ran (the blueprint-keyed one) — no weather select.
  const taskSelects = db._calls.filter((c) => c.table === "tasks" && c.kind === "select");
  assertEquals(taskSelects.length, 1);
});
