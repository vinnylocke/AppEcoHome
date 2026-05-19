// Smart alignment guide calculation — finds nearby shapes whose centres or
// edges align with the dragged shape. Returns guide line positions in metres.

import type { ShapeData } from "../../components/GardenShapeProperties";

export interface GuideLine {
  /** Axis: "x" → vertical line at this x coord; "y" → horizontal line at this y coord */
  axis: "x" | "y";
  /** Position in metres */
  position: number;
}

export interface ShapeBounds {
  minX: number; maxX: number; centerX: number;
  minY: number; maxY: number; centerY: number;
}

const TOLERANCE_M = 0.15; // 15cm tolerance for alignment

export function getShapeBounds(shape: ShapeData): ShapeBounds | null {
  if (shape.shape_type === "rect" || shape.shape_type === "path") {
    const w = shape.width_m ?? 1;
    const h = shape.height_m ?? 1;
    return {
      minX: shape.x_m, maxX: shape.x_m + w, centerX: shape.x_m + w / 2,
      minY: shape.y_m, maxY: shape.y_m + h, centerY: shape.y_m + h / 2,
    };
  }
  if (shape.shape_type === "circle") {
    const r = shape.radius_m ?? 0.5;
    return {
      minX: shape.x_m - r, maxX: shape.x_m + r, centerX: shape.x_m,
      minY: shape.y_m - r, maxY: shape.y_m + r, centerY: shape.y_m,
    };
  }
  if (shape.shape_type === "ellipse") {
    const rx = (shape.width_m ?? 2) / 2;
    const ry = (shape.height_m ?? 1) / 2;
    return {
      minX: shape.x_m - rx, maxX: shape.x_m + rx, centerX: shape.x_m,
      minY: shape.y_m - ry, maxY: shape.y_m + ry, centerY: shape.y_m,
    };
  }
  if (shape.shape_type === "polygon" && shape.points && shape.points.length > 0) {
    const xs = shape.points.map(p => p.x + shape.x_m);
    const ys = shape.points.map(p => p.y + shape.y_m);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      minX, maxX, centerX: (minX + maxX) / 2,
      minY, maxY, centerY: (minY + maxY) / 2,
    };
  }
  return null;
}

/**
 * Given a dragged shape's current bounding box and all OTHER shapes,
 * return alignment guides that match any of dragged.{minX, centerX, maxX}
 * against any other shape's same set of keys.
 */
export function computeAlignmentGuides(
  dragged: ShapeBounds,
  others: ShapeData[],
): GuideLine[] {
  const guides: GuideLine[] = [];
  const seenX = new Set<number>();
  const seenY = new Set<number>();
  const draggedXEdges = [dragged.minX, dragged.centerX, dragged.maxX];
  const draggedYEdges = [dragged.minY, dragged.centerY, dragged.maxY];

  for (const o of others) {
    const b = getShapeBounds(o);
    if (!b) continue;
    const otherXEdges = [b.minX, b.centerX, b.maxX];
    const otherYEdges = [b.minY, b.centerY, b.maxY];

    for (const dEdge of draggedXEdges) {
      for (const oEdge of otherXEdges) {
        if (Math.abs(dEdge - oEdge) <= TOLERANCE_M) {
          const key = Math.round(oEdge * 100) / 100;
          if (!seenX.has(key)) {
            guides.push({ axis: "x", position: oEdge });
            seenX.add(key);
          }
        }
      }
    }
    for (const dEdge of draggedYEdges) {
      for (const oEdge of otherYEdges) {
        if (Math.abs(dEdge - oEdge) <= TOLERANCE_M) {
          const key = Math.round(oEdge * 100) / 100;
          if (!seenY.has(key)) {
            guides.push({ axis: "y", position: oEdge });
            seenY.add(key);
          }
        }
      }
    }
  }
  return guides;
}
