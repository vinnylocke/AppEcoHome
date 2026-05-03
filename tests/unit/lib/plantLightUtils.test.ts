import { describe, it, expect } from "vitest";
import { getOptimalLuxRange, getLightFitness } from "../../../src/lib/plantLightUtils";

describe("getOptimalLuxRange", () => {
  it("maps Full sun to 20000–40000", () => {
    const result = getOptimalLuxRange(["Full sun"]);
    expect(result).toEqual({ min: 20000, max: 40000, label: "Full Sun" });
  });

  it("maps Partial shade to 5000–20000", () => {
    const result = getOptimalLuxRange(["Partial shade"]);
    expect(result).toEqual({ min: 5000, max: 20000, label: "Partial Sun" });
  });

  it("maps Shade to 0–1500", () => {
    const result = getOptimalLuxRange(["Shade"]);
    expect(result).toEqual({ min: 0, max: 1500, label: "Full Shade" });
  });

  it("takes union when multiple sunlight values present", () => {
    const result = getOptimalLuxRange(["Full sun", "Partial shade"]);
    expect(result).not.toBeNull();
    expect(result!.min).toBe(5000);
    expect(result!.max).toBe(40000);
  });

  it("returns null for empty array", () => {
    expect(getOptimalLuxRange([])).toBeNull();
  });

  it("returns null when no known strings matched", () => {
    expect(getOptimalLuxRange(["unknown string"])).toBeNull();
  });

  it("is case-insensitive", () => {
    const lower = getOptimalLuxRange(["full sun"]);
    const upper = getOptimalLuxRange(["FULL SUN"]);
    expect(lower).toEqual(upper);
  });
});

describe("getLightFitness", () => {
  const range = { min: 20000, max: 40000, label: "Full Sun" };

  it("returns Best when lux is within range", () => {
    expect(getLightFitness(25000, range).rating).toBe("Best");
  });

  it("returns Best at exactly min", () => {
    expect(getLightFitness(20000, range).rating).toBe("Best");
  });

  it("returns Best at exactly max", () => {
    expect(getLightFitness(40000, range).rating).toBe("Best");
  });

  it("returns Great when slightly below optimal", () => {
    // min * 0.6 = 12000
    expect(getLightFitness(12000, range).rating).toBe("Great");
  });

  it("returns Good when moderately below optimal", () => {
    // min * 0.3 = 6000
    expect(getLightFitness(6000, range).rating).toBe("Good");
  });

  it("returns Bad when significantly below optimal", () => {
    // min * 0.1 = 2000
    expect(getLightFitness(2000, range).rating).toBe("Bad");
  });

  it("returns Worse when critically below optimal", () => {
    expect(getLightFitness(100, range).rating).toBe("Worse");
  });

  it("returns Great when slightly above max", () => {
    // max * 1.5 = 60000
    expect(getLightFitness(55000, range).rating).toBe("Great");
  });

  it("each rating has color and bgColor", () => {
    const ratings = [25000, 12000, 6000, 2000, 100];
    for (const lux of ratings) {
      const f = getLightFitness(lux, range);
      expect(f.color).toBeTruthy();
      expect(f.bgColor).toBeTruthy();
      expect(f.description).toBeTruthy();
    }
  });
});
