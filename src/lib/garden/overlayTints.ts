// Atmospheric overlay tints — the single source of truth for the Garden
// Layout editor's frost / wind / pH / moisture shape tints, shared by the
// 2D Konva stage and the 3D scene so the two views can never disagree.
// Colours are "#rrggbbaa" strings (Konva accepts them directly; three.js
// callers split them via splitHexAlpha).

import type { ShapeData } from "../../components/GardenShapeProperties";
import { classifyFrostRisk, computeWindExposure, type ForecastDay } from "./microclimate";

export interface OverlayTintContext {
  showFrost: boolean;
  showWind: boolean;
  showPh: boolean;
  showMoisture: boolean;
  forecast: ForecastDay[];
  allShapes: ShapeData[];
  areaPh: Record<string, number | null>;
  areaMoisture: Record<string, number | null>;
}

/**
 * Tint for one shape under the active atmospheric overlays.
 * Priority when several are toggled: frost > wind > pH > moisture
 * (the historical 2D if/else order). Returns null when no active overlay
 * has data for this shape.
 */
export function getShapeOverlayTint(shape: ShapeData, ctx: OverlayTintContext): string | null {
  if (ctx.showFrost && ctx.forecast.length > 0) {
    const worstMin = Math.min(...ctx.forecast.slice(0, 7).map((d) => d.temp_min_c));
    const risk = classifyFrostRisk(worstMin);
    return risk === "Severe" ? "#dc262640"
      : risk === "Moderate" ? "#f9731640"
      : risk === "Mild" ? "#fbbf2440"
      : "#94a3b833";
  }
  if (ctx.showWind) {
    const expo = computeWindExposure(shape, ctx.allShapes);
    return expo === "Exposed" ? "#ef444440"
      : expo === "Partly Sheltered" ? "#fbbf2440"
      : "#10b98140";
  }
  if (ctx.showPh && shape.area_id) {
    const phValue = ctx.areaPh[shape.area_id];
    if (phValue != null) {
      // Acidic (red) → neutral (grey) → alkaline (blue)
      if (phValue < 5.5) return "#dc262640";
      if (phValue < 6.5) return "#fbbf2440";
      if (phValue <= 7.5) return "#94a3b833";
      if (phValue <= 8.0) return "#7dd3fc40";
      return "#3b82f640";
    }
  }
  if (ctx.showMoisture && shape.area_id) {
    const m = ctx.areaMoisture[shape.area_id];
    if (m != null) {
      // 0-30 = dry (amber), 30-60 = ideal (green), 60+ = wet (blue)
      if (m < 30) return "#fbbf2440";
      if (m < 60) return "#10b98140";
      return "#3b82f640";
    }
  }
  return null;
}

/** Split "#rrggbbaa" into a three.js-safe solid colour + numeric opacity. */
export function splitHexAlpha(tint: string): { color: string; opacity: number } {
  if (/^#[0-9a-fA-F]{8}$/.test(tint)) {
    return { color: tint.slice(0, 7), opacity: parseInt(tint.slice(7), 16) / 255 };
  }
  return { color: tint, opacity: 0.45 };
}

// ── Time-aware ("Live") sun overlay tints ──
// Reuses the two extremes of the daily classification palette so Live mode
// reads on the same colour language as Day mode.
export const SUN_LIT_COLOR = "#fde68a";
export const SUN_SHADE_COLOR = "#cbd5e1";
export const SUN_LIT_TEXT_COLOR = "#92400e";
export const SUN_SHADE_TEXT_COLOR = "#475569";

/** Solid tint colour for a shape in Live sun mode. */
export function getSunTimeTint(lit: boolean): string {
  return lit ? SUN_LIT_COLOR : SUN_SHADE_COLOR;
}

/** Konva-ready "#rrggbbaa" tint for the 2D stage in Live sun mode. */
export function getSunTimeTint2D(lit: boolean): string {
  return getSunTimeTint(lit) + "66";
}
