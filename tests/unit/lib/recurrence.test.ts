import { describe, it, expect } from "vitest";
import { deriveRecurrence, yearsFromRecurrence } from "../../../src/lib/recurrence";

const START = "2026-06-01";

describe("deriveRecurrence", () => {
  it("checkbox off → once", () => {
    expect(deriveRecurrence(START, false, null)).toEqual({ recurrence_kind: "once", recurs_until: null });
    expect(deriveRecurrence(START, false, 5)).toEqual({ recurrence_kind: "once", recurs_until: null });
  });

  it("checkbox on + no cap → annual (forever)", () => {
    expect(deriveRecurrence(START, true, null)).toEqual({ recurrence_kind: "annual", recurs_until: null });
    expect(deriveRecurrence(START, true, 0)).toEqual({ recurrence_kind: "annual", recurs_until: null });
  });

  it("N years → lifecycle_capped, recurs_until = start + (N-1) years (N windows)", () => {
    // N=3 → windows 2026, 2027, 2028 → cap 2028.
    expect(deriveRecurrence(START, true, 3)).toEqual({ recurrence_kind: "lifecycle_capped", recurs_until: "2028-06-01" });
    // N=2 (biennial) → windows 2026, 2027 → cap 2027.
    expect(deriveRecurrence(START, true, 2)).toEqual({ recurrence_kind: "lifecycle_capped", recurs_until: "2027-06-01" });
    // N=1 → single window (cap = start year).
    expect(deriveRecurrence(START, true, 1)).toEqual({ recurrence_kind: "lifecycle_capped", recurs_until: "2026-06-01" });
  });

  it("handles a Feb 29 start (same-date-next-year → Mar 1, matching plantScheduleGenerator.addYears)", () => {
    expect(deriveRecurrence("2024-02-29", true, 2).recurs_until).toBe("2025-03-01");
  });

  it("no anchor date → falls back to uncapped annual", () => {
    expect(deriveRecurrence(null, true, 3)).toEqual({ recurrence_kind: "annual", recurs_until: null });
  });
});

describe("yearsFromRecurrence", () => {
  it("once → checkbox off, no cap", () => {
    expect(yearsFromRecurrence(START, "once", null)).toEqual({ repeatAnnually: false, repeatYears: null });
    expect(yearsFromRecurrence(START, null, null)).toEqual({ repeatAnnually: false, repeatYears: null });
  });

  it("annual → checkbox on, forever (no cap)", () => {
    expect(yearsFromRecurrence(START, "annual", null)).toEqual({ repeatAnnually: true, repeatYears: null });
  });

  it("lifecycle_capped → checkbox on, N = capYear - startYear + 1", () => {
    expect(yearsFromRecurrence(START, "lifecycle_capped", "2028-06-01")).toEqual({ repeatAnnually: true, repeatYears: 3 });
    expect(yearsFromRecurrence(START, "lifecycle_capped", "2027-06-01")).toEqual({ repeatAnnually: true, repeatYears: 2 });
  });

  it("round-trips with deriveRecurrence", () => {
    for (const n of [1, 2, 3, 7]) {
      const d = deriveRecurrence(START, true, n);
      expect(yearsFromRecurrence(START, d.recurrence_kind, d.recurs_until)).toEqual({ repeatAnnually: true, repeatYears: n });
    }
    const forever = deriveRecurrence(START, true, null);
    expect(yearsFromRecurrence(START, forever.recurrence_kind, forever.recurs_until)).toEqual({ repeatAnnually: true, repeatYears: null });
    const once = deriveRecurrence(START, false, null);
    expect(yearsFromRecurrence(START, once.recurrence_kind, once.recurs_until)).toEqual({ repeatAnnually: false, repeatYears: null });
  });
});
