import { assert, assertEquals } from "@std/assert";
import { convertLegacyToTree, type LegacyAutomation } from "@shared/conditionConvert.ts";
import type { ConditionNode } from "@shared/conditionTree.ts";

function legacy(overrides: Partial<LegacyAutomation> = {}): LegacyAutomation {
  return {
    trigger_kind: "sensor_threshold",
    area_id: "area-1",
    sensor_metric: "soil_moisture",
    sensor_comparator: "<",
    sensor_threshold_value: 30,
    sensor_agg_mode: "any",
    scheduled_time: "07:00:00",
    weather_mode: "off",
    skip_if_rained: false,
    rain_threshold_mm: 5,
    weather_min_probability: 60,
    critical_threshold_value: null,
    trigger_if_hot: false,
    heat_threshold_c: 30,
    ...overrides,
  };
}

// ── sensor_threshold ─────────────────────────────────────────────────────────

Deno.test("convert — plain sensor → sensor leaf", () => {
  const t = convertLegacyToTree(legacy());
  assertEquals(t.kind, "sensor");
  if (t.kind === "sensor") { assertEquals(t.value, 30); assertEquals(t.areaId, "area-1"); }
});

Deno.test("convert — sensor + skip → AND[sensor, NOT rain]", () => {
  const t = convertLegacyToTree(legacy({ weather_mode: "skip" }));
  assertEquals(t.kind, "group");
  if (t.kind === "group") {
    assertEquals(t.op, "and");
    assertEquals(t.children[0].kind, "sensor");
    assertEquals(t.children[1].kind, "weather");
    assert((t.children[1] as { negate?: boolean }).negate === true);
  }
});

Deno.test("convert — sensor + defer → OR[AND[sensor, NOT rain], sensorCritical]", () => {
  const t = convertLegacyToTree(legacy({ weather_mode: "defer" }));
  assertEquals(t.kind, "group");
  if (t.kind === "group") {
    assertEquals(t.op, "or");
    assertEquals(t.children[0].kind, "group"); // AND[sensor, NOT rain]
    const crit = t.children[1];
    assertEquals(crit.kind, "sensor");
    if (crit.kind === "sensor") assertEquals(crit.value, 20); // 30 - 10 derived
  }
});

// ── time_scheduled ───────────────────────────────────────────────────────────

Deno.test("convert — plain scheduled → AND[time(UTC hour window)]", () => {
  const t = convertLegacyToTree(legacy({ trigger_kind: "time_scheduled" }));
  assertEquals(t.kind, "group");
  if (t.kind === "group") {
    assertEquals(t.children.length, 1);
    const time = t.children[0];
    assertEquals(time.kind, "time");
    if (time.kind === "time") {
      assertEquals(time.tz, "UTC");
      assertEquals(time.schedule.mon[0], { start: "07:00", end: "08:00" });
      assertEquals(time.schedule.sun[0], { start: "07:00", end: "08:00" });
    }
  }
});

Deno.test("convert — scheduled + controlling blueprints → adds task_due", () => {
  const t = convertLegacyToTree(legacy({ trigger_kind: "time_scheduled" }), ["bp-1", "bp-2"]) as ConditionNode;
  if (t.kind === "group") {
    const taskNode = t.children.find((c) => c.kind === "task_due");
    assert(taskNode);
    if (taskNode?.kind === "task_due") assertEquals(taskNode.blueprintIds, ["bp-1", "bp-2"]);
  }
});

Deno.test("convert — scheduled + skip_if_rained → includes NOT rain", () => {
  const t = convertLegacyToTree(legacy({ trigger_kind: "time_scheduled", skip_if_rained: true }));
  if (t.kind === "group") {
    const rain = t.children.find((c) => c.kind === "weather");
    assert(rain && (rain as { negate?: boolean }).negate === true);
  }
});

Deno.test("convert — scheduled + task + trigger_if_hot → OR[task_due, heatwave]", () => {
  const t = convertLegacyToTree(legacy({ trigger_kind: "time_scheduled", trigger_if_hot: true }), ["bp-1"]);
  if (t.kind === "group") {
    const orNode = t.children.find((c) => c.kind === "group" && c.op === "or");
    assert(orNode);
    if (orNode?.kind === "group") {
      assertEquals(orNode.children.map((c) => c.kind).sort(), ["task_due", "weather"]);
    }
  }
});

Deno.test("convert — 23:00 schedule → end 24:00 (no wrap needed)", () => {
  const t = convertLegacyToTree(legacy({ trigger_kind: "time_scheduled", scheduled_time: "23:00:00" }));
  if (t.kind === "group" && t.children[0].kind === "time") {
    assertEquals(t.children[0].schedule.mon[0], { start: "23:00", end: "24:00" });
  }
});
