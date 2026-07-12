// Sketch → Layout: server-side detection contract + hardening.
//
// The `sketch-to-layout` edge fn sends a hand-drawn TOP-DOWN garden sketch to
// Gemini Vision with DETECTION_SCHEMA and gets back NORMALIZED geometry (every
// coordinate 0..1, relative to the sketch's own bounds — a scaleless sketch
// cannot yield real metres; the wizard sets the real scale later).
//
// `validateDetection` is the closed-vocabulary hardening pass (mirrors
// scanJournalPhotos.validateObservation): it drops off-vocabulary kinds, clamps
// every ratio to 0..1, discards degenerate/zero-area shapes, caps the count, and
// returns null when the response is structurally unusable. The client then maps
// the validated detection to `garden_shapes` rows via
// `src/lib/garden/sketchToShapes.ts` (client-side — it needs the editor's metre
// conventions, and the wizard writes the layout so RLS + the offline queue
// behave exactly like the editor).

// ── Closed vocabulary of kinds the model may return. Anything else → dropped
//    to "unknown" (a plain rect the user re-classifies in the wizard). ──
export const DETECTED_KINDS = [
  "raised_bed", "planter_box", "round_planter", "oval_bed", "l_shape_bed",
  "greenhouse", "shed", "path", "fence", "wall",
  "pond", "tree", "lawn", "boundary", "unknown",
] as const;
export type DetectedKind = typeof DETECTED_KINDS[number];

// Canonical garden_shapes.shape_type values the 2D/3D renderers understand.
// MUST match the CHECK constraint in 20260708120000_garden_shapes_type_check.sql
// — the editors SILENTLY DROP any shape whose type is outside this set. Detection
// never produces "path" (that's a hand-drawn line primitive, not a region), so
// the detectable subset is rect | ellipse | circle | polygon.
export const DETECTABLE_SHAPE_TYPES = ["rect", "ellipse", "circle", "polygon"] as const;
export type DetectableShapeType = typeof DETECTABLE_SHAPE_TYPES[number];

// Caps — keep a noisy sketch from producing an unusable pile of shapes.
export const MAX_SHAPES = 40;
export const MAX_POLYGON_POINTS = 24;
const MAX_LABEL_LEN = 60;

// ── Gemini responseSchema (uppercase dialect, like OVERHAUL_SCHEMA). ──
// `detected_kind` and `geometry.type` are loose STRING here on purpose — the
// prompt lists the allowed values and validateDetection is the real guard
// (same pattern as scan-journal-photos). Geometry is a flat superset of fields
// because Gemini's schema does not model discriminated unions well; the
// validator reads the fields that match `type`.
export const DETECTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    garden_outline: {
      type: "OBJECT",
      properties: {
        width_ratio: { type: "NUMBER" },
        height_ratio: { type: "NUMBER" },
      },
      required: ["width_ratio", "height_ratio"],
    },
    shapes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          detected_kind: { type: "STRING" },
          geometry: {
            type: "OBJECT",
            properties: {
              type: { type: "STRING" }, // rect | ellipse | circle | polygon
              x: { type: "NUMBER" },
              y: { type: "NUMBER" },
              w: { type: "NUMBER" },
              h: { type: "NUMBER" },
              cx: { type: "NUMBER" },
              cy: { type: "NUMBER" },
              r: { type: "NUMBER" },
              points: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    x: { type: "NUMBER" },
                    y: { type: "NUMBER" },
                  },
                  required: ["x", "y"],
                },
              },
            },
            required: ["type"],
          },
          label_guess: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["detected_kind", "geometry"],
      },
    },
  },
  required: ["garden_outline", "shapes"],
};

// ── Validated (post-hardening) types. All coordinates normalized 0..1. ──
export type ValidatedGeometry =
  | { type: "rect" | "ellipse"; x: number; y: number; w: number; h: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "polygon"; points: Array<{ x: number; y: number }> };

export interface ValidatedShape {
  detected_kind: DetectedKind;
  geometry: ValidatedGeometry;
  label_guess: string | null;
  confidence: number; // 0..1
}

export interface ValidatedDetection {
  /** Sketch aspect — width_ratio / height_ratio drive the canvas aspect in the
   *  scale step. Both > 0; default 1 (square) when the model omits them. */
  garden_outline: { width_ratio: number; height_ratio: number };
  shapes: ValidatedShape[];
}

const clamp01 = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

function clampLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_LABEL_LEN ? t.slice(0, MAX_LABEL_LEN) : t;
}

function clampAspect(n: unknown): number {
  // Aspect components are relative, not absolute — anything finite and positive
  // is fine; clamp to a sane band so a stray 0 or 9999 can't blow up the canvas.
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.05, Math.min(20, n));
}

/**
 * Normalize + validate one raw geometry object. Returns a ValidatedGeometry, or
 * null when the shape is unrenderable (unknown type, zero area, too few points)
 * and should be dropped entirely.
 */
export function validateGeometry(raw: any): ValidatedGeometry | null {
  const type = raw?.type;
  if (type === "rect" || type === "ellipse") {
    const x = clamp01(raw.x), y = clamp01(raw.y);
    const w = clamp01(raw.w), h = clamp01(raw.h);
    if (w <= 0 || h <= 0) return null; // zero-area → drop
    return { type, x, y, w, h };
  }
  if (type === "circle") {
    const cx = clamp01(raw.cx), cy = clamp01(raw.cy), r = clamp01(raw.r);
    if (r <= 0) return null;
    return { type, cx, cy, r };
  }
  if (type === "polygon") {
    const rawPoints = Array.isArray(raw.points) ? raw.points : [];
    const points: Array<{ x: number; y: number }> = [];
    for (const p of rawPoints) {
      if (points.length >= MAX_POLYGON_POINTS) break;
      if (typeof p?.x !== "number" || typeof p?.y !== "number") continue;
      points.push({ x: clamp01(p.x), y: clamp01(p.y) });
    }
    if (points.length < 3) return null; // not a polygon → drop
    return { type: "polygon", points };
  }
  return null; // unknown geometry type → drop the shape
}

/**
 * Harden the raw Gemini detection response. Closed-vocabulary, clamped, capped.
 * Returns null only when the response is structurally unusable (not an object,
 * no shapes array). A structurally-valid response whose shapes all drop out
 * returns `{ garden_outline, shapes: [] }` so the wizard can offer "add shapes
 * manually" rather than failing outright.
 */
export function validateDetection(parsed: any): ValidatedDetection | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (!Array.isArray(parsed.shapes)) return null;

  const outline = parsed.garden_outline ?? {};
  const garden_outline = {
    width_ratio: clampAspect(outline.width_ratio),
    height_ratio: clampAspect(outline.height_ratio),
  };

  const shapes: ValidatedShape[] = [];
  for (const raw of parsed.shapes) {
    if (shapes.length >= MAX_SHAPES) break;
    const geometry = validateGeometry(raw?.geometry);
    if (!geometry) continue;
    const detected_kind: DetectedKind =
      (DETECTED_KINDS as readonly string[]).includes(raw?.detected_kind)
        ? raw.detected_kind
        : "unknown";
    const confidence = typeof raw?.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5;
    shapes.push({
      detected_kind,
      geometry,
      label_guess: clampLabel(raw?.label_guess),
      confidence,
    });
  }

  return { garden_outline, shapes };
}
