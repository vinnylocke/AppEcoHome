import { describe, it, expect } from "vitest";
import {
  sortSections, severityTone, isReportEmpty,
  type ReportSection, type ManagerReport,
} from "../../../src/lib/managerReport";

const section = (over: Partial<ReportSection>): ReportSection => ({
  goal: null, title: "S", body: "b", severity: 1, recommendation: null, link: null, ...over,
});

describe("sortSections", () => {
  it("orders by severity descending, stable for ties", () => {
    const input = [
      section({ title: "a", severity: 1 }),
      section({ title: "b", severity: 3 }),
      section({ title: "c", severity: 2 }),
      section({ title: "d", severity: 3 }),
    ];
    expect(sortSections(input).map((s) => s.title)).toEqual(["b", "d", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [section({ title: "a", severity: 1 }), section({ title: "b", severity: 3 })];
    sortSections(input);
    expect(input.map((s) => s.title)).toEqual(["a", "b"]);
  });
});

describe("severityTone", () => {
  it("maps severity to a label + classes", () => {
    expect(severityTone(3).label).toBe("Priority");
    expect(severityTone(2).label).toBe("Worth doing");
    expect(severityTone(1).label).toBe("On track");
    expect(severityTone(3).cls).toContain("rose");
  });
});

describe("isReportEmpty", () => {
  const base: ManagerReport = {
    headline: "", greeting: "", sections: [], gaps: [],
    yearPlan: { thisMonth: [], thisSeason: [], comingUp: [] },
    followUps: [], generatedAt: "", persona: null,
  };

  it("treats null and contentless reports as empty", () => {
    expect(isReportEmpty(null)).toBe(true);
    expect(isReportEmpty(base)).toBe(true);
  });

  it("is non-empty when there's a headline or any section/gap", () => {
    expect(isReportEmpty({ ...base, headline: "All good" })).toBe(false);
    expect(isReportEmpty({ ...base, sections: [section({})] })).toBe(false);
    expect(isReportEmpty({ ...base, gaps: [{ goal: null, title: "g", detail: "d", suggestion: null, link: null }] })).toBe(false);
  });
});
