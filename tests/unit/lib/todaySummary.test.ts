import { describe, test, expect } from "vitest";
import { buildTodaySummary } from "../../../src/lib/todaySummary";

// ---- buildTodaySummary (RHO-20; completion-aware since 2026-07) ----
// Combines the ghost-aware client PENDING count with the server's
// completion-aware `doneToday`. `done` is now an explicit number (not dug out
// of the day-strip bucket) so clearing an overdue/harvest task today counts.

describe("buildTodaySummary", () => {
  test("done comes from the completion-aware doneToday, pending from the client count", () => {
    const s = buildTodaySummary(3, 2);
    expect(s.done).toBe(2);
    expect(s.pending).toBe(3);
    expect(s.total).toBe(5); // 2 done of 5
  });

  test("clearing overdue work today is reflected in done even with zero pending", () => {
    // The reported bug: 3 tasks cleared today (2 overdue + 1 due-today), nothing
    // left open → "3 of 3", not "2 of 3".
    const s = buildTodaySummary(0, 3);
    expect(s.done).toBe(3);
    expect(s.pending).toBe(0);
    expect(s.total).toBe(3);
  });

  test("skipped and postponed pass through from the bucket, out of done/pending/total", () => {
    const s = buildTodaySummary(1, 1, { skipped: 2, postponed: 1 });
    expect(s.skipped).toBe(2);
    expect(s.postponed).toBe(1);
    expect(s.done).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.total).toBe(2); // only done + pending
  });

  test("null/undefined doneToday (stats in flight) still renders pending from the client", () => {
    const s = buildTodaySummary(4, null);
    expect(s.done).toBe(0);
    expect(s.pending).toBe(4);
    expect(s.total).toBe(4);
    expect(s.skipped).toBe(0);
    expect(s.postponed).toBe(0);
  });

  test("negative counts are clamped to zero", () => {
    expect(buildTodaySummary(-2, 1).pending).toBe(0);
    expect(buildTodaySummary(1, -5).done).toBe(0);
  });
});
