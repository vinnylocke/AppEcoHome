import { describe, it, expect, afterEach, vi } from "vitest";
import { BURST_PALETTE, burstVectors, spawnBurst } from "../../../src/lib/burst";

/** jsdom has no matchMedia — every test must install its own. */
function stubMatchMedia(reducedMotionMatches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotionMatches : false,
      media: query,
    })),
  );
  Object.defineProperty(window, "matchMedia", {
    value: globalThis.matchMedia,
    configurable: true,
    writable: true,
  });
}

function stubHardware(opts: { deviceMemory?: number; cores?: number }) {
  if ("deviceMemory" in opts) {
    Object.defineProperty(navigator, "deviceMemory", {
      value: opts.deviceMemory,
      configurable: true,
    });
  }
  Object.defineProperty(navigator, "hardwareConcurrency", {
    value: opts.cores ?? 8,
    configurable: true,
  });
}

/** Deterministic unit-interval source cycling a fixed sequence. */
function makeSeededRandom(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Remove the deviceMemory stub so tests stay independent.
  delete (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  document.body.innerHTML = "";
});

describe("burstVectors", () => {
  it("returns exactly `count` vectors", () => {
    expect(burstVectors(0)).toHaveLength(0);
    expect(burstVectors(1)).toHaveLength(1);
    expect(burstVectors(14)).toHaveLength(14);
  });

  it("is deterministic given the same injected random", () => {
    const sequence = [0.1, 0.9, 0.35, 0.6, 0.02, 0.77];
    const a = burstVectors(8, makeSeededRandom(sequence));
    const b = burstVectors(8, makeSeededRandom(sequence));
    expect(a).toEqual(b);
  });

  it("keeps every field within its documented range", () => {
    const vectors = burstVectors(20, makeSeededRandom([0, 0.25, 0.5, 0.75, 0.999]));
    vectors.forEach((v, i) => {
      const baseAngle = (i / 20) * 2 * Math.PI;
      expect(v.angle).toBeGreaterThanOrEqual(baseAngle - 0.4);
      expect(v.angle).toBeLessThanOrEqual(baseAngle + 0.4);
      expect(v.distancePx).toBeGreaterThanOrEqual(48);
      expect(v.distancePx).toBeLessThan(120);
      expect(v.rotateDeg).toBeGreaterThanOrEqual(-180);
      expect(v.rotateDeg).toBeLessThan(180);
      expect(v.durationMs).toBeGreaterThanOrEqual(500);
      expect(v.durationMs).toBeLessThan(800);
      expect(v.sizePx).toBeGreaterThanOrEqual(5);
      expect(v.sizePx).toBeLessThan(9);
      expect(["leaf", "dot"]).toContain(v.shape);
    });
  });

  it("cycles the palette by index", () => {
    const vectors = burstVectors(9, makeSeededRandom([0.5]));
    vectors.forEach((v, i) => {
      expect(v.color).toBe(BURST_PALETTE[i % BURST_PALETTE.length]);
    });
  });

  it("picks leaf below the 0.4 threshold and dot at or above it", () => {
    const leaves = burstVectors(6, makeSeededRandom([0.39]));
    expect(leaves.every((v) => v.shape === "leaf")).toBe(true);

    const dots = burstVectors(6, makeSeededRandom([0.4]));
    expect(dots.every((v) => v.shape === "dot")).toBe(true);
  });
});

describe("spawnBurst", () => {
  it("does nothing when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    stubHardware({ deviceMemory: 8, cores: 8 });
    spawnBurst(100, 100);
    expect(document.body.childElementCount).toBe(0);
  });

  it("removes the container synchronously when WAAPI is unavailable (jsdom)", () => {
    stubMatchMedia(false);
    stubHardware({ deviceMemory: 8, cores: 8 });
    // jsdom has no Element.animate, so the WAAPI guard tears down the
    // container before anything animates — the body must end up empty.
    spawnBurst(100, 100);
    expect(document.body.childElementCount).toBe(0);
  });
});
