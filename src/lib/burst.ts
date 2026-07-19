import { motionTier } from "./motionTier";

/**
 * The celebration palette: leaf greens plus the tertiary petal pink. Brand
 * logo colours are allowed here because the burst is a brand moment, not UI
 * chrome — nothing else in the app should reach for these hexes directly.
 */
export const BURST_PALETTE = ["#478e5c", "#2a704d", "#075737", "#ffdad8"];

/** One particle's precomputed flight plan, produced by {@link burstVectors}. */
export interface BurstVector {
  /** Launch direction in radians — evenly spread around the circle with jitter. */
  angle: number;
  /** Travel distance from the origin, 48–120px. */
  distancePx: number;
  /** End-state rotation, -180–180deg. */
  rotateDeg: number;
  /** Flight time, 500–800ms. */
  durationMs: number;
  /** Particle width/height, 5–9px. */
  sizePx: number;
  /** Leaf (petal-cut corners) roughly 40% of the time, dot otherwise. */
  shape: "leaf" | "dot";
  /** Cycles {@link BURST_PALETTE} by particle index. */
  color: string;
}

/**
 * Pure particle-vector generator for {@link spawnBurst}. Deterministic given
 * an injected `random` (unit-interval source), which is what makes the burst
 * testable — pass a seeded fake in tests, leave the default in production.
 *
 * Angles are evenly spread around the full circle with ±0.4rad jitter so the
 * burst reads organic without ever clumping to one side.
 */
export function burstVectors(count: number, random: () => number = Math.random): BurstVector[] {
  const vectors: BurstVector[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = random() * 0.8 - 0.4;
    vectors.push({
      angle: (i / count) * 2 * Math.PI + jitter,
      distancePx: 48 + random() * 72,
      rotateDeg: random() * 360 - 180,
      durationMs: 500 + random() * 300,
      sizePx: 5 + random() * 4,
      shape: random() < 0.4 ? "leaf" : "dot",
      color: BURST_PALETTE[i % BURST_PALETTE.length],
    });
  }
  return vectors;
}

/**
 * Fires a leaf/petal particle burst at a viewport point — the task-completion
 * celebration. Call it from a tap/click handler with the trigger's centre
 * coords (`rect.left + rect.width / 2`, `rect.top + rect.height / 2`).
 *
 * Reward moments only (task complete, watering logged, checklist finished) —
 * never on ordinary navigation. Respects the motion budget: no-op when
 * `motionTier()` is "off", trims the particle count on "low", and bails
 * cleanly on runtimes without the Web Animations API.
 */
export function spawnBurst(x: number, y: number, opts?: { count?: number; palette?: string[] }): void {
  if (typeof document === "undefined") return;
  const tier = motionTier();
  if (tier === "off") return;

  const count = opts?.count ?? (tier === "low" ? 8 : 14);
  const palette = opts?.palette ?? BURST_PALETTE;
  const vectors = burstVectors(count).map((v, i) => ({
    ...v,
    color: palette[i % palette.length],
  }));

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "140";
  document.body.appendChild(container);

  // WAAPI guard (jsdom / ancient WebView): bail before animating anything.
  if (typeof container.animate !== "function") {
    container.remove();
    return;
  }

  let maxDuration = 0;
  for (const vector of vectors) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${vector.sizePx}px`;
    el.style.height = `${vector.sizePx}px`;
    el.style.background = vector.color;
    el.style.borderRadius = vector.shape === "leaf" ? "80% 0 80% 0" : "50%";
    container.appendChild(el);

    const dx = Math.cos(vector.angle) * vector.distancePx;
    // Slight upward bias so leaves float up before falling — reads celebratory.
    const dy = Math.sin(vector.angle) * vector.distancePx - 24;
    el.animate(
      [
        { transform: "translate(-50%,-50%) translate3d(0,0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(-50%,-50%) translate3d(${dx}px,${dy}px,0) rotate(${vector.rotateDeg}deg) scale(0.6)`,
          opacity: 0,
        },
      ],
      { duration: vector.durationMs, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" },
    );
    maxDuration = Math.max(maxDuration, vector.durationMs);
  }

  window.setTimeout(() => container.remove(), maxDuration + 50);
}
