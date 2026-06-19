import { assert } from "@std/assert";
import {
  treeHasTimeTrigger,
  treeHasSensorTrigger,
  treeAffectedByDevice,
} from "@shared/automationCandidates.ts";
import type { ConditionNode, WeeklySchedule } from "@shared/conditionTree.ts";

const emptySchedule = (): WeeklySchedule => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

const sensorExplicit = (ids: string[]): ConditionNode =>
  ({ kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any", sensorIds: ids });
const sensorAreaScoped = (areaId: string | null): ConditionNode =>
  ({ kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any", sensorIds: [], areaId });
const weatherLeaf: ConditionNode = { kind: "weather", type: "rain_forecast", thresholdMm: 5 };
const timeLeaf: ConditionNode = { kind: "time", schedule: (() => { const s = emptySchedule(); s.mon = [{ start: "08:00", end: "20:00" }]; return s; })() };
const dateLeaf: ConditionNode = { kind: "date_range", from: "06-01", to: "08-31" };
const taskLeaf: ConditionNode = { kind: "task_due", blueprintIds: ["b1"] };

const group = (children: ConditionNode[]): ConditionNode => ({ kind: "group", op: "and", children });

// ── treeHasTimeTrigger ───────────────────────────────────────────────────────

Deno.test("treeHasTimeTrigger — time / date / weather count; sensor / task don't", () => {
  assert(treeHasTimeTrigger(group([timeLeaf])));
  assert(treeHasTimeTrigger(group([dateLeaf])));
  assert(treeHasTimeTrigger(group([weatherLeaf])));
  assert(treeHasTimeTrigger(group([sensorExplicit(["d1"]), weatherLeaf])));   // mixed
  assert(!treeHasTimeTrigger(group([sensorExplicit(["d1"])])));
  assert(!treeHasTimeTrigger(group([taskLeaf])));
});

// ── treeHasSensorTrigger ─────────────────────────────────────────────────────

Deno.test("treeHasSensorTrigger — only sensor leaves", () => {
  assert(treeHasSensorTrigger(group([sensorExplicit(["d1"])])));
  assert(treeHasSensorTrigger(group([{ kind: "group", op: "or", children: [weatherLeaf, sensorAreaScoped("a1")] }])));
  assert(!treeHasSensorTrigger(group([weatherLeaf, timeLeaf])));
});

// ── treeAffectedByDevice ─────────────────────────────────────────────────────

Deno.test("treeAffectedByDevice — explicit sensor id match", () => {
  const tree = group([sensorExplicit(["d1", "d2"])]);
  assert(treeAffectedByDevice(tree, "d2", "areaX", "areaY"));
  assert(!treeAffectedByDevice(tree, "d9", "areaX", "areaY"));
});

Deno.test("treeAffectedByDevice — area-scoped leaf matches device's area (leaf area)", () => {
  const tree = group([sensorAreaScoped("areaX")]);
  assert(treeAffectedByDevice(tree, "d1", "areaX", null));     // device in areaX → match
  assert(!treeAffectedByDevice(tree, "d1", "areaY", null));    // device elsewhere → no
});

Deno.test("treeAffectedByDevice — area-scoped leaf falls back to automation area", () => {
  const tree = group([sensorAreaScoped(null)]);
  assert(treeAffectedByDevice(tree, "d1", "areaX", "areaX"));  // automation area = device area
  assert(!treeAffectedByDevice(tree, "d1", "areaX", "areaZ"));
});

Deno.test("treeAffectedByDevice — non-sensor trees never match", () => {
  assert(!treeAffectedByDevice(group([weatherLeaf, timeLeaf]), "d1", "areaX", "areaX"));
});

Deno.test("treeAffectedByDevice — nested OR group, explicit id deep inside", () => {
  const tree = group([{ kind: "group", op: "or", children: [weatherLeaf, sensorExplicit(["d3"])] }]);
  assert(treeAffectedByDevice(tree, "d3", "areaX", null));
  assert(!treeAffectedByDevice(tree, "d4", "areaX", null));
});
