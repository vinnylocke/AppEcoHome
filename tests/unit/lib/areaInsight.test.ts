import { describe, it, expect } from "vitest";
import { metricLabel, statusMeta, formatAnalysedLabel } from "../../../src/lib/areaInsight";

describe("metricLabel", () => {
  it("maps known metrics to friendly names", () => {
    expect(metricLabel("moisture")).toBe("Soil Moisture");
    expect(metricLabel("ec")).toBe("EC / Nutrients");
    expect(metricLabel("temperature")).toBe("Soil Temperature");
  });
});

describe("statusMeta", () => {
  it("returns distinct styling per status", () => {
    expect(statusMeta("good").label).toBe("On target");
    expect(statusMeta("low").label).toBe("Below target");
    expect(statusMeta("high").label).toBe("Above target");
    expect(statusMeta("unknown").label).toBe("No reading");
    expect(statusMeta("good").dotClass).toContain("emerald");
    expect(statusMeta("low").dotClass).toContain("amber");
    expect(statusMeta("high").dotClass).toContain("rose");
  });
});

describe("formatAnalysedLabel", () => {
  const now = Date.parse("2026-06-17T12:00:00Z");
  it("returns empty for no timestamp", () => {
    expect(formatAnalysedLabel(null, now)).toBe("");
    expect(formatAnalysedLabel(undefined, now)).toBe("");
  });
  it("formats recent windows", () => {
    expect(formatAnalysedLabel("2026-06-17T11:59:40Z", now)).toBe("Analysed just now");
    expect(formatAnalysedLabel("2026-06-17T11:30:00Z", now)).toBe("Analysed 30m ago");
    expect(formatAnalysedLabel("2026-06-17T09:00:00Z", now)).toBe("Analysed 3h ago");
    expect(formatAnalysedLabel("2026-06-15T12:00:00Z", now)).toBe("Analysed 2d ago");
  });
  it("falls back to a date for old timestamps", () => {
    expect(formatAnalysedLabel("2026-06-01T12:00:00Z", now)).toContain("Analysed on");
  });
});
