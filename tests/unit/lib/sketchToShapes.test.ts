import { describe, test, expect } from "vitest";
import {
  computeCanvasSize,
  normalizedWidthOf,
  gardenWidthFromShapeWidth,
  detectionToShapes,
  KIND_TO_PRESET_ID,
  MAX_CANVAS_M,
  type ClassifiedShape,
  type ResolvedPreset,
} from "../../../src/lib/garden/sketchToShapes";

// Sketch → Layout wizard: turns a normalized (0..1) AI detection into
// garden_shapes row drafts in metres. These tests pin the metre conventions
// (verified against GardenLayoutEditor.commitDraw) so a future refactor
// can't silently swap axis scale or drop a field the editor's insert
// contract relies on.

describe("computeCanvasSize", () => {
  test("derives height from the outline aspect ratio", () => {
    const size = computeCanvasSize({ width_ratio: 1, height_ratio: 0.5 }, 20);
    expect(size).toEqual({ canvas_w_m: 20, canvas_h_m: 10 });
  });

  test("garden width 0 falls back to a default rather than 0", () => {
    const size = computeCanvasSize({ width_ratio: 1, height_ratio: 0.5 }, 0);
    expect(size.canvas_w_m).toBeGreaterThan(0);
  });

  test("an absurd garden width clamps to MAX_CANVAS_M", () => {
    const size = computeCanvasSize({ width_ratio: 1, height_ratio: 0.5 }, 9999);
    expect(size.canvas_w_m).toBe(MAX_CANVAS_M);
  });

  test("invalid (zero/negative) ratios fall back to a default aspect", () => {
    const zero = computeCanvasSize({ width_ratio: 0, height_ratio: 0 }, 20);
    expect(Number.isFinite(zero.canvas_h_m)).toBe(true);
    expect(zero.canvas_h_m).toBeGreaterThan(0);

    const negative = computeCanvasSize({ width_ratio: -1, height_ratio: -1 }, 20);
    expect(Number.isFinite(negative.canvas_h_m)).toBe(true);
    expect(negative.canvas_h_m).toBeGreaterThan(0);
  });
});

describe("normalizedWidthOf", () => {
  test("rect uses w", () => {
    expect(normalizedWidthOf({ type: "rect", x: 0.1, y: 0.1, w: 0.4, h: 0.3 })).toBe(0.4);
  });

  test("circle uses diameter (2 × r)", () => {
    expect(normalizedWidthOf({ type: "circle", cx: 0.5, cy: 0.5, r: 0.2 })).toBe(0.4);
  });

  test("polygon uses the bounding-box width across points", () => {
    const width = normalizedWidthOf({
      type: "polygon",
      points: [
        { x: 0.1, y: 0 },
        { x: 0.6, y: 0 },
        { x: 0.6, y: 0.5 },
      ],
    });
    expect(width).toBe(0.5);
  });
});

describe("gardenWidthFromShapeWidth", () => {
  test("derives whole-garden width from a shape's known real width", () => {
    expect(gardenWidthFromShapeWidth(2, 0.1)).toBe(20);
  });

  test("guards against a zero normalized width by returning the reference unchanged", () => {
    expect(gardenWidthFromShapeWidth(5, 0)).toBe(5);
  });
});

describe("detectionToShapes", () => {
  const canvas = { canvas_w_m: 20, canvas_h_m: 10 };
  const preset: ResolvedPreset = {
    id: "raised-bed",
    color: "#4ade80",
    extrude_m: 0.3,
    dashed: false,
  };

  function makeItem(geometry: ClassifiedShape["geometry"]): ClassifiedShape {
    return { geometry, preset, label: "x", area_id: null };
  }

  test("rect: x_m/y_m are top-left, width_m/height_m are extents (per-axis scale)", () => {
    const [draft] = detectionToShapes(
      [makeItem({ type: "rect", x: 0.1, y: 0.2, w: 0.5, h: 0.5 })],
      canvas,
    );
    expect(draft.shape_type).toBe("rect");
    expect(draft.x_m).toBe(2);
    expect(draft.y_m).toBe(2);
    expect(draft.width_m).toBe(10);
    expect(draft.height_m).toBe(5);
  });

  test("ellipse: x_m/y_m are centre, width_m/height_m are full diameters", () => {
    const [draft] = detectionToShapes(
      [makeItem({ type: "ellipse", x: 0, y: 0, w: 0.5, h: 0.5 })],
      canvas,
    );
    expect(draft.shape_type).toBe("ellipse");
    expect(draft.x_m).toBe(5);
    expect(draft.y_m).toBe(2.5);
    expect(draft.width_m).toBe(10);
    expect(draft.height_m).toBe(5);
  });

  test("circle: x_m/y_m are centre, radius_m uses the x-axis scale", () => {
    const [draft] = detectionToShapes(
      [makeItem({ type: "circle", cx: 0.5, cy: 0.5, r: 0.25 })],
      canvas,
    );
    expect(draft.shape_type).toBe("circle");
    expect(draft.x_m).toBe(10);
    expect(draft.y_m).toBe(5);
    expect(draft.radius_m).toBe(5);
  });

  test("polygon: origin 0,0; points scaled per-axis", () => {
    const [draft] = detectionToShapes(
      [
        makeItem({
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 0.5 },
          ],
        }),
      ],
      canvas,
    );
    expect(draft.shape_type).toBe("polygon");
    expect(draft.x_m).toBe(0);
    expect(draft.y_m).toBe(0);
    expect(draft.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  test("each draft carries the resolved preset's fields, rotation 0, and its index as z_index", () => {
    const items: ClassifiedShape[] = [
      makeItem({ type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
      makeItem({ type: "circle", cx: 0.5, cy: 0.5, r: 0.1 }),
    ];
    const drafts = detectionToShapes(items, canvas);

    drafts.forEach((draft, i) => {
      expect(draft.color).toBe(preset.color);
      expect(draft.extrude_m).toBe(preset.extrude_m);
      expect(draft.dashed).toBe(preset.dashed);
      expect(draft.preset_id).toBe(preset.id);
      expect(draft.rotation).toBe(0);
      expect(draft.z_index).toBe(i);
    });
  });
});

describe("KIND_TO_PRESET_ID", () => {
  const expectedKinds = [
    "raised_bed",
    "planter_box",
    "round_planter",
    "oval_bed",
    "l_shape_bed",
    "greenhouse",
    "shed",
    "path",
    "fence",
    "wall",
    "pond",
    "tree",
    "lawn",
    "boundary",
    "unknown",
  ];

  test.each(expectedKinds)("has a mapping entry for kind '%s'", (kind) => {
    expect(kind in KIND_TO_PRESET_ID).toBe(true);
  });

  test("lawn and unknown map to null (no default preset)", () => {
    expect(KIND_TO_PRESET_ID.lawn).toBeNull();
    expect(KIND_TO_PRESET_ID.unknown).toBeNull();
  });
});
