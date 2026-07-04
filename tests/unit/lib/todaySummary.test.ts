import { describe, test, expect } from "vitest";
import { buildTodaySummary } from "../../../src/lib/todaySummary";

// ---- buildTodaySummary (RHO-20) ----
// Combines the ghost-aware client pending count with the server today bucket.

describe("buildTodaySummary", () => {
  test("done comes from the server bucket, pending from the client count", () => {
    const s = buildTodaySummary(3, { completedOnTime: 2, completedLate: 0 });
    expect(s.done).toBe(2);
    expect(s.pending).toBe(3);
    expect(s.total).toBe(5); // 2 done of 5 scheduled
  });

  test("late completions count toward done", () => {
    const s = buildTodaySummary(0, { completedOnTime: 1, completedLate: 2 });
    expect(s.done).toBe(3);
    expect(s.total).toBe(3);
  });

  test("skipped and postponed pass through and stay out of done/pending/total", () => {
    const s = buildTodaySummary(1, { completedOnTime: 1, skipped: 2, postponed: 1 });
    expect(s.skipped).toBe(2);
    expect(s.postponed).toBe(1);
    expect(s.done).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.total).toBe(2); // only done + pending
  });

  test("null bucket (stats in flight) still renders pending from the client", () => {
    const s = buildTodaySummary(4, null);
    expect(s.done).toBe(0);
    expect(s.pending).toBe(4);
    expect(s.total).toBe(4);
    expect(s.skipped).toBe(0);
    expect(s.postponed).toBe(0);
  });

  test("negative client counts are clamped to zero", () => {
    const s = buildTodaySummary(-2, { completedOnTime: 1 });
    expect(s.pending).toBe(0);
    expect(s.total).toBe(1);
  });
});
