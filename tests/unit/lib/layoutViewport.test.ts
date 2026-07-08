import { describe, test, expect } from "vitest";
import { fitStageToCanvas } from "../../../src/lib/layoutViewport";

// docs/plans/garden-layout-fixes-and-mobile-readonly.md — the 2D stage used
// to open at zoom 1 / (32,32) regardless of viewport; these pin the
// fit-to-canvas math for the initial view and the F shortcut.

const BASE_PX = 50;

describe("fitStageToCanvas", () => {
  test("a 24×16m canvas fits a phone viewport fully", () => {
    // 390×700 usable canvas area on a phone.
    const fit = fitStageToCanvas(24, 16, 390, 700, BASE_PX);
    // 24m = 1200px; usable width 390-64=326 → zoom ≈ 0.27
    expect(fit.zoom).toBeCloseTo(326 / 1200, 2);
    // Whole canvas visible: width at zoom ≤ usable width.
    expect(24 * BASE_PX * fit.zoom).toBeLessThanOrEqual(390 - 32);
    expect(16 * BASE_PX * fit.zoom).toBeLessThanOrEqual(700 - 32);
  });

  test("zoom is capped at 1 — small canvases centre horizontally, top-aligned", () => {
    const fit = fitStageToCanvas(6, 4, 1200, 800, BASE_PX);
    expect(fit.zoom).toBe(1);
    // Horizontally centred: x = (1200 - 300)/2 = 450; vertically top-aligned
    // (the editor container can extend below the fold).
    expect(fit.x).toBe(450);
    expect(fit.y).toBe(32);
  });

  test("offsets never collapse below the padding", () => {
    const fit = fitStageToCanvas(24, 16, 390, 700, BASE_PX);
    expect(fit.x).toBeGreaterThanOrEqual(32);
    expect(fit.y).toBe(32);
  });

  test("degenerate viewports can't produce zoom 0", () => {
    const fit = fitStageToCanvas(24, 16, 10, 10, BASE_PX);
    expect(fit.zoom).toBeGreaterThanOrEqual(0.05);
  });

  test("landscape desktop viewport fits by the limiting axis", () => {
    // 1100×600 view, 24×16m canvas: height is limiting (800px vs 568 usable).
    const fit = fitStageToCanvas(24, 16, 1100, 600, BASE_PX);
    expect(fit.zoom).toBeCloseTo((600 - 64) / (16 * BASE_PX), 2);
  });
});
