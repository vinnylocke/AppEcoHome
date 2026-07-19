import { describe, it, expect, afterEach, vi } from "vitest";
import { staggerStyle, STAGGER_ENTRANCE } from "../../../src/lib/stagger";

/** jsdom has no matchMedia — the default-tier test must install its own. */
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("STAGGER_ENTRANCE", () => {
  it("is the standard entrance class string", () => {
    expect(STAGGER_ENTRANCE).toBe("animate-in fade-in slide-in-from-bottom-2");
  });
});

describe("staggerStyle", () => {
  it("returns an empty style when the tier is 'off'", () => {
    expect(staggerStyle(3, { tier: "off" })).toEqual({});
  });

  it("returns 0ms delay with fill-mode backwards at index 0", () => {
    expect(staggerStyle(0, { tier: "high" })).toEqual({
      animationDelay: "0ms",
      animationFillMode: "backwards",
    });
  });

  it("caps the delay at cap * stepMs (index 20, default opts → 240ms)", () => {
    expect(staggerStyle(20, { tier: "high" })).toEqual({
      animationDelay: "240ms",
      animationFillMode: "backwards",
    });
  });

  it("honours custom stepMs and cap", () => {
    expect(staggerStyle(2, { tier: "low", stepMs: 60, cap: 4 })).toEqual({
      animationDelay: "120ms",
      animationFillMode: "backwards",
    });
    expect(staggerStyle(10, { tier: "low", stepMs: 60, cap: 4 })).toEqual({
      animationDelay: "240ms",
      animationFillMode: "backwards",
    });
  });

  it("clamps a negative index to 0", () => {
    expect(staggerStyle(-5, { tier: "high" })).toEqual({
      animationDelay: "0ms",
      animationFillMode: "backwards",
    });
  });

  it("defaults the tier via motionTier() — reduced motion yields an empty style", () => {
    stubMatchMedia(true);
    expect(staggerStyle(3)).toEqual({});
  });
});
