import { assertEquals } from "@std/assert";
import {
  type FreqBlueprintRow,
  resolveDayTasks,
  type PersistedTaskRow,
  type WindowBlueprintRow,
} from "@shared/todayTasks.ts";

const TODAY = "2026-07-23";

const row = (over: Partial<PersistedTaskRow> = {}): PersistedTaskRow => ({
  id: "t1",
  blueprint_id: null,
  title: "Water the beds",
  type: "Watering",
  due_date: TODAY,
  status: "Pending",
  ...over,
});

const windowBp = (over: Partial<WindowBlueprintRow> = {}): WindowBlueprintRow => ({
  id: "bp-harvest",
  title: "Harvest strawberries",
  task_type: "Harvesting",
  start_date: "2026-06-01",
  end_date: "2026-08-31",
  recurrence_kind: "annual",
  recurs_until: null,
  ...over,
});

const freqBp = (over: Partial<FreqBlueprintRow> = {}): FreqBlueprintRow => ({
  id: "bp-water",
  title: "Water the beds",
  task_type: "Watering",
  start_date: "2026-07-01",
  end_date: null,
  frequency_days: 3,
  paused_until: null,
  recurrence_kind: "once",
  recurs_until: null,
  ...over,
});

const base = {
  date: TODAY,
  today: TODAY,
  dayTasks: [] as PersistedTaskRow[],
  overdueTasks: [] as PersistedTaskRow[],
  windowBlueprints: [] as WindowBlueprintRow[],
  freqBlueprints: [] as FreqBlueprintRow[],
  suppressed: new Set<string>(),
};

Deno.test("the day's tasks pass through across statuses; due-today is not overdue", () => {
  const out = resolveDayTasks({
    ...base,
    dayTasks: [row({ id: "todo", status: "Pending" }), row({ id: "done", status: "Completed" })],
  });
  assertEquals(out.map((t) => t.id).sort(), ["done", "todo"]);
  assertEquals(out.find((t) => t.id === "todo")!.overdue, false);
  assertEquals(out.find((t) => t.id === "done")!.status, "Completed");
});

Deno.test("overdue carry tasks are flagged overdue", () => {
  const out = resolveDayTasks({
    ...base,
    overdueTasks: [row({ id: "late", due_date: "2026-07-20", status: "Pending" })],
  });
  assertEquals(out[0].id, "late");
  assertEquals(out[0].overdue, true);
});

Deno.test("a past-due window task is NOT overdue while its window is open", () => {
  const out = resolveDayTasks({
    ...base,
    overdueTasks: [row({ id: "h", due_date: "2026-06-01", status: "Pending", window_end_date: "2026-08-31" })],
  });
  assertEquals(out[0].overdue, false); // window (Aug 31) still open vs today (Jul 23)
});

Deno.test("a past-due window task IS overdue once its window has closed", () => {
  const out = resolveDayTasks({
    ...base,
    overdueTasks: [row({ id: "h", due_date: "2026-05-01", status: "Pending", window_end_date: "2026-06-30" })],
  });
  assertEquals(out[0].overdue, true);
});

Deno.test("a seasonal window containing the viewed date emits one ghost", () => {
  const out = resolveDayTasks({ ...base, windowBlueprints: [windowBp()] });
  assertEquals(out.length, 1);
  assertEquals(out[0].is_ghost, true);
  assertEquals(out[0].id, "ghost-bp-harvest-2026-06-01");
  assertEquals(out[0].window_end_date, "2026-08-31");
});

Deno.test("a materialised window task surfaces (with its status) instead of a ghost", () => {
  const out = resolveDayTasks({
    ...base,
    windowBlueprints: [windowBp()],
    windowTasks: new Map([[
      "bp-harvest|2026-06-01",
      row({ id: "h", blueprint_id: "bp-harvest", due_date: "2026-06-01", status: "Completed", window_end_date: "2026-08-31", type: "Harvesting" }),
    ]]),
  });
  assertEquals(out.length, 1);
  assertEquals(out[0].id, "h"); // the real row, not a ghost
  assertEquals(out[0].is_ghost, false);
  assertEquals(out[0].status, "Completed");
});

Deno.test("a window that does NOT contain the viewed date emits nothing", () => {
  const out = resolveDayTasks({
    ...base,
    windowBlueprints: [windowBp({ start_date: "2026-09-01", end_date: "2026-09-30" })],
  });
  assertEquals(out.length, 0);
});

Deno.test("a non-window blueprint type is ignored", () => {
  const out = resolveDayTasks({ ...base, windowBlueprints: [windowBp({ task_type: "Watering" })] });
  assertEquals(out.length, 0);
});

Deno.test("a non-annual (once) window uses its literal dates", () => {
  const out = resolveDayTasks({
    ...base,
    windowBlueprints: [windowBp({ recurrence_kind: "once", start_date: "2026-07-01", end_date: "2026-07-31" })],
  });
  assertEquals(out.length, 1);
  assertEquals(out[0].is_ghost, true);
});

Deno.test("sort order is overdue → to-do → done", () => {
  const out = resolveDayTasks({
    ...base,
    dayTasks: [row({ id: "done", status: "Completed" }), row({ id: "todo", status: "Pending" })],
    overdueTasks: [row({ id: "late", due_date: "2026-07-20", status: "Pending" })],
  });
  assertEquals(out.map((t) => t.id), ["late", "todo", "done"]);
});

Deno.test("viewing a future day: its tasks show and are not overdue", () => {
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-30",
    today: TODAY,
    dayTasks: [row({ id: "future", due_date: "2026-07-30", status: "Pending" })],
  });
  assertEquals(out[0].id, "future");
  assertEquals(out[0].overdue, false);
});

Deno.test("a frequency ghost is emitted for a future on-grid day the cron hasn't reached", () => {
  // start 2026-07-01, every 3 days → 07-25 is on-grid (24 days on).
  const out = resolveDayTasks({ ...base, date: "2026-07-25", freqBlueprints: [freqBp()] });
  assertEquals(out.length, 1);
  assertEquals(out[0].id, "ghost-bp-water-2026-07-25");
  assertEquals(out[0].is_ghost, true);
  assertEquals(out[0].due_date, "2026-07-25");
  assertEquals(out[0].overdue, false);
});

Deno.test("no frequency ghost on a day that is off the grid", () => {
  // 07-26 is 25 days on → 25 % 3 ≠ 0.
  const out = resolveDayTasks({ ...base, date: "2026-07-26", freqBlueprints: [freqBp()] });
  assertEquals(out.length, 0);
});

Deno.test("a frequency ghost is suppressed when a real row already exists for that day", () => {
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-25",
    freqBlueprints: [freqBp()],
    suppressed: new Set(["bp-water|2026-07-25"]),
  });
  assertEquals(out.length, 0);
});

Deno.test("no frequency ghost is projected for a PAST day (real rows own the past)", () => {
  // 07-19 is on-grid (18 days) but before today → skipped.
  const out = resolveDayTasks({ ...base, date: "2026-07-19", freqBlueprints: [freqBp()] });
  assertEquals(out.length, 0);
});

Deno.test("a paused frequency blueprint emits no ghost for on-grid days inside the pause", () => {
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-25",
    freqBlueprints: [freqBp({ paused_until: "2026-08-01" })],
  });
  assertEquals(out.length, 0);
});

Deno.test("a frequency ghost past the blueprint's end_date is not emitted", () => {
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-25",
    freqBlueprints: [freqBp({ end_date: "2026-07-20" })],
  });
  assertEquals(out.length, 0);
});

Deno.test("an annual frequency routine re-anchors its grid within this year's window", () => {
  // Summer window 06-01..08-31, every 7 days → 07-27 is 56 days on (56 % 7 = 0).
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-27",
    freqBlueprints: [
      freqBp({
        start_date: "2026-06-01",
        end_date: "2026-08-31",
        frequency_days: 7,
        recurrence_kind: "annual",
      }),
    ],
  });
  assertEquals(out.length, 1);
  assertEquals(out[0].id, "ghost-bp-water-2026-07-27");
});

Deno.test("a seasonal WINDOW type is skipped by the frequency pass (window pass owns it)", () => {
  const out = resolveDayTasks({
    ...base,
    date: "2026-07-25",
    freqBlueprints: [freqBp({ task_type: "Pruning", end_date: "2026-08-31" })],
  });
  assertEquals(out.length, 0);
});

// ── Window-covering tasks (the handler's query 1b) ───────────────────────────

Deno.test("legacy per-day pruning rows do NOT pile up — only the canonical window-start row shows", () => {
  // The real bug: a fixed daily-materialisation bug left many completed pruning
  // rows, each backfilled with the season-long window_end_date. The resolver must
  // look up ONLY the (blueprint, windowStart) slot, never every covering row.
  const prune = windowBp({ id: "bp-prune", task_type: "Pruning", start_date: "2026-06-01", end_date: "2026-08-31" });
  const wt = new Map<string, PersistedTaskRow>([
    ["bp-prune|2026-06-01", row({ id: "canon", blueprint_id: "bp-prune", due_date: "2026-06-01", status: "Completed", window_end_date: "2026-08-31", type: "Pruning" })],
    ["bp-prune|2026-07-10", row({ id: "legacy1", blueprint_id: "bp-prune", due_date: "2026-07-10", status: "Completed", window_end_date: "2026-08-31", type: "Pruning" })],
    ["bp-prune|2026-07-15", row({ id: "legacy2", blueprint_id: "bp-prune", due_date: "2026-07-15", status: "Completed", window_end_date: "2026-08-31", type: "Pruning" })],
  ]);
  const out = resolveDayTasks({ ...base, date: TODAY, windowBlueprints: [prune], windowTasks: wt });
  assertEquals(out.length, 1);
  assertEquals(out[0].id, "canon"); // ONLY the window-start row, not the per-day rows
});

Deno.test("a window task on its start day (also a day task) is not duplicated", () => {
  const startDayTask = row({ id: "h", blueprint_id: "bp-harvest", due_date: TODAY, status: "Pending", window_end_date: "2026-08-31", type: "Harvesting" });
  const out = resolveDayTasks({
    ...base,
    date: TODAY,
    dayTasks: [startDayTask], // due == TODAY
    windowBlueprints: [windowBp({ start_date: TODAY, end_date: "2026-08-31", recurrence_kind: "once" })],
    windowTasks: new Map([[`bp-harvest|${TODAY}`, startDayTask]]),
  });
  assertEquals(out.filter((t) => t.id === "h").length, 1); // deduped by id
});
