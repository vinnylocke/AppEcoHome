import type { SceneRegion, SceneCandidate } from "../services/plantDoctorService";

/** Bounding box as Gemini returns it: [ymin, xmin, ymax, xmax], normalised 0–1000. */
export type Box2d = [number, number, number, number];

/** CSS-friendly percentages for absolutely positioning a box over the image. */
export interface BoxPercent {
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Convert a `[ymin, xmin, ymax, xmax]` (0–1000) box into top/left/width/height
 * percentages for overlaying on the rendered image. Clamps to the 0–100 range
 * and never returns a negative width/height.
 */
export function boxToPercent(box: Box2d): BoxPercent {
  const [ymin, xmin, ymax, xmax] = box;
  const topPct = clampPct((ymin / 1000) * 100);
  const leftPct = clampPct((xmin / 1000) * 100);
  const bottomPct = clampPct((ymax / 1000) * 100);
  const rightPct = clampPct((xmax / 1000) * 100);
  return {
    topPct,
    leftPct,
    widthPct: Math.max(0, rightPct - leftPct),
    heightPct: Math.max(0, bottomPct - topPct),
  };
}

/** A box is valid when it has 4 finite values in 0–1000 with positive area. */
export function isValidBox(box: number[] | undefined | null): box is Box2d {
  if (!Array.isArray(box) || box.length !== 4) return false;
  if (!box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return false;
  const [ymin, xmin, ymax, xmax] = box;
  return ymax > ymin && xmax > xmin;
}

/** Clamp a confidence score into 0–100 (rounds, defaults invalid → 0). */
export function clampConfidence(n: number | undefined | null): number {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, v));
}

/** The highest-confidence candidate for a region (regions are pre-sorted, but
 *  this is defensive so the UI never depends on order). */
export function topCandidate(region: SceneRegion): SceneCandidate | null {
  if (!region.candidates?.length) return null;
  return region.candidates.reduce((best, c) =>
    clampConfidence(c.confidence) > clampConfidence(best.confidence) ? c : best,
  );
}
