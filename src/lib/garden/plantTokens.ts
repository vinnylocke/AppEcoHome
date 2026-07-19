// Plant token colour + initial computation — used by both 2D and 3D renderers.
// We keep this in a dedicated module so colour assignment is consistent everywhere.

import type { PlantInArea } from "../../hooks/useShapeLiveState";

const PALETTE = [
  "#16a34a", // emerald
  "#65a30d", // lime
  "#84cc16", // chartreuse
  "#10b981", // mint
  "#f59e0b", // amber (squash / fruit)
  "#ef4444", // red (tomato / fruit)
  "#8b5cf6", // violet (flower)
  "#0ea5e9", // sky (herb)
];

/**
 * Stable, hash-based palette colour for an arbitrary key string. Same key →
 * same colour, forever. Callers normalise the key themselves (lowercase etc.)
 * so that "Tomato" and "tomato" only collide when the caller wants them to.
 */
export function getTokenColorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

/** Stable, hash-based colour for a plant token. Same plant name → same colour. */
export function getPlantTokenColor(plant: PlantInArea): string {
  return getTokenColorForKey((plant.plant_name ?? plant.nickname ?? plant.id).toLowerCase());
}

/** Single-letter initial for the token glyph. */
export function getPlantInitial(plant: PlantInArea): string {
  const src = (plant.nickname ?? plant.plant_name ?? "?").trim();
  return src.charAt(0).toUpperCase();
}

/**
 * Token grid positions for up to N tokens placed inside a bounding box.
 * Returns relative offsets in metres from the box's top-left, plus a token diameter.
 * Tokens lay out in rows of `cols`, with a small inset from the bed edges.
 */
export function computeTokenGrid(
  countToShow: number,
  boxWidthM: number,
  boxHeightM: number,
): { positions: { x: number; y: number }[]; diameterM: number; cols: number; rows: number } {
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(countToShow))));
  const rows = Math.ceil(countToShow / cols);
  const insetX = Math.min(0.15, boxWidthM * 0.08);
  const insetY = Math.min(0.15, boxHeightM * 0.08);
  const usableW = Math.max(0.01, boxWidthM - insetX * 2);
  const usableH = Math.max(0.01, boxHeightM - insetY * 2);
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const diameterM = Math.max(0.08, Math.min(cellW, cellH) * 0.7);

  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < countToShow; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = insetX + c * cellW + cellW / 2;
    const cy = insetY + r * cellH + cellH / 2;
    positions.push({ x: cx, y: cy });
  }
  return { positions, diameterM, cols, rows };
}

export const MAX_VISIBLE_TOKENS = 8;
