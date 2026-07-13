import { describe, expect, it } from "vitest";
import {
  getShapeOverlayTint,
  splitHexAlpha,
  getSunTimeTint,
  getSunTimeTint2D,
  SUN_LIT_COLOR,
  SUN_SHADE_COLOR,
  type OverlayTintContext,
} from "../../../src/lib/garden/overlayTints";
import type { ShapeData } from "../../../src/components/GardenShapeProperties";
import type { ForecastDay } from "../../../src/lib/garden/microclimate";

function makeShape(overrides: Partial<ShapeData> = {}): ShapeData {
  return {
    id: "shape-1",
    layout_id: "layout-1",
    area_id: "area-1",
    shape_type: "rect",
    label: null,
    color: "#84cc16",
    x_m: 2,
    y_m: 2,
    width_m: 2,
    height_m: 1,
    radius_m: null,
    points: null,
    rotation: 0,
    z_index: 0,
    dashed: false,
    extrude_m: 0.3,
    preset_id: "raised-bed",
    ...overrides,
  };
}

function makeCtx(overrides: Partial<OverlayTintContext> = {}): OverlayTintContext {
  return {
    showFrost: false,
    showWind: false,
    showPh: false,
    showMoisture: false,
    forecast: [],
    allShapes: [],
    areaPh: {},
    areaMoisture: {},
    ...overrides,
  };
}

function forecastWithMin(minC: number): ForecastDay[] {
  return [{ date: "2026-07-13", temp_min_c: minC, temp_max_c: minC + 10 }];
}

describe("getShapeOverlayTint — frost", () => {
  it("maps 7-day worst minimum to the frost risk tint bands", () => {
    const shape = makeShape();
    expect(getShapeOverlayTint(shape, makeCtx({ showFrost: true, forecast: forecastWithMin(-5) }))).toBe("#dc262640"); // Severe
    expect(getShapeOverlayTint(shape, makeCtx({ showFrost: true, forecast: forecastWithMin(-1) }))).toBe("#f9731640"); // Moderate
    expect(getShapeOverlayTint(shape, makeCtx({ showFrost: true, forecast: forecastWithMin(2) }))).toBe("#fbbf2440");  // Mild
    expect(getShapeOverlayTint(shape, makeCtx({ showFrost: true, forecast: forecastWithMin(10) }))).toBe("#94a3b833"); // None
  });

  it("returns null when frost is on but no forecast has loaded", () => {
    expect(getShapeOverlayTint(makeShape(), makeCtx({ showFrost: true, forecast: [] }))).toBeNull();
  });

  it("uses the worst minimum across the first 7 days", () => {
    const forecast: ForecastDay[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-07-${13 + i}`,
      temp_min_c: i === 3 ? -4 : 8,
      temp_max_c: 15,
    }));
    expect(getShapeOverlayTint(makeShape(), makeCtx({ showFrost: true, forecast }))).toBe("#dc262640");
  });
});

describe("getShapeOverlayTint — wind", () => {
  const bed = makeShape({ id: "bed", x_m: 5, y_m: 5 });
  const wall = makeShape({ id: "wall", preset_id: "wall", extrude_m: 2, x_m: 5.5, y_m: 5.5, width_m: 1, height_m: 0.2 });
  const wall2 = makeShape({ id: "wall2", preset_id: "fence-panel", extrude_m: 1.8, x_m: 4.5, y_m: 4.5, width_m: 1, height_m: 0.2 });

  it("tints exposed / partly sheltered / sheltered", () => {
    expect(getShapeOverlayTint(bed, makeCtx({ showWind: true, allShapes: [bed] }))).toBe("#ef444440"); // Exposed
    expect(getShapeOverlayTint(bed, makeCtx({ showWind: true, allShapes: [bed, wall] }))).toBe("#fbbf2440"); // Partly Sheltered
    expect(getShapeOverlayTint(bed, makeCtx({ showWind: true, allShapes: [bed, wall, wall2] }))).toBe("#10b98140"); // Sheltered
  });
});

describe("getShapeOverlayTint — pH", () => {
  const shape = makeShape();
  const ctxFor = (ph: number | null) => makeCtx({ showPh: true, areaPh: { "area-1": ph } });

  it("maps pH bands acidic → neutral → alkaline", () => {
    expect(getShapeOverlayTint(shape, ctxFor(4.8))).toBe("#dc262640");
    expect(getShapeOverlayTint(shape, ctxFor(6.0))).toBe("#fbbf2440");
    expect(getShapeOverlayTint(shape, ctxFor(7.0))).toBe("#94a3b833");
    expect(getShapeOverlayTint(shape, ctxFor(7.8))).toBe("#7dd3fc40");
    expect(getShapeOverlayTint(shape, ctxFor(8.5))).toBe("#3b82f640");
  });

  it("returns null when the area has no pH reading or the shape has no area", () => {
    expect(getShapeOverlayTint(shape, ctxFor(null))).toBeNull();
    expect(getShapeOverlayTint(makeShape({ area_id: null }), ctxFor(7.0))).toBeNull();
  });
});

describe("getShapeOverlayTint — moisture", () => {
  const shape = makeShape();
  const ctxFor = (m: number | null) => makeCtx({ showMoisture: true, areaMoisture: { "area-1": m } });

  it("maps dry / ideal / wet bands", () => {
    expect(getShapeOverlayTint(shape, ctxFor(15))).toBe("#fbbf2440");
    expect(getShapeOverlayTint(shape, ctxFor(45))).toBe("#10b98140");
    expect(getShapeOverlayTint(shape, ctxFor(75))).toBe("#3b82f640");
  });

  it("returns null without a reading", () => {
    expect(getShapeOverlayTint(shape, ctxFor(null))).toBeNull();
  });
});

describe("getShapeOverlayTint — priority + off state", () => {
  it("returns null when no overlay is active", () => {
    expect(getShapeOverlayTint(makeShape(), makeCtx())).toBeNull();
  });

  it("frost beats wind beats pH beats moisture (historical 2D if/else order)", () => {
    const shape = makeShape();
    const all = makeCtx({
      showFrost: true,
      showWind: true,
      showPh: true,
      showMoisture: true,
      forecast: forecastWithMin(-5),
      allShapes: [shape],
      areaPh: { "area-1": 7.0 },
      areaMoisture: { "area-1": 45 },
    });
    expect(getShapeOverlayTint(shape, all)).toBe("#dc262640"); // frost wins
    expect(getShapeOverlayTint(shape, { ...all, showFrost: false })).toBe("#ef444440"); // then wind
    expect(getShapeOverlayTint(shape, { ...all, showFrost: false, showWind: false })).toBe("#94a3b833"); // then pH
    expect(getShapeOverlayTint(shape, { ...all, showFrost: false, showWind: false, showPh: false })).toBe("#10b98140"); // then moisture
  });
});

describe("splitHexAlpha", () => {
  it("splits #rrggbbaa into colour + numeric opacity for three.js", () => {
    expect(splitHexAlpha("#dc262640")).toEqual({ color: "#dc2626", opacity: 0x40 / 255 });
    expect(splitHexAlpha("#94a3b833")).toEqual({ color: "#94a3b8", opacity: 0x33 / 255 });
  });

  it("falls back to the sun overlay opacity for plain 6-digit colours", () => {
    expect(splitHexAlpha("#fde68a")).toEqual({ color: "#fde68a", opacity: 0.45 });
  });
});

describe("sun time-aware (Live) tints", () => {
  it("lit uses the Full Sun colour, shade the Shade colour", () => {
    expect(getSunTimeTint(true)).toBe(SUN_LIT_COLOR);
    expect(getSunTimeTint(false)).toBe(SUN_SHADE_COLOR);
  });

  it("2D variant appends the Konva alpha suffix", () => {
    expect(getSunTimeTint2D(true)).toBe(SUN_LIT_COLOR + "66");
    expect(getSunTimeTint2D(false)).toBe(SUN_SHADE_COLOR + "66");
  });
});
