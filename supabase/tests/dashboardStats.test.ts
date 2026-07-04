import { assertEquals } from "@std/assert";
import {
  computeDayStrip,
  computeHarvestCounts,
  computeTaskStats,
  type StatTask,
} from "@shared/dashboardStats.ts";

// ISO week: Sun 2026-06-28 → Sat 2026-07-04. Today = Wed 2026-07-01.
const WEEK_START = "2026-06-28";
const WEEK_END = "2026-07-04";
const TODAY = "2026-07-01";
const SUNDAY = "2026-06-28";

function task(overrides: Partial<StatTask> & { id: string }): StatTask {
  return {
    status: "Pending",
    type: "Watering",
    due_date: TODAY,
    ...overrides,
  };
}

// ─── RHO-14: Tasks This Week counts ─────────────────────────────────────────

Deno.test("DASH-STATS-001: prior-week overdue is counted in overdue and priorOverdue", () => {
  const tasks: StatTask[] = [
    task({ id: "old", due_date: "2026-06-10" }),   // overdue from a prior week
    task({ id: "today", due_date: TODAY }),        // pending, this week
  ];
  const s = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(s.overdue, 1);
  assertEquals(s.priorOverdue, 1);
  assertEquals(s.pending, 1);   // only the in-week pending
  assertEquals(s.total, 1);     // total stays week-scoped (prior overdue not in week)
});

Deno.test("DASH-STATS-002: this-week overdue counts but is NOT priorOverdue", () => {
  const tasks: StatTask[] = [
    task({ id: "mon", due_date: "2026-06-29" }),   // overdue but within this week
  ];
  const s = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(s.overdue, 1);
  assertEquals(s.priorOverdue, 0);
  assertEquals(s.total, 1);
});

Deno.test("DASH-STATS-003: completed/skipped are excluded from overdue & pending", () => {
  const tasks: StatTask[] = [
    task({ id: "done", due_date: "2026-06-10", status: "Completed", completed_at: "2026-06-29T09:00:00Z" }),
    task({ id: "skip", due_date: "2026-06-10", status: "Skipped" }),
  ];
  const s = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(s.overdue, 0);
  assertEquals(s.pending, 0);
  assertEquals(s.completedThisWeek, 1); // completed within the week
});

Deno.test("DASH-STATS-004: snoozed-forward task is not overdue and is hidden until the snooze lifts", () => {
  const tasks: StatTask[] = [
    // Due last week, snoozed to Friday → effective due 07-03 (this week).
    task({ id: "snoozed", due_date: "2026-06-25", next_check_at: "2026-07-03" }),
  ];
  const s = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(s.overdue, 0);       // snoozed forward → not overdue
  assertEquals(s.pending, 0);       // hidden from Today until the snooze date
  assertEquals(s.total, 1);         // still belongs to this week (effective due 07-03)
  assertEquals(s.priorOverdue, 0);
});

Deno.test("DASH-STATS-005: active harvest window is not overdue even when due_date is old", () => {
  const tasks: StatTask[] = [
    // Window opened before this week, still open through Fri.
    task({ id: "harv", type: "Harvesting", due_date: "2026-06-20", window_end_date: "2026-07-03" }),
  ];
  const s = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(s.overdue, 0);
  assertEquals(s.pending, 1);
});

// ─── RHO-15: Week Overview day strip ────────────────────────────────────────

Deno.test("DASH-STATS-010: prior-week overdue rolls onto the Sunday bucket", () => {
  const tasks: StatTask[] = [
    task({ id: "old", due_date: "2026-06-10" }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const sunday = strip.find((d) => d.date === SUNDAY)!;
  assertEquals(sunday.overdue, 1);
  assertEquals(sunday.total, 1);
  // No other day should carry it.
  const others = strip.filter((d) => d.date !== SUNDAY);
  assertEquals(others.reduce((n, d) => n + d.overdue, 0), 0);
});

Deno.test("DASH-STATS-011: harvest window spans every in-week day", () => {
  const tasks: StatTask[] = [
    // Window Mon 06-29 → Thu 07-02 → present on 4 in-week days.
    task({ id: "harv", type: "Harvesting", due_date: "2026-06-29", window_end_date: "2026-07-02" }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const daysWithTask = strip.filter((d) => d.total > 0).map((d) => d.date);
  assertEquals(daysWithTask, ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
});

Deno.test("DASH-STATS-012: per-day overdue and pending both surface", () => {
  const tasks: StatTask[] = [
    task({ id: "mon", due_date: "2026-06-29" }),   // past this-week day → overdue on Mon
    task({ id: "fri", due_date: "2026-07-03" }),   // future day → pending on Fri
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(strip.find((d) => d.date === "2026-06-29")!.overdue, 1);
  assertEquals(strip.find((d) => d.date === "2026-07-03")!.pending, 1);
});

// ─── RHO-20: today breakdown — skipped & postponed buckets ──────────────────

Deno.test("DASH-STATS-013: a Skipped task is bucketed as skipped on its due day, not total/pending", () => {
  const tasks: StatTask[] = [task({ id: "s", status: "Skipped", due_date: TODAY })];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const todayBucket = strip.find((d) => d.date === TODAY)!;
  assertEquals(todayBucket.skipped, 1);
  assertEquals(todayBucket.total, 0);
  assertEquals(todayBucket.pending, 0);
  assertEquals(todayBucket.overdue, 0);
});

Deno.test("DASH-STATS-014: a task snoozed forward off today is counted as postponed on today, not pending", () => {
  const tasks: StatTask[] = [
    task({ id: "p", due_date: TODAY, next_check_at: "2026-07-04" }), // snoozed to Sat
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const todayBucket = strip.find((d) => d.date === TODAY)!;
  assertEquals(todayBucket.postponed, 1);
  assertEquals(todayBucket.pending, 0); // snoozed-forward is neither pending…
  assertEquals(todayBucket.overdue, 0); // …nor overdue for today
  assertEquals(todayBucket.total, 0);
});

Deno.test("DASH-STATS-015: a completed task due today stays on-time and out of skipped/postponed", () => {
  const tasks: StatTask[] = [
    task({ id: "c", status: "Completed", due_date: TODAY, completed_at: `${TODAY}T09:00:00Z` }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const todayBucket = strip.find((d) => d.date === TODAY)!;
  assertEquals(todayBucket.completedOnTime, 1);
  assertEquals(todayBucket.skipped, 0);
  assertEquals(todayBucket.postponed, 0);
});

Deno.test("DASH-STATS-016: a task due today NOT snoozed is pending, not postponed", () => {
  const tasks: StatTask[] = [task({ id: "d", due_date: TODAY })];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const todayBucket = strip.find((d) => d.date === TODAY)!;
  assertEquals(todayBucket.pending, 1);
  assertEquals(todayBucket.postponed, 0);
});

// ─── RHO-16: Harvests Due (subject-keyed dedup) ─────────────────────────────

Deno.test("DASH-STATS-020: pre-week-start window overlapping this week counts", () => {
  const tasks: StatTask[] = [
    task({
      id: "harv",
      type: "Harvesting",
      due_date: "2026-06-20",           // window starts before weekStart
      window_end_date: "2026-06-30",    // overlaps the week
      inventory_item_ids: ["p1"],
    }),
  ];
  const c = computeHarvestCounts(tasks, WEEK_START, WEEK_END);
  assertEquals(c.due, 1);
});

Deno.test("DASH-STATS-021: a harvest task with 3 plants counts as 3", () => {
  const tasks: StatTask[] = [
    task({ id: "h", type: "Harvest", due_date: TODAY, inventory_item_ids: ["a", "b", "c"] }),
  ];
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 3);
});

Deno.test("DASH-STATS-022: same plant across two harvest tasks counts once", () => {
  const tasks: StatTask[] = [
    task({ id: "h1", type: "Harvesting", due_date: TODAY, inventory_item_ids: ["p1"] }),
    task({ id: "h2", type: "Harvesting", due_date: "2026-07-02", inventory_item_ids: ["p1"] }),
  ];
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 1);
});

Deno.test("DASH-STATS-023: an unlinked harvest counts as 1", () => {
  const tasks: StatTask[] = [
    task({ id: "h", type: "Harvesting", due_date: TODAY, inventory_item_ids: null }),
  ];
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 1);
});

Deno.test("DASH-STATS-024: recurring unlinked harvest (same blueprint, two rows) counts once", () => {
  const tasks: StatTask[] = [
    task({ id: "i1", type: "Harvesting", due_date: TODAY, inventory_item_ids: [], blueprint_id: "bp1" }),
    task({ id: "i2", type: "Harvesting", due_date: "2026-07-02", inventory_item_ids: [], blueprint_id: "bp1" }),
  ];
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 1);
});

Deno.test("DASH-STATS-025: Completed/Skipped harvests excluded from due, counted in completed", () => {
  const tasks: StatTask[] = [
    task({ id: "done", type: "Harvesting", due_date: TODAY, status: "Completed", inventory_item_ids: ["p1"] }),
    task({ id: "skip", type: "Harvesting", due_date: TODAY, status: "Skipped", inventory_item_ids: ["p2"] }),
    task({ id: "open", type: "Harvesting", due_date: TODAY, inventory_item_ids: ["p3"] }),
  ];
  const c = computeHarvestCounts(tasks, WEEK_START, WEEK_END);
  assertEquals(c.due, 1);       // only the open one
  assertEquals(c.completed, 1); // only the completed one (skipped excluded)
});

Deno.test("DASH-STATS-026: a plant in both a linked and an unlinked harvest dedups distinctly", () => {
  const tasks: StatTask[] = [
    task({ id: "linked", type: "Harvesting", due_date: TODAY, inventory_item_ids: ["p1"] }),
    task({ id: "unlinked", type: "Harvesting", due_date: TODAY, inventory_item_ids: null, blueprint_id: "bpX" }),
  ];
  // plant:p1 + harvest:bpX = 2 distinct subjects (prefixes never collide).
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 2);
});

Deno.test("DASH-STATS-027: a harvest window entirely before the week does not count", () => {
  const tasks: StatTask[] = [
    task({ id: "old", type: "Harvesting", due_date: "2026-06-10", window_end_date: "2026-06-20", inventory_item_ids: ["p1"] }),
  ];
  assertEquals(computeHarvestCounts(tasks, WEEK_START, WEEK_END).due, 0);
});

// ─── Bug-audit 2026-07-02 regressions ────────────────────────────────────────

Deno.test("DASH-STATS-028: closed pre-week harvest window straddling weekStart counts once, not on Sunday roll-up AND in-window days", () => {
  // Window Fri 2026-06-26 → Mon 2026-06-29, closed unactioned (today = Wed).
  // In-window days inside this week: Sun 28, Mon 29. Previously this counted
  // on Sunday's roll-up AND on both in-window days (3 overdue for 1 harvest).
  const tasks: StatTask[] = [
    task({
      id: "h1",
      type: "Harvesting",
      due_date: "2026-06-26",
      window_end_date: "2026-06-29",
    }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const totalOverdue = strip.reduce((n, d) => n + d.overdue, 0);
  assertEquals(totalOverdue, 2); // Sun + Mon in-window days only — no roll-up double
  const sunday = strip.find((d) => d.date === SUNDAY)!;
  assertEquals(sunday.overdue, 1); // via the window branch, not the roll-up too
});

Deno.test("DASH-STATS-029: window closed entirely before the week still rolls onto Sunday", () => {
  const tasks: StatTask[] = [
    task({
      id: "h2",
      type: "Harvesting",
      due_date: "2026-06-20",
      window_end_date: "2026-06-25", // fully pre-week, closed unactioned
    }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  const sunday = strip.find((d) => d.date === SUNDAY)!;
  assertEquals(sunday.overdue, 1);
  assertEquals(strip.reduce((n, d) => n + d.overdue, 0), 1);
});

Deno.test("DASH-STATS-030: harvest completed mid-window is on-time for every in-window day", () => {
  // Window Sun 28 → Fri 2026-07-03, completed Tue 30. Previously Sun/Mon
  // (days before the completion date) showed 'completedLate' pips.
  const tasks: StatTask[] = [
    task({
      id: "h3",
      type: "Harvesting",
      due_date: "2026-06-28",
      window_end_date: "2026-07-03",
      status: "Completed",
      completed_at: "2026-06-30T10:00:00Z",
    }),
  ];
  const strip = computeDayStrip(tasks, WEEK_START, WEEK_END, TODAY);
  assertEquals(strip.reduce((n, d) => n + d.completedLate, 0), 0);
  assertEquals(strip.reduce((n, d) => n + d.completedOnTime, 0) > 0, true);
});

Deno.test("DASH-STATS-031: tzOffsetMinutes buckets an evening completion onto the LOCAL day", () => {
  // Sat 2026-07-04 21:00 in UTC-5 = Sun 2026-07-05 02:00 UTC. With the
  // client's offset (300) the completion belongs to Saturday — inside the
  // week. Without it, the UTC date fell into next week and was dropped.
  const tasks: StatTask[] = [
    task({
      id: "t-late",
      due_date: "2026-07-04",
      status: "Completed",
      completed_at: "2026-07-05T02:00:00Z",
    }),
  ];
  const withOffset = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY, 300);
  assertEquals(withOffset.completedThisWeek, 1);
  const withoutOffset = computeTaskStats(tasks, WEEK_START, WEEK_END, TODAY, 0);
  assertEquals(withoutOffset.completedThisWeek, 0);
});
