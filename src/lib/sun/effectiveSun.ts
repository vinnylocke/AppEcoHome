// Cloud-adjusted effective sun calculation.
// Derives cloud cover from Open-Meteo's hourly weather_code (no extra fetch),
// then attenuates a shape's theoretical sun hours by that cloud cover.

import SunCalc from "suncalc";
import type { ShapeData } from "../../components/GardenShapeProperties";
import { getShapeCentre } from "../sunAnalysis";

/**
 * Approximate cloud cover (%) from a WMO weather code.
 * Mapping reflects how much direct sun is blocked, not how "stormy" the code feels.
 * 0–9 are clear-to-overcast and dominate most days; the precip codes assume
 * those skies also have substantial cloud cover.
 */
export function cloudPctFromWmoCode(code: number | null | undefined): number {
  if (code == null || !isFinite(code)) return 30;
  if (code === 0) return 5;
  if (code === 1) return 20;
  if (code === 2) return 50;
  if (code === 3) return 90;
  if (code >= 45 && code <= 48) return 95;     // fog
  if (code >= 51 && code <= 57) return 80;     // drizzle
  if (code >= 61 && code <= 67) return 85;     // rain
  if (code >= 71 && code <= 77) return 80;     // snow
  if (code >= 80 && code <= 82) return 70;     // showers
  if (code >= 95 && code <= 99) return 90;     // thunderstorm
  return 40;
}

/**
 * Parse hourly cloud cover (0..1 factor) for a given date from a raw
 * Open-Meteo snapshot. Returns null if no data for the date.
 *
 * Map keys are hour-of-day (0..23). Use directly as `cloudByHour.get(d.getHours())`.
 */
export function parseHourlyCloudFactor(
  rawWeather: any,
  dateKey: string,
): Map<number, number> | null {
  if (!rawWeather?.hourly?.time || !rawWeather?.hourly?.weather_code) return null;
  const times: string[] = rawWeather.hourly.time;
  const codes: number[] = rawWeather.hourly.weather_code;
  const result = new Map<number, number>();
  for (let i = 0; i < times.length; i++) {
    if (!times[i].startsWith(dateKey)) continue;
    // times are local ISO strings like "2026-05-19T13:00"
    const hour = parseInt(times[i].slice(11, 13), 10);
    if (!isFinite(hour)) continue;
    const cloudPct = cloudPctFromWmoCode(codes[i]);
    result.set(hour, 1 - cloudPct / 100);
  }
  return result.size > 0 ? result : null;
}

/** Cloud cover factor (0..1) for a specific moment. Falls back to 0.7 (~30% cloud). */
function cloudFactorAt(d: Date, cloudByHour: Map<number, number> | null): number {
  if (!cloudByHour) return 0.7;
  return cloudByHour.get(d.getHours()) ?? 0.7;
}

// Re-implement the shadow projection logic locally so this file stays pure
// and doesn't depend on private helpers from sunAnalysis.ts.
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

export interface EffectiveSunResult {
  shapeId: string;
  theoreticalHours: number;
  effectiveHours: number;
  averageCloudPct: number;   // 0..100, averaged across lit half-hours
}

/**
 * Compute the cloud-adjusted "effective sun" hours for one shape on a given date.
 *
 * Walks the day in 30-min steps and, for each step where the shape's centre is
 * lit (sun above horizon and not blocked), adds `0.5 × cloudFactor` to the
 * effective total. The theoretical total adds the full 0.5 regardless.
 */
export function computeEffectiveSunForShape(
  shape: ShapeData,
  allShapes: ShapeData[],
  lat: number,
  lng: number,
  date: Date,
  northOffsetDeg: number,
  cloudByHour: Map<number, number> | null,
): EffectiveSunResult {
  const times = SunCalc.getTimes(date, lat, lng);
  const sunrise = times.sunrise.getTime();
  const sunset = times.sunset.getTime();
  const step = 30 * 60 * 1000;

  const blockers = allShapes.filter(
    b => b.id !== shape.id && (b.extrude_m ?? 0) > 0.05,
  );
  const { x: cx, z: cz } = getShapeCentre(shape);
  const northRad = northOffsetDeg * Math.PI / 180;

  let theoretical = 0;
  let effective = 0;
  let cloudSamples = 0;
  let cloudSum = 0;

  for (let t = sunrise; t <= sunset; t += step) {
    const d = new Date(t);
    const pos = SunCalc.getPosition(d, lat, lng);
    if (pos.altitude < 0.05) continue;
    const sceneAz = -pos.azimuth - northRad;
    const inShadow = blockers.some(b => isPointInBlockerShadow(cx, cz, b, sceneAz, pos.altitude));
    if (inShadow) continue;

    const cloudFactor = cloudFactorAt(d, cloudByHour);
    theoretical += 0.5;
    effective += 0.5 * cloudFactor;
    cloudSum += (1 - cloudFactor) * 100;
    cloudSamples += 1;
  }

  const averageCloudPct = cloudSamples > 0 ? cloudSum / cloudSamples : 0;
  return {
    shapeId: shape.id,
    theoreticalHours: theoretical,
    effectiveHours: effective,
    averageCloudPct,
  };
}
