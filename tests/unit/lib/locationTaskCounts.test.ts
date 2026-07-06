import { describe, test, expect } from "vitest";
import {
  buildLocationTaskCounts,
  type TaskCountRow,
  type BlueprintCountRow,
} from "../../../src/lib/locationTaskCounts";

// ---- buildLocationTaskCounts ----
// The ghost-aware "remaining today" count per location. Completed / Skipped
// rows suppress their blueprint's ghost but are NOT counted as remaining.

const TODAY = "2026-07-05";
const L1 = "loc-1";

/** A recurring blueprint anchored so it's due today (freq 1, start = today). */
function dailyBp(id: string, over: Partial<BlueprintCountRow> = {}): BlueprintCountRow {
  return { id, location_id: L1, frequency_days: 1, start_date: TODAY, ...over };
}

describe("buildLocationTaskCounts", () => {
  test("all recurring tasks completed today → 0 remaining (the reported bug)", () => {
    const bps = [dailyBp("b1"), dailyBp("b2"), dailyBp("b3")];
    // Each completed row is a persisted tombstone for its blueprint.
    const tasks: TaskCountRow[] = bps.map((b) => ({
      location_id: L1,
      blueprint_id: b.id,
      status: "Completed",
    }));
    expect(buildLocationTaskCounts([L1], tasks, bps, TODAY)[L1]).toBe(0);
  });

  test("nothing acted on yet → counts one ghost per blueprint due today", () => {
    const bps = [dailyBp("b1"), dailyBp("b2"), dailyBp("b3")];
    expect(buildLocationTaskCounts([L1], [], bps, TODAY)[L1]).toBe(3);
  });

  test("partial completion → counts only the remaining", () => {
    const bps = [dailyBp("b1"), dailyBp("b2"), dailyBp("b3")];
    const tasks: TaskCountRow[] = [
      { location_id: L1, blueprint_id: "b1", status: "Completed" },
    ];
    expect(buildLocationTaskCounts([L1], tasks, bps, TODAY)[L1]).toBe(2);
  });

  test("a Skipped row suppresses its ghost and isn't counted", () => {
    const bps = [dailyBp("b1"), dailyBp("b2")];
    const tasks: TaskCountRow[] = [
      { location_id: L1, blueprint_id: "b1", status: "Skipped" },
    ];
    // b1 suppressed by the tombstone, b2 still a ghost.
    expect(buildLocationTaskCounts([L1], tasks, bps, TODAY)[L1]).toBe(1);
  });

  test("a Completed standalone task (no blueprint) isn't counted and doesn't touch ghosts", () => {
    const bps = [dailyBp("b1")];
    const tasks: TaskCountRow[] = [
      { location_id: L1, blueprint_id: null, status: "Completed" },
    ];
    expect(buildLocationTaskCounts([L1], tasks, bps, TODAY)[L1]).toBe(1); // just the b1 ghost
  });

  test("a pending persisted task counts, and suppresses its blueprint's ghost", () => {
    const bps = [dailyBp("b1")];
    const tasks: TaskCountRow[] = [
      { location_id: L1, blueprint_id: "b1", status: "Pending" },
    ];
    // Counted once via the persisted row; the ghost is suppressed (no double).
    expect(buildLocationTaskCounts([L1], tasks, bps, TODAY)[L1]).toBe(1);
  });

  test("every location gets a 0 entry even with no tasks", () => {
    const counts = buildLocationTaskCounts([L1, "loc-2"], [], [], TODAY);
    expect(counts).toEqual({ [L1]: 0, "loc-2": 0 });
  });

  test("non-freq-aligned recurring blueprint is not due today", () => {
    // start yesterday, every 2 days → diff 1, 1 % 2 !== 0 → not today.
    const bp = dailyBp("b1", { frequency_days: 2, start_date: "2026-07-04" });
    expect(buildLocationTaskCounts([L1], [], [bp], TODAY)[L1]).toBe(0);
  });

  test("harvest-window blueprint counts once while inside its window", () => {
    // Not freq-aligned today, but an open window (end_date in the future).
    const bp = dailyBp("h1", {
      task_type: "Harvesting",
      frequency_days: 30,
      start_date: "2026-07-01",
      end_date: "2026-07-20",
    });
    expect(buildLocationTaskCounts([L1], [], [bp], TODAY)[L1]).toBe(1);
  });

  test("paused, not-yet-started, and ended blueprints are excluded", () => {
    const paused = dailyBp("p", { paused_until: "2026-07-10" });
    const future = dailyBp("f", { start_date: "2026-07-10" });
    const ended = dailyBp("e", { start_date: "2026-06-01", end_date: "2026-07-01" });
    expect(buildLocationTaskCounts([L1], [], [paused, future, ended], TODAY)[L1]).toBe(0);
  });
});
