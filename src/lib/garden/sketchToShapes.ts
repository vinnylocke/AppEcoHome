// Client-side mapping for the Sketch → Layout wizard: turns the edge fn's
// validated, NORMALIZED (0..1) detection into garden_shapes row drafts in
// METRES, using the same conventions as the editor's commitDraw so the wizard
// inserts shapes through the identical contract (RLS + offline queue).
//
// Metre conventions (verified against GardenLayoutEditor.commitDraw):
//   rect    → x_m,y_m = top-left;  width_m,height_m = extents
//   ellipse → x_m,y_m = centre;    width_m,height_m = full diameters
//   circle  → x_m,y_m = centre;    radius_m
//   polygon → x_m,y_m = 0 origin;  points = metre vertices
//
// The geometry.type (from the AI — we have exact coords for it, and every type
// is CHECK-valid) drives shape_type. The chosen preset supplies
// preset_id/color/extrude_m/dashed. KIND_TO_PRESET_ID gives the wizard a
// default preset per detected kind; the user can re-pick from the full
// GardenShapePanel catalogue.

// Normalized geometry from the edge fn (mirror of the Deno-side ValidatedGeometry
// — the two runtimes can't share a module, so the shape is re-declared here).
export type SketchGeometry =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "ellipse"; x: number; y: number; w: number; h: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "polygon"; points: Array<{ x: number; y: number }> };

export interface SketchDetectedShape {
  detected_kind: string;
  geometry: SketchGeometry;
  label_guess: string | null;
  confidence: number;
}

export interface SketchDetection {
  garden_outline: { width_ratio: number; height_ratio: number };
  shapes: SketchDetectedShape[];
}

// detected_kind → default preset id (mirrors GardenShapePanel's catalogue).
// null = no preset (lawn / unknown render as a plain rect the user re-types).
export const KIND_TO_PRESET_ID: Record<string, string | null> = {
  raised_bed: "raised-bed",
  planter_box: "planter-box",
  round_planter: "round-planter",
  oval_bed: "oval-bed",
  l_shape_bed: "l-shape",
  greenhouse: "greenhouse",
  shed: "shed",
  path: "path",
  fence: "fence-panel",
  wall: "wall",
  pond: "pond",
  tree: "tree-canopy",
  boundary: "garden-boundary",
  lawn: null,
  unknown: null,
};

// Canvas bounds (metres) — keep a stray scale input from producing an absurd
// canvas. Mirrors the editor's sane range.
export const MIN_CANVAS_M = 1;
export const MAX_CANVAS_M = 200;
// Any single dimension floors here (10 cm) — matches commitDraw's `minM`.
const MIN_DIM_M = 0.1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function clampCanvas(m: number): number {
  return Math.max(MIN_CANVAS_M, Math.min(MAX_CANVAS_M, m));
}

/**
 * Resolve the real canvas size from the sketch aspect + one reference: the
 * user's whole-garden width in metres. Height is derived from the detected
 * aspect (height_ratio / width_ratio).
 */
export function computeCanvasSize(
  outline: { width_ratio: number; height_ratio: number },
  gardenWidthM: number,
): { canvas_w_m: number; canvas_h_m: number } {
  const w = clampCanvas(gardenWidthM > 0 ? gardenWidthM : 30);
  const aspect =
    outline.width_ratio > 0 && outline.height_ratio > 0
      ? outline.height_ratio / outline.width_ratio
      : 20 / 30;
  return {
    canvas_w_m: round2(w),
    canvas_h_m: round2(clampCanvas(w * aspect)),
  };
}

/** Normalized bounding-box width of a shape (0..1). Used by the "tap a shape,
 *  enter its real size" scale mode. */
export function normalizedWidthOf(geometry: SketchGeometry): number {
  if (geometry.type === "circle") return geometry.r * 2;
  if (geometry.type === "rect" || geometry.type === "ellipse") return geometry.w;
  const xs = geometry.points.map((p) => p.x);
  return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
}

/** "This shape is N metres wide" → the implied whole-garden width, so both scale
 *  modes funnel through computeCanvasSize. */
export function gardenWidthFromShapeWidth(
  referenceWidthM: number,
  shapeNormalizedWidth: number,
): number {
  if (shapeNormalizedWidth <= 0) return referenceWidthM;
  return referenceWidthM / shapeNormalizedWidth;
}

// A resolved preset (subset of GardenShapePanel's preset, passed in by the
// wizard so this module stays decoupled from the React catalogue).
export interface ResolvedPreset {
  id: string | null; // preset_id
  color: string;
  extrude_m: number | null;
  dashed: boolean;
}

// The per-shape classification the wizard hands in (user may have re-picked
// preset / relabelled / linked an area).
export interface ClassifiedShape {
  geometry: SketchGeometry;
  preset: ResolvedPreset;
  label: string | null;
  area_id: string | null;
}

// A garden_shapes row draft — everything except id/layout_id, which the wizard
// assigns at insert. Matches the editor's insert contract (triggerSave).
export interface SketchShapeDraft {
  area_id: string | null;
  shape_type: "rect" | "ellipse" | "circle" | "polygon";
  label: string | null;
  color: string;
  x_m: number;
  y_m: number;
  width_m: number | null;
  height_m: number | null;
  radius_m: number | null;
  points: Array<{ x: number; y: number }> | null;
  rotation: number;
  z_index: number;
  dashed: boolean;
  extrude_m: number | null;
  preset_id: string | null;
}

/**
 * Map classified (normalized) shapes → garden_shapes row drafts in metres.
 * Per-axis scale (x by canvas_w_m, y by canvas_h_m). Circle radius uses the
 * x-axis scale — a round region can only carry one radius, so a very non-square
 * garden distorts it slightly; adjustable in-editor.
 */
export function detectionToShapes(
  items: ClassifiedShape[],
  canvas: { canvas_w_m: number; canvas_h_m: number },
): SketchShapeDraft[] {
  const sx = canvas.canvas_w_m;
  const sy = canvas.canvas_h_m;

  return items.map((item, i) => {
    const { geometry, preset } = item;
    const common = {
      area_id: item.area_id,
      label: item.label,
      color: preset.color,
      rotation: 0,
      z_index: i,
      dashed: preset.dashed,
      extrude_m: preset.extrude_m,
      preset_id: preset.id,
    };

    if (geometry.type === "circle") {
      return {
        ...common,
        shape_type: "circle" as const,
        x_m: round3(geometry.cx * sx),
        y_m: round3(geometry.cy * sy),
        width_m: null,
        height_m: null,
        radius_m: round3(Math.max(MIN_DIM_M, geometry.r * sx)),
        points: null,
      };
    }
    if (geometry.type === "ellipse") {
      // editor stores ellipse by centre + full diameters
      return {
        ...common,
        shape_type: "ellipse" as const,
        x_m: round3((geometry.x + geometry.w / 2) * sx),
        y_m: round3((geometry.y + geometry.h / 2) * sy),
        width_m: round3(Math.max(MIN_DIM_M, geometry.w * sx)),
        height_m: round3(Math.max(MIN_DIM_M, geometry.h * sy)),
        radius_m: null,
        points: null,
      };
    }
    if (geometry.type === "rect") {
      return {
        ...common,
        shape_type: "rect" as const,
        x_m: round3(geometry.x * sx),
        y_m: round3(geometry.y * sy),
        width_m: round3(Math.max(MIN_DIM_M, geometry.w * sx)),
        height_m: round3(Math.max(MIN_DIM_M, geometry.h * sy)),
        radius_m: null,
        points: null,
      };
    }
    // polygon — origin 0,0; points as absolute metre vertices
    return {
      ...common,
      shape_type: "polygon" as const,
      x_m: 0,
      y_m: 0,
      width_m: null,
      height_m: null,
      radius_m: null,
      points: geometry.points.map((p) => ({
        x: round3(p.x * sx),
        y: round3(p.y * sy),
      })),
    };
  });
}
