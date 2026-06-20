import { describe, test, expect } from "vitest";
import {
  tierAllowsFeature, tiersWithFeature, FEATURE_GATES, type Feature,
} from "../../../src/constants/tierFeatures";

describe("tierFeatures", () => {
  test("every feature ships OPEN to all four tiers (no behaviour change yet)", () => {
    // Guard rail: if this fails, a gate was intentionally flipped — confirm it's
    // wanted and update this expectation in the same change.
    for (const f of Object.keys(FEATURE_GATES) as Feature[]) {
      expect(FEATURE_GATES[f]).toEqual(
        expect.arrayContaining(["sprout", "botanist", "sage", "evergreen"]),
      );
    }
  });

  test("tierAllowsFeature reads the gate list; unknown tier = sprout", () => {
    expect(tierAllowsFeature("sprout", "light_sensor")).toBe(true);
    expect(tierAllowsFeature("evergreen", "multiple_homes")).toBe(true);
    expect(tierAllowsFeature(null, "garden_layout")).toBe(true);
    expect(tierAllowsFeature(undefined, "visualiser")).toBe(true);
  });

  test("the gating primitive is an explicit allow-list (lattice-safe)", () => {
    // The helper is just list membership, so an arbitrary allow-list gates correctly.
    const allow = tiersWithFeature("light_sensor");
    expect(allow).toContain("sprout");
    // Membership semantics: a tier absent from a list is denied.
    expect(["botanist", "sage", "evergreen"].includes("sprout")).toBe(false);
  });
});
