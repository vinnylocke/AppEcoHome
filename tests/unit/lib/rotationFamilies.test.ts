import { describe, it, expect } from "vitest";
import {
  normaliseFamilyKey,
  getRotationRule,
  familyDisplayLabel,
  ROTATION_FAMILY_RULES,
} from "../../../src/lib/rotationFamilies";

describe("normaliseFamilyKey", () => {
  it("returns null for empty input", () => {
    expect(normaliseFamilyKey(null)).toBeNull();
    expect(normaliseFamilyKey(undefined)).toBeNull();
    expect(normaliseFamilyKey("")).toBeNull();
    expect(normaliseFamilyKey("   ")).toBeNull();
  });

  it("returns null for unknown families", () => {
    expect(normaliseFamilyKey("Cactaceae")).toBeNull();
    expect(normaliseFamilyKey("Pinaceae")).toBeNull();
  });

  it("normalises common Latin family names", () => {
    expect(normaliseFamilyKey("Solanaceae")).toBe("solanaceae");
    expect(normaliseFamilyKey("solanaceae")).toBe("solanaceae");
    expect(normaliseFamilyKey("BRASSICACEAE")).toBe("brassicaceae");
  });

  it("strips parenthetical context", () => {
    expect(normaliseFamilyKey("Solanaceae (nightshade family)")).toBe("solanaceae");
    expect(normaliseFamilyKey("Brassicaceae (cabbage family)")).toBe("brassicaceae");
  });

  it("strips trailing 'family' suffix", () => {
    expect(normaliseFamilyKey("Solanaceae family")).toBe("solanaceae");
  });

  it("maps colloquial aliases to the canonical key", () => {
    expect(normaliseFamilyKey("nightshades")).toBe("solanaceae");
    expect(normaliseFamilyKey("brassicas")).toBe("brassicaceae");
    expect(normaliseFamilyKey("legumes")).toBe("fabaceae");
    expect(normaliseFamilyKey("alliums")).toBe("alliaceae");
    expect(normaliseFamilyKey("cucurbits")).toBe("cucurbitaceae");
    expect(normaliseFamilyKey("umbellifers")).toBe("apiaceae");
  });

  it("maps historical alternative family names", () => {
    expect(normaliseFamilyKey("Compositae")).toBe("asteraceae");
    expect(normaliseFamilyKey("Leguminosae")).toBe("fabaceae");
    expect(normaliseFamilyKey("Cruciferae")).toBe("brassicaceae");
    expect(normaliseFamilyKey("Umbelliferae")).toBe("apiaceae");
    expect(normaliseFamilyKey("Labiatae")).toBe("lamiaceae");
    expect(normaliseFamilyKey("Gramineae")).toBe("poaceae");
  });

  it("merges Chenopodiaceae into Amaranthaceae (modern taxonomy)", () => {
    expect(normaliseFamilyKey("Chenopodiaceae")).toBe("amaranthaceae");
    expect(normaliseFamilyKey("Amaranthaceae")).toBe("amaranthaceae");
  });

  it("falls back to first-word matching for multi-word input", () => {
    expect(normaliseFamilyKey("solanaceae nightshades")).toBe("solanaceae");
  });
});

describe("getRotationRule", () => {
  it("returns null when no rule exists", () => {
    expect(getRotationRule("Cactaceae")).toBeNull();
    expect(getRotationRule(null)).toBeNull();
  });

  it("returns the rule for known families", () => {
    const rule = getRotationRule("Solanaceae");
    expect(rule).not.toBeNull();
    expect(rule!.family).toBe("Solanaceae");
    expect(rule!.commonName).toBe("Tomato family");
    expect(rule!.avoidYears).toBeGreaterThan(0);
    expect(rule!.partners.length).toBeGreaterThan(0);
  });

  it("works with colloquial aliases", () => {
    expect(getRotationRule("nightshades")?.commonName).toBe("Tomato family");
    expect(getRotationRule("legumes")?.commonName).toBe("Bean & pea family");
  });
});

describe("familyDisplayLabel", () => {
  it("returns common + latin for known families", () => {
    const label = familyDisplayLabel("Solanaceae");
    expect(label.common).toBe("Tomato family");
    expect(label.latin).toBe("Solanaceae");
  });

  it("returns the raw input when unknown", () => {
    const label = familyDisplayLabel("Cactaceae");
    expect(label.common).toBe("Cactaceae");
    expect(label.latin).toBeNull();
  });

  it("returns 'Unknown family' when null", () => {
    const label = familyDisplayLabel(null);
    expect(label.common).toBe("Unknown family");
    expect(label.latin).toBeNull();
  });
});

describe("ROTATION_FAMILY_RULES integrity", () => {
  it("has 12 families", () => {
    expect(Object.keys(ROTATION_FAMILY_RULES).length).toBe(12);
  });

  it("every partner key exists in the map (no dangling references)", () => {
    for (const rule of Object.values(ROTATION_FAMILY_RULES)) {
      for (const partner of rule.partners) {
        expect(ROTATION_FAMILY_RULES[partner]).toBeDefined();
      }
    }
  });

  it("every rule has non-empty avoidReason and preferReason", () => {
    for (const rule of Object.values(ROTATION_FAMILY_RULES)) {
      expect(rule.avoidReason.length).toBeGreaterThan(0);
      expect(rule.preferReason.length).toBeGreaterThan(0);
    }
  });

  it("every avoidYears is between 1 and 7", () => {
    for (const rule of Object.values(ROTATION_FAMILY_RULES)) {
      expect(rule.avoidYears).toBeGreaterThanOrEqual(1);
      expect(rule.avoidYears).toBeLessThanOrEqual(7);
    }
  });
});
