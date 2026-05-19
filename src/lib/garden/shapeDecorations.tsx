// Per-preset visual decorations layered on top of the base 2D shape.
// Each function returns optional Konva nodes that give the bed a material feel
// instead of being a flat colour rectangle.

import React from "react";
import { Line, Rect, Circle } from "react-konva";
import type { ShapeData } from "../../components/GardenShapeProperties";

interface DecorationCtx {
  shape: ShapeData;
  basePx: number; // pixels per metre
}

function rectGeom(shape: ShapeData, basePx: number) {
  return {
    x: shape.x_m * basePx,
    y: shape.y_m * basePx,
    w: (shape.width_m ?? 1) * basePx,
    h: (shape.height_m ?? 1) * basePx,
  };
}

function circleGeom(shape: ShapeData, basePx: number) {
  return {
    cx: shape.x_m * basePx,
    cy: shape.y_m * basePx,
    r: (shape.radius_m ?? 0.5) * basePx,
  };
}

// ── Raised bed — inset wood-frame strokes inside the bed ─────────────────────
function raisedBedDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "rect") return null;
  const { x, y, w, h } = rectGeom(shape, basePx);
  if (w < 18 || h < 18) return null;
  const inset = Math.min(6, Math.min(w, h) * 0.12);
  return (
    <Rect
      x={x + inset}
      y={y + inset}
      width={w - inset * 2}
      height={h - inset * 2}
      stroke="rgba(101, 67, 33, 0.55)"
      strokeWidth={1.3}
      cornerRadius={2}
      listening={false}
    />
  );
}

// ── Pond — three wavy ripple lines centred horizontally ──────────────────────
function pondDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "circle") return null;
  const { cx, cy, r } = circleGeom(shape, basePx);
  if (r < 12) return null;
  const rippleColor = "rgba(255, 255, 255, 0.55)";
  const ripples: React.ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    const offsetY = (i - 1) * r * 0.35;
    const width = r * (0.7 - i * 0.1);
    const points: number[] = [];
    const segments = 12;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const px = cx - width + 2 * width * t;
      const py = cy + offsetY + Math.sin(t * Math.PI * 2) * 2;
      points.push(px, py);
    }
    ripples.push(
      <Line
        key={`pond-ripple-${shape.id}-${i}`}
        points={points}
        stroke={rippleColor}
        strokeWidth={1.2}
        tension={0.4}
        listening={false}
      />
    );
  }
  return <>{ripples}</>;
}

// ── Path — small stone dots speckled across the path ─────────────────────────
function pathDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "rect") return null;
  const { x, y, w, h } = rectGeom(shape, basePx);
  if (w < 18 || h < 12) return null;
  // Deterministic seeded positions so dots don't jitter every render.
  const seed = Math.abs(hashString(shape.id));
  const stones: React.ReactNode[] = [];
  const density = Math.max(3, Math.min(20, Math.floor((w * h) / 800)));
  for (let i = 0; i < density; i++) {
    const a = (seed + i * 1597) % 997;
    const b = (seed + i * 433) % 991;
    const sx = x + 4 + (a / 996) * (w - 8);
    const sy = y + 4 + (b / 990) * (h - 8);
    const radius = 1.4 + ((seed + i) % 5) * 0.4;
    stones.push(
      <Circle
        key={`stone-${shape.id}-${i}`}
        x={sx}
        y={sy}
        radius={radius}
        fill="rgba(110, 100, 90, 0.45)"
        listening={false}
      />,
    );
  }
  return <>{stones}</>;
}

// ── Fence panel — vertical plank ticks along the length ──────────────────────
function fenceDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "rect") return null;
  const { x, y, w, h } = rectGeom(shape, basePx);
  // Fence is rendered along its longer side; use that for plank ticks.
  const horizontal = w >= h;
  const length = horizontal ? w : h;
  if (length < 16) return null;
  const plankSpacing = Math.max(8, Math.min(18, length / 12));
  const ticks: React.ReactNode[] = [];
  for (let pos = plankSpacing; pos < length; pos += plankSpacing) {
    if (horizontal) {
      ticks.push(
        <Line
          key={`plank-${shape.id}-${pos}`}
          points={[x + pos, y + 2, x + pos, y + h - 2]}
          stroke="rgba(60, 35, 15, 0.45)"
          strokeWidth={0.9}
          listening={false}
        />,
      );
    } else {
      ticks.push(
        <Line
          key={`plank-${shape.id}-${pos}`}
          points={[x + 2, y + pos, x + w - 2, y + pos]}
          stroke="rgba(60, 35, 15, 0.45)"
          strokeWidth={0.9}
          listening={false}
        />,
      );
    }
  }
  return <>{ticks}</>;
}

// ── Greenhouse — translucent fill with cross-frame strokes ───────────────────
function greenhouseDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "rect") return null;
  const { x, y, w, h } = rectGeom(shape, basePx);
  if (w < 24 || h < 18) return null;
  return (
    <>
      <Line
        points={[x + 4, y + h / 2, x + w - 4, y + h / 2]}
        stroke="rgba(80, 120, 180, 0.55)"
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[x + w / 2, y + 4, x + w / 2, y + h - 4]}
        stroke="rgba(80, 120, 180, 0.55)"
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[x + 4, y + 4, x + w - 4, y + h - 4]}
        stroke="rgba(80, 120, 180, 0.35)"
        strokeWidth={0.8}
        listening={false}
      />
      <Line
        points={[x + w - 4, y + 4, x + 4, y + h - 4]}
        stroke="rgba(80, 120, 180, 0.35)"
        strokeWidth={0.8}
        listening={false}
      />
    </>
  );
}

// ── Tree canopy — cluster of smaller circles for foliage texture ─────────────
function treeCanopyDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "circle") return null;
  const { cx, cy, r } = circleGeom(shape, basePx);
  if (r < 16) return null;
  const seed = Math.abs(hashString(shape.id));
  const blobs: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (seed + i * 1009) % 360;
    const dist = r * 0.45;
    const blobR = r * 0.32;
    const bx = cx + Math.cos((angle * Math.PI) / 180) * dist;
    const by = cy + Math.sin((angle * Math.PI) / 180) * dist;
    blobs.push(
      <Circle
        key={`blob-${shape.id}-${i}`}
        x={bx}
        y={by}
        radius={blobR}
        fill="rgba(34, 139, 34, 0.25)"
        listening={false}
      />,
    );
  }
  return <>{blobs}</>;
}

// ── Wall — solid grey with inset highlight ───────────────────────────────────
function wallDecorations({ shape, basePx }: DecorationCtx) {
  if (shape.shape_type !== "rect") return null;
  const { x, y, w, h } = rectGeom(shape, basePx);
  if (w < 16 || h < 8) return null;
  const horizontal = w >= h;
  return (
    <Line
      points={horizontal ? [x + 2, y + 1.5, x + w - 2, y + 1.5] : [x + 1.5, y + 2, x + 1.5, y + h - 2]}
      stroke="rgba(255, 255, 255, 0.45)"
      strokeWidth={1}
      listening={false}
    />
  );
}

// FNV-1a-ish hash so decorations stay stable per shape id without an import.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

const REGISTRY: Record<string, (ctx: DecorationCtx) => React.ReactNode> = {
  "raised-bed":   raisedBedDecorations,
  "pond":         pondDecorations,
  "path":         pathDecorations,
  "fence-panel":  fenceDecorations,
  "greenhouse":   greenhouseDecorations,
  "tree-canopy":  treeCanopyDecorations,
  "wall":         wallDecorations,
};

export function getShapeDecorations(shape: ShapeData, basePx: number): React.ReactNode {
  if (!shape.preset_id) return null;
  const fn = REGISTRY[shape.preset_id];
  if (!fn) return null;
  return fn({ shape, basePx });
}
