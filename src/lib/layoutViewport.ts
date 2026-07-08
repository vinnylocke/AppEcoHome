/**
 * Pure viewport math for the Garden Layout editor's 2D stage
 * (docs/plans/garden-layout-fixes-and-mobile-readonly.md).
 *
 * The stage used to open at zoom 1 / pos (32,32) regardless of viewport —
 * a 24 m canvas is 1200 px wide at zoom 1, so phones saw a corner of empty
 * grid. Fit-to-canvas picks the zoom that shows the WHOLE canvas with
 * breathing room and centres it.
 */

export interface StageFit {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Zoom + stage offset that fits a canvas_w_m × canvas_h_m layout into a
 * viewW × viewH viewport with `padding` px on every side. Zoom is capped at
 * 1 (never zoom IN past 1:1 — small canvases sit centred instead) and
 * floored at 0.05 so a degenerate viewport can't produce zoom 0.
 */
export function fitStageToCanvas(
  canvasWm: number,
  canvasHm: number,
  viewW: number,
  viewH: number,
  basePx: number,
  padding = 32,
): StageFit {
  const wPx = Math.max(1, canvasWm * basePx);
  const hPx = Math.max(1, canvasHm * basePx);
  const usableW = Math.max(1, viewW - padding * 2);
  const usableH = Math.max(1, viewH - padding * 2);
  const zoom = Math.min(1, Math.max(0.05, Math.min(usableW / wPx, usableH / hPx)));
  return {
    zoom,
    x: Math.max(padding, (viewW - wPx * zoom) / 2),
    y: Math.max(padding, (viewH - hPx * zoom) / 2),
  };
}
