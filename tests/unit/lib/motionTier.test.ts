import { describe, it, expect, afterEach, vi } from "vitest";
import { motionTier } from "../../../src/lib/motionTier";

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

afterEach(() => {
  vi.unstubAllGlobals();
  // Remove the deviceMemory stub so tests stay independent.
  delete (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
});

describe("motionTier", () => {
  it("returns 'off' when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(motionTier()).toBe("off");
  });

  it("returns 'off' when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    stubHardware({ deviceMemory: 8, cores: 8 });
    expect(motionTier()).toBe("off");
  });

  it("returns 'low' on low-memory devices (≤4GB)", () => {
    stubMatchMedia(false);
    stubHardware({ deviceMemory: 4, cores: 8 });
    expect(motionTier()).toBe("low");
  });

  it("returns 'low' on low-core devices (≤4 cores)", () => {
    stubMatchMedia(false);
    stubHardware({ deviceMemory: 8, cores: 4 });
    expect(motionTier()).toBe("low");
  });

  it("returns 'high' on capable hardware with no reduced-motion preference", () => {
    stubMatchMedia(false);
    stubHardware({ deviceMemory: 8, cores: 8 });
    expect(motionTier()).toBe("high");
  });

  it("returns 'high' when deviceMemory is unreported (e.g. iOS Safari) and cores are plentiful", () => {
    stubMatchMedia(false);
    stubHardware({ cores: 10 });
    expect(motionTier()).toBe("high");
  });
});
