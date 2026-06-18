import { assert, assertEquals } from "@std/assert";
import { buildValveQueueRows } from "@shared/valveQueueRows.ts";

const BASE = Date.UTC(2026, 5, 18, 6, 0, 0); // fixed epoch ms

Deno.test("valve_open with a duration enqueues turn_on + paired turn_off", () => {
  const rows = buildValveQueueRows({
    actionKind: "valve_open",
    runId: "run-1",
    deviceId: "dev-1",
    fireAtMs: BASE,
    durationSeconds: 300,
  });
  assertEquals(rows.length, 2);
  assertEquals(rows[0].command, "turn_on");
  assertEquals(rows[1].command, "turn_off");
  assertEquals(rows[0].fire_at, new Date(BASE).toISOString());
  // turn_off is scheduled exactly `duration` after the open.
  assertEquals(rows[1].fire_at, new Date(BASE + 300_000).toISOString());
  assert(rows.every((r) => r.automation_run_id === "run-1" && r.device_id === "dev-1"));
});

Deno.test("valve_open with no/zero duration leaves it open (single turn_on)", () => {
  for (const d of [null, 0]) {
    const rows = buildValveQueueRows({
      actionKind: "valve_open",
      runId: "run-1",
      deviceId: "dev-1",
      fireAtMs: BASE,
      durationSeconds: d,
    });
    assertEquals(rows.length, 1);
    assertEquals(rows[0].command, "turn_on");
  }
});

Deno.test("valve_close is always a single turn_off (duration ignored)", () => {
  const rows = buildValveQueueRows({
    actionKind: "valve_close",
    runId: "run-1",
    deviceId: "dev-1",
    fireAtMs: BASE,
    durationSeconds: 300,
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].command, "turn_off");
});
