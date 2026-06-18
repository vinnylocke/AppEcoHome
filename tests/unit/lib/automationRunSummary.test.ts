import { describe, it, expect } from "vitest";
import { summariseAutomationRun } from "../../../src/lib/automationRunSummary";

describe("summariseAutomationRun", () => {
  it("handles the condition-engine object shape (regression: used to crash)", () => {
    expect(
      summariseAutomationRun({ devices_triggered: { notifications: 2, valves_queued: 1 } }),
    ).toEqual(["1 valve triggered", "2 notifications sent"]);
  });

  it("handles the legacy array shape", () => {
    expect(
      summariseAutomationRun({
        devices_triggered: [
          { success: true, queued: false },
          { success: true, queued: false },
          { success: true, queued: true },
        ],
      }),
    ).toEqual(["2 valves fired", "1 valve queued"]);
  });

  it("counts completed tasks (excluding already-done)", () => {
    expect(
      summariseAutomationRun({
        devices_triggered: { valves_queued: 1 },
        tasks_completed: [{ already_done: false }, { already_done: true }],
      }),
    ).toEqual(["1 valve triggered", "1 task completed"]);
  });

  it("returns [] for empty / null / missing data", () => {
    expect(summariseAutomationRun({})).toEqual([]);
    expect(summariseAutomationRun({ devices_triggered: null })).toEqual([]);
    expect(summariseAutomationRun({ devices_triggered: { notifications: 0, valves_queued: 0 } })).toEqual([]);
    expect(summariseAutomationRun({ devices_triggered: [] })).toEqual([]);
  });
});
