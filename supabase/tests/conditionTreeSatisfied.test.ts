import { assertEquals } from "@std/assert";
import {
  collectSatisfiedLeaves,
  summariseSatisfied,
  type ConditionNode,
  type LeafNode,
  type WeeklySchedule,
} from "@shared/conditionTree.ts";

const emptySchedule: WeeklySchedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

Deno.test("collectSatisfiedLeaves returns only leaves whose effective value is true", () => {
  const sensor: LeafNode = { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any" };
  const time: LeafNode = { kind: "time", schedule: emptySchedule };
  const tree: ConditionNode = { kind: "group", op: "or", children: [sensor, time] };
  const sat = collectSatisfiedLeaves(tree, (l) => l.kind === "sensor"); // sensor true, time false
  assertEquals(sat.length, 1);
  assertEquals(sat[0].kind, "sensor");
});

Deno.test("a negated leaf counts as satisfied when its raw eval is false", () => {
  const sensor: LeafNode = { kind: "sensor", negate: true, metric: "soil_moisture", comparator: "<", value: 30, agg: "any" };
  const tree: ConditionNode = { kind: "group", op: "and", children: [sensor] };
  assertEquals(collectSatisfiedLeaves(tree, () => false).length, 1); // raw false, negate → true
});

Deno.test("summariseSatisfied builds an English reason from matched leaves", () => {
  const sensor: LeafNode = { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any" };
  const tree: ConditionNode = { kind: "group", op: "and", children: [sensor] };
  const { summary, matched } = summariseSatisfied(tree, () => true);
  assertEquals(matched, ["moisture < 30%"]);
  assertEquals(summary, "moisture < 30%");
});
