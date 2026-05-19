// Microclimate analysis — pure helpers used by the Microclimate Report modal.
// All inputs are passed in; no DB access. Keeps testability simple.

import type { ShapeData } from "../../components/GardenShapeProperties";
import type { ShapeSunResult, SunClass } from "../sunAnalysis";

export interface ForecastDay {
  date: string;            // ISO date
  temp_min_c: number;      // overnight low
  temp_max_c: number;
  wind_speed_kph?: number;
  precip_mm?: number;
}

export type FrostRisk = "None" | "Mild" | "Moderate" | "Severe";

export function classifyFrostRisk(minTempC: number): FrostRisk {
  if (minTempC <= -3) return "Severe";
  if (minTempC <= 0)  return "Moderate";
  if (minTempC <= 3)  return "Mild";
  return "None";
}

export type WindExposure = "Sheltered" | "Partly Sheltered" | "Exposed";

/**
 * Estimates wind exposure for a shape based on whether tall structures
 * (walls, fences, shed, greenhouse) lie within a sheltering radius.
 */
export function computeWindExposure(target: ShapeData, others: ShapeData[]): WindExposure {
  const SHELTER_RADIUS_M = 3;
  const targetCentre = getCentre(target);
  if (!targetCentre) return "Exposed";

  let shelterCount = 0;
  const SHELTERING_PRESETS = new Set(["wall", "fence-panel", "shed", "greenhouse"]);
  for (const other of others) {
    if (other.id === target.id) continue;
    if (!other.preset_id || !SHELTERING_PRESETS.has(other.preset_id)) continue;
    const height = other.extrude_m ?? 0;
    if (height < 1.0) continue;
    const c = getCentre(other);
    if (!c) continue;
    const dx = targetCentre.x - c.x;
    const dy = targetCentre.y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= SHELTER_RADIUS_M) shelterCount += 1;
  }

  if (shelterCount >= 2) return "Sheltered";
  if (shelterCount === 1) return "Partly Sheltered";
  return "Exposed";
}

function getCentre(s: ShapeData): { x: number; y: number } | null {
  if (s.shape_type === "rect" || s.shape_type === "path") {
    return { x: s.x_m + (s.width_m ?? 1) / 2, y: s.y_m + (s.height_m ?? 1) / 2 };
  }
  if (s.shape_type === "circle" || s.shape_type === "ellipse") {
    return { x: s.x_m, y: s.y_m };
  }
  if (s.shape_type === "polygon" && s.points && s.points.length > 0) {
    const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length;
    const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length;
    return { x: s.x_m + cx, y: s.y_m + cy };
  }
  return null;
}

export interface ShapeMicroclimate {
  shapeId: string;
  label: string | null;
  sunClass: SunClass | null;
  sunHours: number | null;
  recentLux: number | null;
  windExposure: WindExposure;
  frostRiskTonight: FrostRisk;
  frostRiskNext7: FrostRisk;
}

export function computeMicroclimate(
  shape: ShapeData,
  allShapes: ShapeData[],
  sunResult: ShapeSunResult | undefined,
  recentLux: number | null,
  forecast: ForecastDay[],
): ShapeMicroclimate {
  const windExposure = computeWindExposure(shape, allShapes);

  const tonight = forecast[0];
  const frostRiskTonight = tonight ? classifyFrostRisk(tonight.temp_min_c) : "None";

  const next7 = forecast.slice(0, 7);
  const worstMin = next7.length > 0 ? Math.min(...next7.map((d) => d.temp_min_c)) : 999;
  const frostRiskNext7 = classifyFrostRisk(worstMin);

  return {
    shapeId: shape.id,
    label: shape.label,
    sunClass: sunResult?.classification ?? null,
    sunHours: sunResult?.sunHours ?? null,
    recentLux,
    windExposure,
    frostRiskTonight,
    frostRiskNext7,
  };
}
