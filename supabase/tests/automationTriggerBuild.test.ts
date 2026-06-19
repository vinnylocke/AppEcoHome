import { assertEquals, assertThrows } from "@std/assert";
import {
  buildTriggerTree,
  buildActions,
  AutomationBuildError,
  treeReferencedIds,
  actionDeviceIds,
} from "@shared/automationTriggerBuild.ts";

Deno.test("buildTriggerTree — nested AND/OR with sensor + weather", () => {
  const tree = buildTriggerTree({
    op: "or",
    conditions: [
      {
        kind: "group", op: "and", conditions: [
          { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, sensor_device_ids: ["d1", "d2"] },
          { kind: "weather", type: "rain_forecast", negate: true, threshold_mm: 5 },
        ],
      },
      { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 18, area_id: "a1" },
    ],
  });
  assertEquals(tree.kind, "group");
  // deno-lint-ignore no-explicit-any
  const t = tree as any;
  assertEquals(t.op, "or");
  assertEquals(t.children.length, 2);
  assertEquals(t.children[0].kind, "group");
  assertEquals(t.children[0].children[0].metric, "soil_moisture");
  assertEquals(t.children[0].children[0].agg, "any"); // default applied
  assertEquals(t.children[0].children[0].sensorIds, ["d1", "d2"]);
  assertEquals(t.children[0].children[1].negate, true);
  assertEquals(t.children[1].areaId, "a1");
});

Deno.test("buildTriggerTree — time leaf builds a weekly schedule", () => {
  const tree = buildTriggerTree({ op: "and", conditions: [{ kind: "time", days: ["mon", "wed"], start: "08:00", end: "20:00" }] });
  // deno-lint-ignore no-explicit-any
  const leaf = (tree as any).children[0];
  assertEquals(leaf.kind, "time");
  assertEquals(leaf.schedule.mon, [{ start: "08:00", end: "20:00" }]);
  assertEquals(leaf.schedule.tue, []);
  assertEquals(leaf.schedule.wed, [{ start: "08:00", end: "20:00" }]);
});

Deno.test("buildTriggerTree — rejects malformed input", () => {
  // deno-lint-ignore no-explicit-any
  const bad = (x: any) => assertThrows(() => buildTriggerTree(x), AutomationBuildError);
  bad({ op: "xor", conditions: [{ kind: "sensor", metric: "soil_moisture", comparator: "<", value: 1 }] });
  bad({ op: "and", conditions: [] });
  bad({ op: "and", conditions: [{ kind: "sensor", metric: "ph", comparator: "<", value: 1 }] });
  bad({ op: "and", conditions: [{ kind: "sensor", metric: "soil_moisture", comparator: "~", value: 1 }] });
  bad({ op: "and", conditions: [{ kind: "time", start: "8am", end: "20:00" }] });
  bad({ op: "and", conditions: [{ kind: "date_range", from: "2026-06-01", to: "07-01" }] });
  bad({ op: "and", conditions: [{ kind: "task_due", blueprint_ids: [] }] });
  bad({ op: "and", conditions: [{ kind: "bogus" }] });
});

Deno.test("buildActions — maps each kind + validates", () => {
  const rows = buildActions([
    { kind: "valve_open", device_id: "v1", duration_seconds: 300 },
    { kind: "notification", title: "Watered" },
    { kind: "complete_task", blueprint_id: "b1" },
  ]);
  assertEquals(rows.length, 3);
  assertEquals(rows[0], { action_kind: "valve_open", target_device_id: "v1", valve_duration_seconds: 300, notification_title: null, notification_body: null, target_blueprint_id: null, ord: 0 });
  assertEquals(rows[1].notification_title, "Watered");
  assertEquals(rows[1].ord, 1);
  assertEquals(rows[2].target_blueprint_id, "b1");

  assertThrows(() => buildActions([]), AutomationBuildError);
  // deno-lint-ignore no-explicit-any
  assertThrows(() => buildActions([{ kind: "valve_open" } as any]), AutomationBuildError);
  // deno-lint-ignore no-explicit-any
  assertThrows(() => buildActions([{ kind: "complete_task" } as any]), AutomationBuildError);
});

Deno.test("treeReferencedIds + actionDeviceIds collect ids for ownership checks", () => {
  const tree = buildTriggerTree({
    op: "and", conditions: [
      { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, sensor_device_ids: ["d1"], area_id: "a1" },
      { kind: "task_due", blueprint_ids: ["b1"] },
    ],
  });
  const refs = treeReferencedIds(tree);
  assertEquals(refs.sensorIds, ["d1"]);
  assertEquals(refs.areaIds, ["a1"]);
  assertEquals(refs.blueprintIds, ["b1"]);
  assertEquals(actionDeviceIds(buildActions([{ kind: "valve_open", device_id: "v1", duration_seconds: 60 }])), ["v1"]);
});
