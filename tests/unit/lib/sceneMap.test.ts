import { describe, it, expect } from "vitest";
import {
  boxToPercent,
  isValidBox,
  clampConfidence,
  topCandidate,
  boxToCropRect,
  type Box2d,
} from "../../../src/lib/sceneMap";
import type { SceneRegion } from "../../../src/services/plantDoctorService";

describe("boxToPercent", () => {
  it("converts a 0–1000 box to top/left/width/height percentages", () => {
    // [ymin, xmin, ymax, xmax]
    const p = boxToPercent([100, 200, 600, 700]);
    expect(p.topPct).toBeCloseTo(10);
    expect(p.leftPct).toBeCloseTo(20);
    expect(p.heightPct).toBeCloseTo(50); // 60 - 10
    expect(p.widthPct).toBeCloseTo(50); // 70 - 20
  });

  it("clamps out-of-range values into 0–100 and never returns negative size", () => {
    const p = boxToPercent([-50, 1200, 2000, -10] as unknown as Box2d);
    expect(p.topPct).toBe(0);
    expect(p.leftPct).toBe(100);
    expect(p.widthPct).toBe(0);
    expect(p.heightPct).toBe(100);
  });
});

describe("isValidBox", () => {
  it("accepts a well-formed box with positive area", () => {
    expect(isValidBox([10, 10, 500, 500])).toBe(true);
  });
  it("rejects wrong length / non-finite / out-of-range / zero-area boxes", () => {
    expect(isValidBox(undefined)).toBe(false);
    expect(isValidBox([10, 10, 500])).toBe(false);
    expect(isValidBox([10, 10, 500, 1200])).toBe(false);
    expect(isValidBox([NaN, 10, 500, 500])).toBe(false);
    expect(isValidBox([500, 10, 500, 500])).toBe(false); // ymax == ymin
    expect(isValidBox([10, 500, 500, 500])).toBe(false); // xmax == xmin
  });
});

describe("clampConfidence", () => {
  it("rounds and clamps into 0–100; invalid → 0", () => {
    expect(clampConfidence(87.4)).toBe(87);
    expect(clampConfidence(150)).toBe(100);
    expect(clampConfidence(-5)).toBe(0);
    expect(clampConfidence(undefined)).toBe(0);
    expect(clampConfidence(NaN)).toBe(0);
  });
});

describe("topCandidate", () => {
  it("returns the highest-confidence candidate regardless of order", () => {
    const region: SceneRegion = {
      box: [0, 0, 100, 100],
      candidates: [
        { name: "Mint", confidence: 40 },
        { name: "Basil", confidence: 82 },
        { name: "Oregano", confidence: 55 },
      ],
    };
    expect(topCandidate(region)?.name).toBe("Basil");
  });
  it("returns null when there are no candidates", () => {
    expect(topCandidate({ box: [0, 0, 100, 100], candidates: [] })).toBeNull();
  });
});

describe("boxToCropRect", () => {
  it("maps a 0–1000 box to source pixels for the natural image size", () => {
    // box [ymin,xmin,ymax,xmax] = [100,200,600,700] on a 2000×1000 image
    const r = boxToCropRect([100, 200, 600, 700], 2000, 1000);
    expect(r.sx).toBeCloseTo(400); // 200/1000 * 2000
    expect(r.sy).toBeCloseTo(100); // 100/1000 * 1000
    expect(r.sw).toBeCloseTo(1000); // (700-200)/1000 * 2000
    expect(r.sh).toBeCloseTo(500); // (600-100)/1000 * 1000
  });

  it("floors width/height to at least 1px for a degenerate box", () => {
    const r = boxToCropRect([500, 500, 500, 500], 1000, 1000);
    expect(r.sw).toBe(1);
    expect(r.sh).toBe(1);
  });
});
