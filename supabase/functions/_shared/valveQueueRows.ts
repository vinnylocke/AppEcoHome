// Builds the `automation_valve_queue` rows for a single valve action.
//
// A `valve_open` with a duration MUST also enqueue the paired `turn_off`,
// otherwise the valve stays open forever — the "Drain Valve Queue" cron only
// fires what's already in the queue, it doesn't infer the close. The legacy
// scheduled runner did this; the condition engine dropped it (the bug).

export interface ValveQueueRow {
  automation_run_id: string;
  device_id: string;
  fire_at: string; // ISO
  command: "turn_on" | "turn_off";
}

export function buildValveQueueRows(args: {
  actionKind: "valve_open" | "valve_close";
  runId: string;
  deviceId: string;
  /** Base fire time (ms epoch) — already staggered by the caller. */
  fireAtMs: number;
  /** valve_open auto-close delay; null/0 = leave open (no paired close). */
  durationSeconds: number | null;
}): ValveQueueRow[] {
  const { actionKind, runId, deviceId, fireAtMs, durationSeconds } = args;
  const command = actionKind === "valve_open" ? "turn_on" : "turn_off";

  const rows: ValveQueueRow[] = [
    {
      automation_run_id: runId,
      device_id: deviceId,
      fire_at: new Date(fireAtMs).toISOString(),
      command,
    },
  ];

  const dur = Number(durationSeconds ?? 0);
  if (command === "turn_on" && dur > 0) {
    rows.push({
      automation_run_id: runId,
      device_id: deviceId,
      fire_at: new Date(fireAtMs + dur * 1000).toISOString(),
      command: "turn_off",
    });
  }

  return rows;
}
