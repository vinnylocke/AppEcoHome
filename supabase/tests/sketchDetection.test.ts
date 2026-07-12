import { assertEquals } from "@std/assert";
import {
  DETECTED_KINDS,
  MAX_POLYGON_POINTS,
  MAX_SHAPES,
  validateDetection,
  validateGeometry,
} from "@shared/sketchDetection.ts";

// ─── validateGeometry ────────────────────────────────────────────────────────

Deno.test("SD-001: valid rect (x/y/w/h in 0..1) is returned unchanged", () => {
  const g = validateGeometry({ type: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assertEquals(g, { type: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
});

Deno.test("SD-002: valid ellipse (x/y/w/h in 0..1) is returned unchanged", () => {
  const g = validateGeometry({ type: "ellipse", x: 0.05, y: 0.15, w: 0.25, h: 0.35 });
  assertEquals(g, { type: "ellipse", x: 0.05, y: 0.15, w: 0.25, h: 0.35 });
});

Deno.test("SD-003: valid circle (cx/cy/r) is returned unchanged", () => {
  const g = validateGeometry({ type: "circle", cx: 0.5, cy: 0.5, r: 0.1 });
  assertEquals(g, { type: "circle", cx: 0.5, cy: 0.5, r: 0.1 });
});

Deno.test("SD-004: polygon with >=3 points is returned, each point clamped to 0..1", () => {
  const g = validateGeometry({
    type: "polygon",
    points: [
      { x: -0.5, y: 0.2 },
      { x: 0.5, y: 1.5 },
      { x: 0.9, y: 0.9 },
    ],
  });
  assertEquals(g, {
    type: "polygon",
    points: [
      { x: 0, y: 0.2 },
      { x: 0.5, y: 1 },
      { x: 0.9, y: 0.9 },
    ],
  });
});

Deno.test("SD-005: rect with w=0 or h=0 is dropped (zero area)", () => {
  assertEquals(validateGeometry({ type: "rect", x: 0.1, y: 0.1, w: 0, h: 0.5 }), null);
  assertEquals(validateGeometry({ type: "rect", x: 0.1, y: 0.1, w: 0.5, h: 0 }), null);
});

Deno.test("SD-006: circle with r=0 is dropped", () => {
  assertEquals(validateGeometry({ type: "circle", cx: 0.5, cy: 0.5, r: 0 }), null);
});

Deno.test("SD-007: polygon with only 2 points is dropped", () => {
  assertEquals(
    validateGeometry({
      type: "polygon",
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    }),
    null,
  );
});

Deno.test("SD-008: polygon with more than MAX_POLYGON_POINTS is truncated", () => {
  const points = Array.from({ length: MAX_POLYGON_POINTS + 10 }, (_, i) => ({
    x: (i % 10) / 10,
    y: (i % 10) / 10,
  }));
  const g = validateGeometry({ type: "polygon", points }) as { type: "polygon"; points: unknown[] };
  assertEquals(g.type, "polygon");
  assertEquals(g.points.length, MAX_POLYGON_POINTS);
});

Deno.test("SD-009: unknown geometry type is dropped", () => {
  assertEquals(validateGeometry({ type: "blob", x: 0.1, y: 0.1, w: 0.1, h: 0.1 }), null);
});

Deno.test("SD-010: out-of-range coords are clamped to 0..1", () => {
  const g = validateGeometry({ type: "rect", x: 1.5, y: -0.3, w: 0.5, h: 0.5 });
  assertEquals(g, { type: "rect", x: 1, y: 0, w: 0.5, h: 0.5 });
});

// ─── validateDetection ───────────────────────────────────────────────────────

Deno.test("SD-020: well-formed object with a mix of valid shapes returns them all, preserving order", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 0.7 },
    shapes: [
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      { detected_kind: "pond", geometry: { type: "circle", cx: 0.5, cy: 0.5, r: 0.1 } },
      {
        detected_kind: "l_shape_bed",
        geometry: {
          type: "polygon",
          points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
        },
      },
    ],
  })!;
  assertEquals(result.shapes.length, 3);
  assertEquals(result.shapes.map((s) => s.detected_kind), ["raised_bed", "pond", "l_shape_bed"]);
});

Deno.test("SD-021: detected_kind not in DETECTED_KINDS is coerced to unknown (shape kept)", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes: [
      { detected_kind: "swimming_pool", geometry: { type: "circle", cx: 0.5, cy: 0.5, r: 0.2 } },
    ],
  })!;
  assertEquals(result.shapes.length, 1);
  assertEquals(result.shapes[0].detected_kind, "unknown");
});

Deno.test("SD-022: a valid detected_kind is preserved", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes: [
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    ],
  })!;
  assertEquals(result.shapes[0].detected_kind, "raised_bed");
  assertEquals((DETECTED_KINDS as readonly string[]).includes("raised_bed"), true);
});

Deno.test("SD-023: shapes with degenerate geometry are dropped from the result", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes: [
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0, h: 0.5 } }, // zero area
      { detected_kind: "shed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, // valid
    ],
  })!;
  assertEquals(result.shapes.length, 1);
  assertEquals(result.shapes[0].detected_kind, "shed");
});

Deno.test("SD-024: more than MAX_SHAPES shapes are capped at MAX_SHAPES", () => {
  const shapes = Array.from({ length: MAX_SHAPES + 15 }, () => ({
    detected_kind: "unknown",
    geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
  }));
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes,
  })!;
  assertEquals(result.shapes.length, MAX_SHAPES);
});

Deno.test("SD-025: confidence missing defaults to 0.5; out-of-range values clamp to 0..1", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes: [
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, confidence: 1.7 },
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, confidence: -0.2 },
    ],
  })!;
  assertEquals(result.shapes[0].confidence, 0.5);
  assertEquals(result.shapes[1].confidence, 1);
  assertEquals(result.shapes[2].confidence, 0);
});

Deno.test("SD-026: label_guess — blank becomes null, long labels truncate to <=60 chars", () => {
  const long = "x".repeat(200);
  const result = validateDetection({
    garden_outline: { width_ratio: 1, height_ratio: 1 },
    shapes: [
      { detected_kind: "shed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label_guess: "" },
      { detected_kind: "shed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label_guess: "   " },
      { detected_kind: "shed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label_guess: long },
    ],
  })!;
  assertEquals(result.shapes[0].label_guess, null);
  assertEquals(result.shapes[1].label_guess, null);
  assertEquals(result.shapes[2].label_guess!.length <= 60, true);
});

Deno.test("SD-027: garden_outline missing or with non-positive ratios defaults both to 1", () => {
  const missing = validateDetection({ shapes: [] })!;
  assertEquals(missing.garden_outline, { width_ratio: 1, height_ratio: 1 });

  const nonPositive = validateDetection({
    garden_outline: { width_ratio: 0, height_ratio: -5 },
    shapes: [],
  })!;
  assertEquals(nonPositive.garden_outline, { width_ratio: 1, height_ratio: 1 });
});

Deno.test("SD-028: structurally-broken input returns null (null, non-object, no shapes array)", () => {
  assertEquals(validateDetection(null), null);
  assertEquals(validateDetection("x"), null);
  assertEquals(validateDetection({ garden_outline: { width_ratio: 1, height_ratio: 1 } }), null);
});

Deno.test("SD-029: readable-but-empty (all shapes degenerate) returns { garden_outline, shapes: [] }, not null", () => {
  const result = validateDetection({
    garden_outline: { width_ratio: 1.2, height_ratio: 0.8 },
    shapes: [
      { detected_kind: "raised_bed", geometry: { type: "rect", x: 0.1, y: 0.1, w: 0, h: 0 } },
      { detected_kind: "pond", geometry: { type: "circle", cx: 0.5, cy: 0.5, r: 0 } },
    ],
  });
  assertEquals(result, { garden_outline: { width_ratio: 1.2, height_ratio: 0.8 }, shapes: [] });
});
