import { describe, it, expect } from "vitest";
import {
  newLeaf, newGroup, summariseTree, summariseNode, emptySchedule,
  type ConditionNode, type Weekday,
} from "../../../src/lib/conditionTree";

describe("newLeaf / newGroup", () => {
  it("sensor default is moisture < 30", () => {
    const l = newLeaf("sensor");
    expect(l).toMatchObject({ kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30 });
  });
  it("time default is weekdays 08:00–20:00", () => {
    const l = newLeaf("time");
    if (l.kind !== "time") throw new Error("expected time");
    expect(l.schedule.mon).toEqual([{ start: "08:00", end: "20:00" }]);
    expect(l.schedule.sat).toEqual([]);
  });
  it("group starts empty", () => {
    expect(newGroup("or")).toEqual({ kind: "group", op: "or", children: [] });
  });
});

describe("summariseNode / summariseTree", () => {
  it("sensor with sensors count", () => {
    const n: ConditionNode = { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any", sensorIds: ["a", "b"] };
    expect(summariseNode(n)).toBe("moisture < 30% (2 sensors)");
  });

  it("negate prefixes 'not'", () => {
    const n: ConditionNode = { kind: "weather", type: "rain_forecast", thresholdMm: 4, negate: true };
    expect(summariseNode(n)).toBe("not rain forecast (≥4mm)");
  });

  it("time summarises weekdays + window", () => {
    const s = emptySchedule();
    for (const d of ["mon", "tue", "wed", "thu", "fri"] as Weekday[]) s[d] = [{ start: "08:00", end: "20:00" }];
    expect(summariseNode({ kind: "time", schedule: s })).toBe("time is 08:00–20:00 weekdays");
  });

  it("time every day", () => {
    const s = emptySchedule();
    for (const d of Object.keys(s) as Weekday[]) s[d] = [{ start: "06:00", end: "09:00" }];
    expect(summariseNode({ kind: "time", schedule: s })).toContain("every day");
  });

  it("AND group joins with 'and' and wraps", () => {
    const tree: ConditionNode = {
      kind: "group", op: "and", children: [
        { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any" },
        { kind: "weather", type: "rain_forecast", thresholdMm: 5, negate: true },
      ],
    };
    expect(summariseTree(tree)).toBe("Moisture < 30% and not rain forecast (≥5mm)");
  });

  it("empty AND = always, empty OR = never", () => {
    expect(summariseNode(newGroup("and"))).toBe("always");
    expect(summariseNode(newGroup("or"))).toBe("never");
  });

  it("null tree → dash", () => {
    expect(summariseTree(null)).toBe("—");
  });
});
