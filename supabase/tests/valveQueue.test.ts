import { assert, assertEquals } from "@std/assert";
import { encryptCredentials } from "@shared/integrations/encrypt.ts";
import { drainValveQueue } from "@shared/valveQueue.ts";

// 32-byte (all-zero) key, base64 — enough for encrypt/decrypt to round-trip.
Deno.env.set("INTEGRATION_ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32))));

/**
 * Minimal chainable Supabase mock. `rows` supplies canned SELECT results per
 * table; every UPDATE / INSERT is recorded in `writes`, every call in `ops`.
 */
function makeDb(rows: Record<string, unknown[]>) {
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
  const ops: Array<{ table: string; op: string; filters: unknown[] }> = [];

  function builder(table: string) {
    const state = { op: "select", single: false, payload: null as unknown, filters: [] as unknown[] };
    const resolve = () => {
      if (state.op === "update") {
        writes.push({ table, op: "update", payload: state.payload });
        ops.push({ table, op: "update", filters: state.filters });
        return Promise.resolve({ data: null, error: null });
      }
      if (state.op === "insert") {
        writes.push({ table, op: "insert", payload: state.payload });
        ops.push({ table, op: "insert", filters: state.filters });
        return Promise.resolve({ data: null, error: null });
      }
      ops.push({ table, op: "select", filters: state.filters });
      const data = rows[table] ?? [];
      return Promise.resolve({ data: state.single ? (data[0] ?? null) : data, error: null });
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select() { state.op = "select"; return b; },
      update(payload: unknown) { state.op = "update"; state.payload = payload; return b; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return resolve(); },
      eq(col: string, val: unknown) { state.filters.push(["eq", col, val]); return b; },
      lte(col: string, val: unknown) { state.filters.push(["lte", col, val]); return b; },
      order() { return b; },
      single() { state.single = true; return resolve(); },
      maybeSingle() { state.single = true; return resolve(); },
      // deno-lint-ignore no-explicit-any
      then(onF: any, onR: any) { return resolve().then(onF, onR); },
    };
    return b;
  }

  return { db: { from: (t: string) => builder(t) }, writes, ops };
}

function stubFetch(eweLinkError: number) {
  const orig = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (() => Promise.resolve({ json: () => Promise.resolve({ error: eweLinkError }) })) as any;
  return () => { globalThis.fetch = orig; };
}

async function queueRows() {
  return {
    automation_valve_queue: [{ id: "Q1", device_id: "D1", automation_run_id: "R1", command: "turn_on" }],
    automation_runs: [{ automation_id: "A1", home_id: "H1", triggered_by: "schedule" }],
    automations: [{ duration_seconds: 30, retry_on_failure: false, name: "Morning water" }],
    devices: [{ id: "D1", name: "Valve", external_device_id: "X1", metadata: {}, integration_id: "I1" }],
    integrations: [{ credentials_encrypted: await encryptCredentials({ accessToken: "tok" }), region: "eu" }],
    automation_actions: [] as unknown[], // no receipt action → sendReceipt is a no-op
    valve_events: [],
  };
}

Deno.test("drainValveQueue — empty queue is a no-op", async () => {
  const { db, writes } = makeDb({ automation_valve_queue: [] });
  await drainValveQueue(db);
  assertEquals(writes.length, 0);
});

Deno.test("drainValveQueue — { runId } scopes the queue query to that run", async () => {
  const { db, ops } = makeDb({ automation_valve_queue: [] });
  await drainValveQueue(db, { runId: "RUN-42" });
  const sel = ops.find((o) => o.table === "automation_valve_queue" && o.op === "select");
  assert(sel, "expected a select on automation_valve_queue");
  const scoped = (sel!.filters as unknown[][]).some((f) => f[0] === "eq" && f[1] === "automation_run_id" && f[2] === "RUN-42");
  assert(scoped, "queue select should filter on automation_run_id when runId is given");
});

Deno.test("drainValveQueue — successful turn_on marks fired + logs a valve_event", async () => {
  const restore = stubFetch(0); // eWeLink success
  try {
    const { db, writes } = makeDb(await queueRows());
    await drainValveQueue(db);
    const queueUpdate = writes.find((w) => w.table === "automation_valve_queue" && w.op === "update");
    assert(queueUpdate, "queue entry should be updated");
    assertEquals((queueUpdate!.payload as { status: string }).status, "fired");
    assert(writes.some((w) => w.table === "valve_events" && w.op === "insert"), "should log a valve_event");
  } finally { restore(); }
});

Deno.test("drainValveQueue — failed turn_on marks failed (no valve_event)", async () => {
  const restore = stubFetch(1); // eWeLink failure
  try {
    const { db, writes } = makeDb(await queueRows());
    await drainValveQueue(db);
    const queueUpdate = writes.find((w) => w.table === "automation_valve_queue" && w.op === "update");
    assert(queueUpdate, "queue entry should be updated");
    assertEquals((queueUpdate!.payload as { status: string }).status, "failed");
    assert(!writes.some((w) => w.table === "valve_events"), "no valve_event on failure");
  } finally { restore(); }
});
