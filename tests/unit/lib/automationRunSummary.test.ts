import { describe, it, expect } from "vitest";
import { summariseAutomationRun } from "../../../src/lib/automationRunSummary";

describe("summariseAutomationRun", () => {
  it("handles the receipt object shape — members alerted", () => {
    expect(
      summariseAutomationRun({ devices_triggered: { members_alerted: 2, valves_queued: 1 } }),
    ).toEqual(["1 valve triggered", "2 members alerted"]);
  });

  it("reads the legacy `notifications` count as members alerted (old rows)", () => {
    expect(
      summariseAutomationRun({ devices_triggered: { notifications: 1, valves_queued: 0 } }),
    ).toEqual(["1 member alerted"]);
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
    expect(summariseAutomationRun({ devices_triggered: { members_alerted: 0, valves_queued: 0 } })).toEqual([]);
    expect(summariseAutomationRun({ devices_triggered: [] })).toEqual([]);
  });
});
