import { describe, test, expect } from "vitest";
import {
  partitionForPicker,
  QUICK_LAUNCHER_BY_ID,
  QUICK_LAUNCHER_CATALOGUE,
  resolvePins,
  type QuickLauncherAvailabilityCtx,
} from "../../../src/lib/quickLauncherCatalogue";

const baseCtx: QuickLauncherAvailabilityCtx = {
  subscriptionTier: "sprout",
  aiEnabled: false,
  isBeta: false,
  homeId: "home-1",
};

describe("QUICK_LAUNCHER_CATALOGUE", () => {
  test("contains the four defaults", () => {
    const ids = QUICK_LAUNCHER_CATALOGUE.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["doctor", "today", "capture", "library"]),
    );
  });

  test("has unique ids", () => {
    const ids = QUICK_LAUNCHER_CATALOGUE.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every id is resolvable via QUICK_LAUNCHER_BY_ID", () => {
    for (const dest of QUICK_LAUNCHER_CATALOGUE) {
      expect(QUICK_LAUNCHER_BY_ID[dest.id]).toBe(dest);
    }
  });
});

describe("resolvePins", () => {
  test("preserves order and filters unknown ids", () => {
    const result = resolvePins(["today", "bogus", "doctor"], baseCtx);
    expect(result.map((d) => d.id)).toEqual(["today", "doctor"]);
  });

  test("drops duplicate ids", () => {
    const result = resolvePins(["doctor", "doctor", "today"], baseCtx);
    expect(result.map((d) => d.id)).toEqual(["doctor", "today"]);
  });

  test("respects isAvailable predicate", () => {
    const sageOnlyCtx = { ...baseCtx, subscriptionTier: "sprout" as const };
    // Manually inject a temporary entry that's gated to sage.
    const original = QUICK_LAUNCHER_BY_ID["__test_sage_only__"];
    QUICK_LAUNCHER_BY_ID["__test_sage_only__"] = {
      id: "__test_sage_only__",
      label: "X",
      description: "x",
      icon: (() => null) as never,
      accent: "green",
      route: "/x",
      isAvailable: (ctx) =>
        ctx.subscriptionTier === "sage" || ctx.subscriptionTier === "evergreen",
    };
    try {
      const out = resolvePins(["doctor", "__test_sage_only__"], sageOnlyCtx);
      expect(out.map((d) => d.id)).toEqual(["doctor"]);
    } finally {
      if (original) QUICK_LAUNCHER_BY_ID["__test_sage_only__"] = original;
      else delete QUICK_LAUNCHER_BY_ID["__test_sage_only__"];
    }
  });
});

describe("partitionForPicker", () => {
  test("splits pins from available in catalogue order", () => {
    const { pinned, available } = partitionForPicker(
      ["today", "library"],
      baseCtx,
    );
    expect(pinned.map((d) => d.id)).toEqual(["today", "library"]);
    // 'capture' (the next catalogue entry after the pinned ones) should
    // sit ahead of 'shed', 'planner', etc.
    const availIds = available.map((d) => d.id);
    expect(availIds[0]).toBe("capture");
    expect(availIds).toContain("capture");
    expect(availIds).not.toContain("today");
    expect(availIds).not.toContain("library");
  });
});
