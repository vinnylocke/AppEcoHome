import { describe, expect, it } from "vitest";
import {
  parsePlantSunPreference,
  getPlantSunFit,
  getShapeFitSummary,
} from "../../../src/lib/garden/sunFit";
import {
  computeTokenGrid,
  getPlantTokenColor,
  getPlantInitial,
  MAX_VISIBLE_TOKENS,
} from "../../../src/lib/garden/plantTokens";
import {
  classifyFrostRisk,
  computeWindExposure,
} from "../../../src/lib/garden/microclimate";
import {
  getCompanionRelation,
  getCompanionRelationForGroups,
} from "../../../src/constants/companionPlants";
import type { ShapeData } from "../../../src/components/GardenShapeProperties";

describe("sunFit", () => {
  it("parses common sunlight strings to internal enum", () => {
    expect(parsePlantSunPreference("Full Sun")).toBe("Full Sun");
    expect(parsePlantSunPreference("full_sun")).toBe("Full Sun");
    expect(parsePlantSunPreference("Partial Shade")).toBe("Partly Shady");
    expect(parsePlantSunPreference("DAPPLED")).toBe("Partly Shady");
    expect(parsePlantSunPreference("shade")).toBe("Shade");
    expect(parsePlantSunPreference(null)).toBe("Unknown");
    expect(parsePlantSunPreference("")).toBe("Unknown");
    expect(parsePlantSunPreference("filtered sun")).toBe("Partly Sunny");
  });

  it("returns Match when plant preference equals shape class", () => {
    expect(getPlantSunFit("Full Sun", "Full Sun")).toBe("Match");
    expect(getPlantSunFit("Shade", "Shade")).toBe("Match");
  });

  it("returns Adjacent when one step away", () => {
    expect(getPlantSunFit("Full Sun", "Partly Sunny")).toBe("AdjacentShadier");
    expect(getPlantSunFit("Partly Shady", "Partly Sunny")).toBe("AdjacentDrier");
  });

  it("returns Mismatch when two or more steps away", () => {
    expect(getPlantSunFit("Full Sun", "Partly Shady")).toBe("Mismatch");
    expect(getPlantSunFit("Shade", "Full Sun")).toBe("Mismatch");
  });

  it("returns Unknown when preference is unknown", () => {
    expect(getPlantSunFit("Unknown", "Full Sun")).toBe("Unknown");
  });

  it("aggregates a shape fit summary", () => {
    expect(getShapeFitSummary([])).toBe("unknown");
    expect(getShapeFitSummary(["Unknown", "Unknown"])).toBe("unknown");
    expect(getShapeFitSummary(["Match", "Match"])).toBe("fit");
    expect(getShapeFitSummary(["Match", "AdjacentShadier"])).toBe("fit");
    expect(getShapeFitSummary(["Match", "Mismatch", "Mismatch"])).toBe("mismatch");
    expect(getShapeFitSummary(["Match", "Mismatch"])).toBe("mixed");
  });
});

describe("plantTokens", () => {
  const samplePlant = { id: "p1", plant_name: "Tomato", nickname: null, plant_id: null };

  it("returns stable hash-based colours", () => {
    const c1 = getPlantTokenColor(samplePlant);
    const c2 = getPlantTokenColor(samplePlant);
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns different colours for different plants", () => {
    const a = getPlantTokenColor({ ...samplePlant, plant_name: "Tomato" });
    const b = getPlantTokenColor({ ...samplePlant, plant_name: "Sage" });
    expect(a).not.toBe(b);
  });

  it("picks the first letter as initial", () => {
    expect(getPlantInitial({ ...samplePlant, plant_name: "tomato" })).toBe("T");
    expect(getPlantInitial({ ...samplePlant, nickname: "Big Red" })).toBe("B");
  });

  it("computes a token grid that fits the box", () => {
    const g = computeTokenGrid(5, 2, 1);
    expect(g.positions.length).toBe(5);
    expect(g.cols).toBeGreaterThanOrEqual(1);
    expect(g.rows).toBeGreaterThanOrEqual(1);
    expect(g.diameterM).toBeGreaterThan(0);
    for (const p of g.positions) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(2);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
  });

  it("exposes a sensible maximum", () => {
    expect(MAX_VISIBLE_TOKENS).toBeGreaterThanOrEqual(4);
    expect(MAX_VISIBLE_TOKENS).toBeLessThanOrEqual(12);
  });
});

describe("microclimate", () => {
  it("classifies frost risk based on overnight low", () => {
    expect(classifyFrostRisk(8)).toBe("None");
    expect(classifyFrostRisk(2)).toBe("Mild");
    expect(classifyFrostRisk(-1)).toBe("Moderate");
    expect(classifyFrostRisk(-5)).toBe("Severe");
  });

  it("treats nearby tall walls as sheltering", () => {
    const target: ShapeData = {
      id: "t", layout_id: "l", area_id: null, shape_type: "rect", label: null,
      color: "#000", x_m: 5, y_m: 5, width_m: 1, height_m: 1, radius_m: null,
      points: null, rotation: 0, z_index: 0, dashed: false, extrude_m: 0.3, preset_id: "raised-bed",
    };
    const wall: ShapeData = {
      ...target, id: "w", preset_id: "wall", x_m: 5.5, y_m: 5.5, width_m: 3, height_m: 0.2,
      extrude_m: 1.5,
    };
    const greenhouse: ShapeData = {
      ...target, id: "g", preset_id: "greenhouse", x_m: 6, y_m: 5, width_m: 2, height_m: 2,
      extrude_m: 2.5,
    };
    expect(computeWindExposure(target, [target])).toBe("Exposed");
    expect(computeWindExposure(target, [target, wall])).toBe("Partly Sheltered");
    expect(computeWindExposure(target, [target, wall, greenhouse])).toBe("Sheltered");
  });

  it("ignores low fences", () => {
    const target: ShapeData = {
      id: "t", layout_id: "l", area_id: null, shape_type: "rect", label: null,
      color: "#000", x_m: 5, y_m: 5, width_m: 1, height_m: 1, radius_m: null,
      points: null, rotation: 0, z_index: 0, dashed: false, extrude_m: 0.3, preset_id: "raised-bed",
    };
    const lowFence: ShapeData = {
      ...target, id: "f", preset_id: "fence-panel", x_m: 5.5, y_m: 5.5, width_m: 3, height_m: 0.15,
      extrude_m: 0.5,
    };
    expect(computeWindExposure(target, [target, lowFence])).toBe("Exposed");
  });
});

describe("companionPlants", () => {
  it("returns beneficial relations for well-known pairs", () => {
    expect(getCompanionRelation("tomato", "basil").relation).toBe("Beneficial");
    expect(getCompanionRelation("Tomato", "Basil").relation).toBe("Beneficial");
    expect(getCompanionRelation("tomatoes", "basil").relation).toBe("Beneficial");
  });

  it("returns harmful for known antagonists", () => {
    expect(getCompanionRelation("tomato", "fennel").relation).toBe("Harmful");
    expect(getCompanionRelation("bean", "onion").relation).toBe("Harmful");
  });

  it("returns neutral for unknown pairs", () => {
    expect(getCompanionRelation("zucchini", "broccoli").relation).toBe("Neutral");
    expect(getCompanionRelation("", "tomato").relation).toBe("Neutral");
  });

  it("group relation prefers harmful > beneficial > neutral", () => {
    expect(getCompanionRelationForGroups(["tomato"], ["basil"]).relation).toBe("Beneficial");
    // Mixed group — beneficial (tomato+basil) AND harmful (tomato+potato) → Harmful wins
    expect(getCompanionRelationForGroups(["tomato"], ["basil", "potato"]).relation).toBe("Harmful");
    expect(getCompanionRelationForGroups(["mystery"], ["unknown"]).relation).toBe("Neutral");
  });
});
