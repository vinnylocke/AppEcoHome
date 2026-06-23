// Summarises an `automation_runs` row for the history list.
//
// The shape of `devices_triggered` differs by engine:
//   - condition engine (`evaluate-automations`) writes an OBJECT
//     `{ notifications, valves_queued }`
//   - the legacy scheduled runner wrote an ARRAY of per-device results
//     `[{ device_id, name, success, queued }]`
// The history view used to call `.filter()` on it assuming an array, which
// threw on the object shape and crashed the drill-down. This helper tolerates
// both and returns plain-English chips. Pure + tested.

interface DeviceResult {
  device_id?: string;
  name?: string;
  success?: boolean;
  queued?: boolean;
}
interface TaskResult {
  blueprint_id?: string;
  title?: string;
  already_done?: boolean;
}
interface ObjectShape {
  members_alerted?: number;
  notifications?: number; // legacy — pre-receipt rows stored a per-member count here
  valves_queued?: number;
}

export interface RunLike {
  devices_triggered?: DeviceResult[] | ObjectShape | null;
  tasks_completed?: TaskResult[] | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

export function summariseAutomationRun(run: RunLike): string[] {
  const parts: string[] = [];
  const dt = run.devices_triggered;

  if (Array.isArray(dt)) {
    const fired = dt.filter((d) => d?.success && !d?.queued).length;
    const queued = dt.filter((d) => d?.queued).length;
    if (fired > 0) parts.push(plural(fired, "valve") + " fired");
    if (queued > 0) parts.push(plural(queued, "valve") + " queued");
  } else if (dt && typeof dt === "object") {
    const valves = Number(dt.valves_queued ?? 0);
    // `members_alerted` (Automation Receipt) supersedes the legacy `notifications`
    // count — both were always per-member, so "N members alerted" reads correctly
    // for old rows too.
    const alerted = Number(dt.members_alerted ?? dt.notifications ?? 0);
    if (valves > 0) parts.push(plural(valves, "valve") + " triggered");
    if (alerted > 0) parts.push(plural(alerted, "member") + " alerted");
  }

  const tasks = Array.isArray(run.tasks_completed)
    ? run.tasks_completed.filter((t) => t && !t.already_done).length
    : 0;
  if (tasks > 0) parts.push(plural(tasks, "task") + " completed");

  return parts;
}
