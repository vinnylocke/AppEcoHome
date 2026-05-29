import { describe, it, expect } from "vitest";
import {
  getOptimalLuxRange,
  getLightFitness,
  luxToBand,
  targetLuxForSunlight,
  bandForSunlightValue,
} from "../../../src/lib/plantLightUtils";

// Canonical bands (single source of truth): Full Sun 20k–100k, Part Sun
// 10k–20k, Part Shade 2.5k–10k, Shade 500–2.5k, Deep Shade 0–500.
describe("getOptimalLuxRange", () => {
  it("maps Full sun to 20000–100000", () => {
    expect(getOptimalLuxRange(["Full sun"])).toEqual({ min: 20000, max: 100000, label: "Full Sun" });
  });

  it("maps Partial shade to the Part Shade band (2500–10000)", () => {
    expect(getOptimalLuxRange(["Partial shade"])).toEqual({ min: 2500, max: 10000, label: "Part Shade" });
  });

  it("maps Part sun to the Part Sun band (10000–20000)", () => {
    expect(getOptimalLuxRange(["Part sun"])).toEqual({ min: 10000, max: 20000, label: "Part Sun" });
  });

  it("maps Shade to 500–2500", () => {
    expect(getOptimalLuxRange(["Shade"])).toEqual({ min: 500, max: 2500, label: "Shade" });
  });

  it("takes union when multiple sunlight values present", () => {
    const result = getOptimalLuxRange(["Full sun", "Partial shade"]);
    expect(result!.min).toBe(2500);
    expect(result!.max).toBe(100000);
  });

  it("matches underscore-format values (Verdantly): full_sun", () => {
    expect(getOptimalLuxRange(["full_sun"])).toEqual({ min: 20000, max: 100000, label: "Full Sun" });
  });

  it("maps part_shade to Part Shade, not Deep Shade", () => {
    // Regression: "part_shade".includes("shade") must not fall to the shade bands.
    expect(getOptimalLuxRange(["part_shade"])).toEqual({ min: 2500, max: 10000, label: "Part Shade" });
  });

  it("maps deep_shade to Deep Shade (0–500)", () => {
    expect(getOptimalLuxRange(["deep_shade"])).toEqual({ min: 0, max: 500, label: "Deep Shade" });
  });

  it("spans the union of underscore values and labels both bands", () => {
    // Verdantly "full sun → partial shade" stores ["full_sun","part_shade"].
    const result = getOptimalLuxRange(["full_sun", "part_shade"]);
    expect(result!.min).toBe(2500);
    expect(result!.max).toBe(100000);
    expect(result!.label).toBe("Part Shade – Full Sun");
  });

  it("returns null for empty array", () => {
    expect(getOptimalLuxRange([])).toBeNull();
  });

  it("returns null when no known strings matched", () => {
    expect(getOptimalLuxRange(["unknown string"])).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(getOptimalLuxRange(["full sun"])).toEqual(getOptimalLuxRange(["FULL SUN"]));
  });
});

describe("bandForSunlightValue", () => {
  it("matches full sun before bare sun, and part shade before bare shade", () => {
    expect(bandForSunlightValue("full sun")?.label).toBe("Full Sun");
    expect(bandForSunlightValue("part shade")?.label).toBe("Part Shade");
    expect(bandForSunlightValue("shade")?.label).toBe("Shade");
    expect(bandForSunlightValue("nope")).toBeNull();
  });
});

describe("luxToBand", () => {
  it("labels a live reading by the canonical band it falls in", () => {
    expect(luxToBand(70000).label).toBe("Full Sun");
    expect(luxToBand(15000).label).toBe("Part Sun");
    expect(luxToBand(5000).label).toBe("Part Shade");
    expect(luxToBand(1000).label).toBe("Shade");
    expect(luxToBand(100).label).toBe("Deep Shade");
    expect(luxToBand(0).label).toBe("Deep Shade");
  });
});

describe("targetLuxForSunlight", () => {
  it("returns the midpoint of the matched range", () => {
    expect(targetLuxForSunlight("full sun")).toBe(60000); // (20000+100000)/2
    expect(targetLuxForSunlight(["full_sun", "part_shade"])).toBe(51250); // (2500+100000)/2
  });
  it("returns null when nothing matches", () => {
    expect(targetLuxForSunlight("unknown")).toBeNull();
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
