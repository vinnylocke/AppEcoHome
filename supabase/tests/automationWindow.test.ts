import { assert } from "@std/assert";
import {
  treeHasOwnSchedule,
  isWithinWindow,
  defaultWindowOpen,
  type DefaultWindow,
} from "@shared/automationWindow.ts";
import type { ConditionNode, WeeklySchedule } from "@shared/conditionTree.ts";

const emptySchedule = (): WeeklySchedule => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
const sensorLeaf: ConditionNode = { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any" };
const timeLeaf: ConditionNode = { kind: "time", schedule: (() => { const s = emptySchedule(); s.mon = [{ start: "06:00", end: "09:00" }]; return s; })() };
const dateLeaf: ConditionNode = { kind: "date_range", from: "06-01", to: "08-31" };

const window: DefaultWindow = { start: "08:00", end: "20:00", enabled: true };

// ── treeHasOwnSchedule ───────────────────────────────────────────────────────

Deno.test("treeHasOwnSchedule — detects time / date_range leaves at any depth", () => {
  assert(!treeHasOwnSchedule({ kind: "group", op: "and", children: [sensorLeaf] }));
  assert(treeHasOwnSchedule({ kind: "group", op: "and", children: [sensorLeaf, timeLeaf] }));
  assert(treeHasOwnSchedule({ kind: "group", op: "and", children: [{ kind: "group", op: "or", children: [dateLeaf] }] }));
  assert(treeHasOwnSchedule(timeLeaf));
});

// ── isWithinWindow ───────────────────────────────────────────────────────────

Deno.test("isWithinWindow — daytime window (UTC) inside / outside", () => {
  assert(isWithinWindow(new Date("2026-06-15T10:00:00Z"), "08:00", "20:00", "UTC"));
  assert(!isWithinWindow(new Date("2026-06-15T22:00:00Z"), "08:00", "20:00", "UTC"));
  assert(!isWithinWindow(new Date("2026-06-15T03:00:00Z"), "08:00", "20:00", "UTC"));
});

Deno.test("isWithinWindow — accepts HH:MM:SS (Postgres time) form", () => {
  assert(isWithinWindow(new Date("2026-06-15T10:00:00Z"), "08:00:00", "20:00:00", "UTC"));
});

Deno.test("isWithinWindow — overnight window wraps midnight", () => {
  assert(isWithinWindow(new Date("2026-06-15T23:00:00Z"), "21:00", "06:00", "UTC"));
  assert(isWithinWindow(new Date("2026-06-15T05:00:00Z"), "21:00", "06:00", "UTC"));
  assert(!isWithinWindow(new Date("2026-06-15T12:00:00Z"), "21:00", "06:00", "UTC"));
});

Deno.test("isWithinWindow — zero-length window = always open", () => {
  assert(isWithinWindow(new Date("2026-06-15T03:00:00Z"), "08:00", "08:00", "UTC"));
});

Deno.test("isWithinWindow — timezone shifts the local hour", () => {
  // 02:00 UTC = 21:00 previous day in New York (UTC-5) → outside an 08:00-20:00 window.
  assert(!isWithinWindow(new Date("2026-06-15T02:00:00Z"), "08:00", "20:00", "America/New_York"));
  // 14:00 UTC = 10:00 New York → inside.
  assert(isWithinWindow(new Date("2026-06-15T14:00:00Z"), "08:00", "20:00", "America/New_York"));
});

// ── defaultWindowOpen ────────────────────────────────────────────────────────

Deno.test("defaultWindowOpen — disabled window never gates", () => {
  const off: DefaultWindow = { ...window, enabled: false };
  assert(defaultWindowOpen({ kind: "group", op: "and", children: [sensorLeaf] }, off, new Date("2026-06-15T03:00:00Z"), "UTC"));
  assert(defaultWindowOpen({ kind: "group", op: "and", children: [sensorLeaf] }, null, new Date("2026-06-15T03:00:00Z"), "UTC"));
});

Deno.test("defaultWindowOpen — tree with own time/date condition bypasses the window", () => {
  // Outside 08:00-20:00 but the tree has its own time leaf → still open.
  assert(defaultWindowOpen({ kind: "group", op: "and", children: [sensorLeaf, timeLeaf] }, window, new Date("2026-06-15T03:00:00Z"), "UTC"));
});

Deno.test("defaultWindowOpen — sensor-only automation is gated to the window", () => {
  const tree: ConditionNode = { kind: "group", op: "and", children: [sensorLeaf] };
  assert(defaultWindowOpen(tree, window, new Date("2026-06-15T10:00:00Z"), "UTC"));   // inside → fire
  assert(!defaultWindowOpen(tree, window, new Date("2026-06-15T03:00:00Z"), "UTC"));  // 3am → blocked
});
