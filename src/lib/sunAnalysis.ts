import SunCalc from "suncalc";
import type { ShapeData } from "../components/GardenShapeProperties";

export type SunClass = "Full Sun" | "Partly Sunny" | "Partly Shady" | "Shade";

export const SUN_CLASS_COLOR: Record<SunClass, string> = {
  "Full Sun":     "#fde68a",
  "Partly Sunny": "#bbf7d0",
  "Partly Shady": "#bfdbfe",
  "Shade":        "#cbd5e1",
};

export const SUN_CLASS_TEXT_COLOR: Record<SunClass, string> = {
  "Full Sun":     "#92400e",
  "Partly Sunny": "#166534",
  "Partly Shady": "#1e40af",
  "Shade":        "#475569",
};

export interface ShapeSunResult {
  shapeId: string;
  sunHours: number;
  classification: SunClass;
}

export function getShapeCentre(shape: ShapeData): { x: number; z: number } {
  if (shape.shape_type === "polygon" && shape.points && shape.points.length > 0) {
    const n = shape.points.length;
    const cx = shape.points.reduce((s, p) => s + p.x, 0) / n;
    const cz = shape.points.reduce((s, p) => s + p.y, 0) / n;
    return { x: cx + shape.x_m, z: cz + shape.y_m };
  }
  if (shape.shape_type === "rect" || shape.shape_type === "path") {
    return {
      x: shape.x_m + (shape.width_m ?? 1) / 2,
      z: shape.y_m + (shape.height_m ?? 1) / 2,
    };
  }
  // circle, ellipse, tree-canopy — centre stored directly
  return { x: shape.x_m, z: shape.y_m };
}

function pointInPolygon(px: number, pz: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > pz) !== (yj > pz) && px < ((xj - xi) * (pz - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInBlockerShadow(
  px: number, pz: number,
  blocker: ShapeData,
  sceneAz: number, alt: number,
): boolean {
  const H = blocker.extrude_m ?? 0;
  if (H <= 0.05) return false;
  const shadowLen = H / Math.tan(alt);
  const ox = -Math.sin(sceneAz) * shadowLen;
  const oz = -Math.cos(sceneAz) * shadowLen;

  if (blocker.shape_type === "rect" || blocker.shape_type === "path") {
    const bx = blocker.x_m + ox;
    const bz = blocker.y_m + oz;
    const bw = blocker.width_m ?? 1;
    const bh = blocker.height_m ?? 1;
    return px >= bx && px <= bx + bw && pz >= bz && pz <= bz + bh;
  }

  if (blocker.shape_type === "circle" || blocker.preset_id === "tree-canopy") {
    const r = blocker.radius_m ?? 0.5;
    const dx = px - (blocker.x_m + ox);
    const dz = pz - (blocker.y_m + oz);
    // Tree canopies are spheres — their ground shadow is an ellipse that
    // stretches in the sun direction as the sun gets lower.
    // Rotate (dx, dz) into the sun's reference frame: u along sun direction,
    // v perpendicular. The shadow is then an ellipse with semi-major axis
    // a = r / sin(alt) along the sun direction and semi-minor axis b = r.
    if (blocker.preset_id === "tree-canopy") {
      const sunUx = -Math.sin(sceneAz);
      const sunUz = -Math.cos(sceneAz);
      const u = dx * sunUx + dz * sunUz;
      const v = dx * (-sunUz) + dz * sunUx;
      const sinAlt = Math.max(0.1, Math.sin(alt));
      const a = r / sinAlt;
      const b = r;
      return (u * u) / (a * a) + (v * v) / (b * b) <= 1;
    }
    return dx * dx + dz * dz <= r * r;
  }

  if (blocker.shape_type === "ellipse") {
    const rw = (blocker.width_m ?? 2) / 2;
    const rh = (blocker.height_m ?? 1) / 2;
    const dx = px - (blocker.x_m + ox);
    const dz = pz - (blocker.y_m + oz);
    return (dx * dx) / (rw * rw) + (dz * dz) / (rh * rh) <= 1;
  }

  if (blocker.shape_type === "polygon" && blocker.points) {
    const shifted = blocker.points.map(p => ({
      x: p.x + blocker.x_m + ox,
      y: p.y + blocker.y_m + oz,
    }));
    return pointInPolygon(px, pz, shifted);
  }

  return false;
}

function classify(sunHours: number): SunClass {
  if (sunHours >= 6) return "Full Sun";
  if (sunHours >= 4) return "Partly Sunny";
  if (sunHours >= 2) return "Partly Shady";
  return "Shade";
}

export function computeSunHours(
  shape: ShapeData,
  allShapes: ShapeData[],
  lat: number,
  lng: number,
  date: Date,
  northOffsetDeg: number,
): ShapeSunResult {
  const times = SunCalc.getTimes(date, lat, lng);
  const sunrise = times.sunrise.getTime();
  const sunset = times.sunset.getTime();
  const step = 30 * 60 * 1000; // 30 minutes in ms

  const blockers = allShapes.filter(
    b => b.id !== shape.id && (b.extrude_m ?? 0) > 0.05,
  );
  const { x: cx, z: cz } = getShapeCentre(shape);
  const northRad = northOffsetDeg * Math.PI / 180;

  let litSteps = 0;
  let totalSteps = 0;

  for (let t = sunrise; t <= sunset; t += step) {
    const pos = SunCalc.getPosition(new Date(t), lat, lng);
    if (pos.altitude < 0.05) continue; // below ~3° — skip grazing angles
    totalSteps++;
    const sceneAz = -pos.azimuth - northRad;
    const inShadow = blockers.some(b => isPointInBlockerShadow(cx, cz, b, sceneAz, pos.altitude));
    if (!inShadow) litSteps++;
  }

  const sunHours = litSteps * 0.5;
  return { shapeId: shape.id, sunHours, classification: classify(sunHours) };
}

/**
 * Check whether a shape's centre is in shadow at a single point in time.
 * Used by the Sun Tracker garden panel for real-time shadow coloring.
 */
export function isShapeInShadowAt(
  shape: ShapeData,
  allShapes: ShapeData[],
  lat: number,
  lng: number,
  date: Date,
  northOffsetDeg: number,
): boolean {
  const pos = SunCalc.getPosition(date, lat, lng);
  if (pos.altitude < 0.05) return true; // sun below horizon
  const northRad = northOffsetDeg * Math.PI / 180;
  const sceneAz = -pos.azimuth - northRad;
  const { x: cx, z: cz } = getShapeCentre(shape);
  const blockers = allShapes.filter(b => b.id !== shape.id && (b.extrude_m ?? 0) > 0.05);
  return blockers.some(b => isPointInBlockerShadow(cx, cz, b, sceneAz, pos.altitude));
}

export function computeAllShapesSunHours(
  shapes: ShapeData[],
  lat: number,
  lng: number,
  date: Date,
  northOffsetDeg: number,
): ShapeSunResult[] {
  return shapes.map(s => computeSunHours(s, shapes, lat, lng, date, northOffsetDeg));
}
