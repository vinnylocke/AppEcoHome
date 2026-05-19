import { describe, expect, it } from "vitest";
import { getPlantFamily, getRotationWarning } from "../../../src/constants/plantFamilies";
import {
  getShapeBounds,
  computeAlignmentGuides,
} from "../../../src/lib/garden/alignmentGuides";
import type { ShapeData } from "../../../src/components/GardenShapeProperties";

function rect(id: string, x: number, y: number, w: number, h: number): ShapeData {
  return {
    id, layout_id: "l", area_id: null,
    shape_type: "rect", label: null, color: "#000",
    x_m: x, y_m: y, width_m: w, height_m: h, radius_m: null, points: null,
    rotation: 0, z_index: 0, dashed: false, extrude_m: 0.3, preset_id: null,
  };
}

describe("plantFamilies", () => {
  it("maps common Solanaceae names", () => {
    expect(getPlantFamily("Tomato")).toBe("Solanaceae");
    expect(getPlantFamily("Bell pepper")).toBe("Solanaceae");
    expect(getPlantFamily("Aubergine")).toBe("Solanaceae");
    expect(getPlantFamily("Potato")).toBe("Solanaceae");
  });

  it("maps Brassicaceae variants", () => {
    expect(getPlantFamily("Broccoli")).toBe("Brassicaceae");
    expect(getPlantFamily("Cabbage")).toBe("Brassicaceae");
    expect(getPlantFamily("Pak Choi")).toBe("Brassicaceae");
  });

  it("maps herb family", () => {
    expect(getPlantFamily("Basil")).toBe("Lamiaceae");
    expect(getPlantFamily("Rosemary")).toBe("Lamiaceae");
  });

  it("returns Other for unknowns and null", () => {
    expect(getPlantFamily(null)).toBe("Other");
    expect(getPlantFamily("Quokka grass")).toBe("Other");
  });

  it("provides rotation guidance for major families", () => {
    expect(getRotationWarning("Solanaceae")).toContain("deplete");
    expect(getRotationWarning("Brassicaceae")).toContain("club-root");
    expect(getRotationWarning("Other")).toBeNull();
  });
});

describe("alignmentGuides", () => {
  it("returns bounds for rectangles", () => {
    const b = getShapeBounds(rect("a", 1, 2, 4, 3));
    expect(b).toMatchObject({ minX: 1, maxX: 5, minY: 2, maxY: 5, centerX: 3, centerY: 3.5 });
  });

  it("finds centre-alignment between two rectangles", () => {
    const dragged = getShapeBounds(rect("a", 0, 0, 2, 2))!;
    // Far away on both axes, no edges line up
    const others = [rect("b", 100, 100, 2, 2)];
    expect(computeAlignmentGuides(dragged, others)).toHaveLength(0);

    // Now centre-align: dragged centre (1,1), other at (10, 0) with centre (11, 1)
    const others2 = [rect("c", 10, 0, 2, 2)];
    const guides = computeAlignmentGuides(dragged, others2);
    // Both shapes have centerY = 1, so a horizontal (y) guide at 1 should appear
    expect(guides.some(g => g.axis === "y" && Math.abs(g.position - 1) < 0.01)).toBe(true);
  });

  it("finds edge alignment within tolerance", () => {
    const dragged = getShapeBounds(rect("a", 0.05, 0, 2, 2))!; // minX ≈ 0.05
    const others = [rect("b", 0, 5, 2, 2)]; // minX = 0
    const guides = computeAlignmentGuides(dragged, others);
    // dragged.minX (0.05) ≈ other.minX (0) within 0.15 tolerance → x-guide at 0
    expect(guides.some(g => g.axis === "x" && g.position === 0)).toBe(true);
  });

  it("deduplicates guides at the same position", () => {
    const dragged = getShapeBounds(rect("a", 0, 0, 2, 2))!;
    const others = [
      rect("b", 0, 5, 2, 2),  // shares minX with dragged
      rect("c", 0, 10, 2, 2), // shares minX with dragged
    ];
    const guides = computeAlignmentGuides(dragged, others);
    const xGuidesAtZero = guides.filter(g => g.axis === "x" && g.position === 0);
    expect(xGuidesAtZero).toHaveLength(1);
  });
});
