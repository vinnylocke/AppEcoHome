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
      expect.arrayContaining(["lens", "today", "capture", "library"]),
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
    const result = resolvePins(["today", "bogus", "lens"], baseCtx);
    expect(result.map((d) => d.id)).toEqual(["today", "lens"]);
  });

  test("drops duplicate ids", () => {
    const result = resolvePins(["lens", "lens", "today"], baseCtx);
    expect(result.map((d) => d.id)).toEqual(["lens", "today"]);
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
      const out = resolvePins(["lens", "__test_sage_only__"], sageOnlyCtx);
      expect(out.map((d) => d.id)).toEqual(["lens"]);
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
    // 'lens' and 'capture' should be in available, ahead of 'shed', 'planner', etc.
    const availIds = available.map((d) => d.id);
    expect(availIds[0]).toBe("lens");
    expect(availIds).toContain("capture");
    expect(availIds).not.toContain("today");
    expect(availIds).not.toContain("library");
  });
});
