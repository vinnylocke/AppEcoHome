import { assert, assertEquals } from "@std/assert";
import { encryptCredentials } from "@shared/integrations/encrypt.ts";
import { drainValveQueue } from "@shared/valveQueue.ts";

// 32-byte (all-zero) key, base64 — enough for encrypt/decrypt to round-trip.
Deno.env.set("INTEGRATION_ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32))));

/**
 * Minimal chainable Supabase mock. `rows` supplies canned SELECT results per
 * table; `opts.claim` is what an `update(...).select()` (the claim-lock) returns
 * (default a single claimed row; pass `[]` to simulate "already claimed"). Every
 * UPDATE / INSERT is recorded in `writes`, every call in `ops`.
 */
function makeDb(rows: Record<string, unknown[]>, opts: { claim?: unknown[] } = {}) {
  const claim = opts.claim ?? [{ id: "claimed" }];
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
  const ops: Array<{ table: string; op: string; filters: unknown[] }> = [];

  function builder(table: string) {
    const state = { op: "select", single: false, returning: false, payload: null as unknown, filters: [] as unknown[] };
    const resolve = () => {
      if (state.op === "update") {
        writes.push({ table, op: "update", payload: state.payload });
        ops.push({ table, op: "update", filters: state.filters });
        return Promise.resolve({ data: state.returning ? claim : null, error: null });
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
      select() { if (state.op === "update") state.returning = true; else state.op = "select"; return b; },
      update(payload: unknown) { state.op = "update"; state.payload = payload; return b; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return resolve(); },
      eq(col: string, val: unknown) { state.filters.push(["eq", col, val]); return b; },
      lte(col: string, val: unknown) { state.filters.push(["lte", col, val]); return b; },
      order() { return b; },
      limit() { return b; },
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
  const calls: Array<{ url: string; body: unknown }> = [];
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({ json: () => Promise.resolve({ error: eweLinkError }) });
  }) as any;
  return { restore: () => { globalThis.fetch = orig; }, calls };
}

async function queueRows() {
  return {
    automation_valve_queue: [{ id: "Q1", device_id: "D1", automation_run_id: "R1", command: "turn_on" }],
    automation_runs: [{ automation_id: "A1", home_id: "H1", triggered_by: "schedule" }],
    automations: [{ duration_seconds: 1800, retry_on_failure: false, name: "Morning water" }],
    devices: [{ id: "D1", name: "Valve", external_device_id: "X1", metadata: { direct_device_id: "X1" }, integration_id: "I1" }],
    integrations: [{ credentials_encrypted: await encryptCredentials({ accessToken: "tok" }), region: "eu" }],
    automation_actions: [] as unknown[],
    valve_events: [],
  };
}

// The stale-claim sweep (bug-audit-2026-07-02 §9.2) runs two unconditional
// UPDATEs at the top of every drain; tests about per-entry outcomes must
// not confuse those recovery writes with entry status changes.
const SWEEP_ERROR = "Stale firing claim — drain died mid-fire";
const isSweepWrite = (w: { table: string; op: string; payload?: unknown }) => {
  if (w.table !== "automation_valve_queue" || w.op !== "update") return false;
  const p = w.payload as { status?: string; error_message?: string } | null;
  if (!p) return false;
  if (p.error_message === SWEEP_ERROR) return true;
  return p.status === "pending" && Object.keys(p).length === 1;
};

const valveUpdate = (writes: Array<{ table: string; op: string; payload?: unknown }>, status: string) =>
  writes.find((w) => !isSweepWrite(w) && w.table === "automation_valve_queue" && w.op === "update" && (w.payload as { status?: string })?.status === status);

Deno.test("drainValveQueue — empty queue is a no-op (beyond the stale-claim sweep)", async () => {
  const { db, writes } = makeDb({ automation_valve_queue: [] });
  await drainValveQueue(db);
  assertEquals(writes.filter((w) => !isSweepWrite(w)).length, 0);
});

Deno.test("drainValveQueue — stale 'firing' rows are swept: turn_off retries, turn_on dead-letters", async () => {
  const { db, ops } = makeDb({ automation_valve_queue: [] });
  await drainValveQueue(db);
  const sweepOps = ops.filter((o) =>
    o.table === "automation_valve_queue" && o.op === "update" &&
    (o.filters as unknown[][]).some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "firing")
  );
  assertEquals(sweepOps.length, 2, "one sweep per command kind");
  const commandOf = (o: { filters: unknown[] }) =>
    (o.filters as unknown[][]).find((f) => f[1] === "command")?.[2];
  assert(sweepOps.some((o) => commandOf(o) === "turn_off"), "turn_off sweep present");
  assert(sweepOps.some((o) => commandOf(o) === "turn_on"), "turn_on sweep present");
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
  const { restore } = stubFetch(0);
  try {
    const { db, writes } = makeDb(await queueRows());
    await drainValveQueue(db);
    assert(valveUpdate(writes, "fired"), "queue entry should be marked fired");
    assert(writes.some((w) => w.table === "valve_events" && w.op === "insert"), "should log a valve_event");
  } finally { restore(); }
});

Deno.test("drainValveQueue — failed turn_on marks failed (no valve_event)", async () => {
  const { restore } = stubFetch(1);
  try {
    const { db, writes } = makeDb(await queueRows());
    await drainValveQueue(db);
    assert(valveUpdate(writes, "failed"), "queue entry should be marked failed");
    assert(!writes.some((w) => w.table === "valve_events"), "no valve_event on failure");
  } finally { restore(); }
});

Deno.test("drainValveQueue — claim-lock: a lost claim is skipped (no fire)", async () => {
  const { restore, calls } = stubFetch(0);
  try {
    const { db, writes } = makeDb(await queueRows(), { claim: [] }); // another drain already took it
    await drainValveQueue(db);
    assertEquals(calls.length, 0, "must not hit the device for a lost claim");
    assert(!valveUpdate(writes, "fired") && !valveUpdate(writes, "failed"), "no fired/failed when claim is lost");
    assert(!writes.some((w) => w.table === "valve_events"), "no valve_event when claim is lost");
  } finally { restore(); }
});

Deno.test("drainValveQueue — countdown uses the action's valve_duration_seconds, not the 1800 default", async () => {
  const { restore } = stubFetch(0);
  try {
    const rows = await queueRows();
    rows.automation_actions = [{ valve_duration_seconds: 300 }]; // automation set 5 min; automations.duration_seconds is 1800
    const { db, writes } = makeDb(rows);
    await drainValveQueue(db);
    const ev = writes.find((w) => w.table === "valve_events" && w.op === "insert");
    assert(ev, "should log a valve_event");
    assertEquals((ev!.payload as { duration_seconds: number }).duration_seconds, 300);
  } finally { restore(); }
});
