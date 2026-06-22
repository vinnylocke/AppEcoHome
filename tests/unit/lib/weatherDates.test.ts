import { describe, it, expect } from "vitest";
import { formatDateRange } from "../../../src/lib/weatherDates";

// Fixed reference "now" = 2026-05-01 (local) so Today=01, Tomorrow=02.
const NOW = new Date(2026, 4, 1);

describe("formatDateRange", () => {
  it("returns empty string for no dates", () => {
    expect(formatDateRange([], NOW)).toBe("");
  });

  it("labels a single today / tomorrow", () => {
    expect(formatDateRange(["2026-05-01"], NOW)).toBe("Today");
    expect(formatDateRange(["2026-05-02"], NOW)).toBe("Tomorrow");
  });

  it("shows day + month for a single far-out date", () => {
    expect(formatDateRange(["2026-05-20"], NOW)).toMatch(/20 May/);
  });

  it("joins a 3+ consecutive run with an en-dash", () => {
    const s = formatDateRange(["2026-05-02", "2026-05-03", "2026-05-04"], NOW);
    expect(s).toContain("–");
    expect(s).not.toContain(",");
  });

  it("joins two consecutive days with an ampersand", () => {
    expect(formatDateRange(["2026-05-03", "2026-05-04"], NOW)).toContain("&");
  });

  it("comma-joins disjoint days (no range dash)", () => {
    const s = formatDateRange(["2026-05-02", "2026-05-05"], NOW);
    expect(s).toContain(",");
    expect(s).not.toContain("–");
  });

  it("dedupes and sorts before formatting", () => {
    // 01 + 02 are consecutive → ampersand form
    expect(formatDateRange(["2026-05-02", "2026-05-01", "2026-05-01"], NOW)).toContain("&");
  });

  it("caps a long disjoint list with +N", () => {
    const s = formatDateRange(
      ["2026-05-02", "2026-05-04", "2026-05-06", "2026-05-08", "2026-05-10", "2026-05-12"],
      NOW,
    );
    expect(s).toMatch(/\+\d/);
  });
});
