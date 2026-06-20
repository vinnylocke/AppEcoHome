import { describe, test, expect } from "vitest";
import {
  clampPlantSource, availablePlantSources,
  clampAilmentSource, availableAilmentSources,
} from "../../../src/lib/searchPreference";

describe("searchPreference", () => {
  test("clampPlantSource falls back to library without the entitlement", () => {
    const none = { enablePerenual: false, aiEnabled: false };
    expect(clampPlantSource("perenual", none)).toBe("library");
    expect(clampPlantSource("verdantly", none)).toBe("library");
    expect(clampPlantSource("ai", none)).toBe("library");
    expect(clampPlantSource("library", none)).toBe("library");
    expect(clampPlantSource(null, none)).toBe("library");
    expect(clampPlantSource(undefined, none)).toBe("library");
    expect(clampPlantSource("garbage", none)).toBe("library");
  });

  test("clampPlantSource honours entitlements (Verdantly now gated like Perenual)", () => {
    expect(clampPlantSource("perenual", { enablePerenual: true, aiEnabled: false })).toBe("perenual");
    expect(clampPlantSource("verdantly", { enablePerenual: true, aiEnabled: false })).toBe("verdantly");
    expect(clampPlantSource("ai", { enablePerenual: false, aiEnabled: true })).toBe("ai");
    // Verdantly/Perenual require enable_perenual even for an AI user.
    expect(clampPlantSource("verdantly", { enablePerenual: false, aiEnabled: true })).toBe("library");
    expect(clampPlantSource("perenual", { enablePerenual: false, aiEnabled: true })).toBe("library");
    // AI requires ai_enabled even for a Perenual user.
    expect(clampPlantSource("ai", { enablePerenual: true, aiEnabled: false })).toBe("library");
  });

  test("availablePlantSources reflects entitlements", () => {
    expect(availablePlantSources({ enablePerenual: false, aiEnabled: false })).toEqual(["library"]);
    expect(availablePlantSources({ enablePerenual: true, aiEnabled: false })).toEqual([
      "library", "verdantly", "perenual",
    ]);
    expect(availablePlantSources({ enablePerenual: false, aiEnabled: true })).toEqual(["library", "ai"]);
    expect(availablePlantSources({ enablePerenual: true, aiEnabled: true })).toEqual([
      "library", "verdantly", "perenual", "ai",
    ]);
  });

  test("clampAilmentSource has no Verdantly and honours entitlements", () => {
    const none = { enablePerenual: false, aiEnabled: false };
    expect(clampAilmentSource("perenual", none)).toBe("library");
    expect(clampAilmentSource("ai", none)).toBe("library");
    // Verdantly is not a valid ailment source — always clamps to library.
    expect(clampAilmentSource("verdantly", { enablePerenual: true, aiEnabled: true })).toBe("library");
    expect(clampAilmentSource("perenual", { enablePerenual: true, aiEnabled: false })).toBe("perenual");
    expect(clampAilmentSource("ai", { enablePerenual: false, aiEnabled: true })).toBe("ai");
  });

  test("availableAilmentSources reflects entitlements (no Verdantly)", () => {
    expect(availableAilmentSources({ enablePerenual: false, aiEnabled: false })).toEqual(["library"]);
    expect(availableAilmentSources({ enablePerenual: true, aiEnabled: false })).toEqual(["library", "perenual"]);
    expect(availableAilmentSources({ enablePerenual: false, aiEnabled: true })).toEqual(["library", "ai"]);
    expect(availableAilmentSources({ enablePerenual: true, aiEnabled: true })).toEqual([
      "library", "perenual", "ai",
    ]);
  });
});
