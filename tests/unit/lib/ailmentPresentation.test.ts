import { describe, it, expect } from "vitest";
import {
  AILMENT_KIND_CLASSES,
  AILMENT_SEVERITY_CLASSES,
  matchAffectedPlants,
} from "../../../src/lib/ailmentPresentation";

describe("ailment presentation maps (Stage 1 — field-guide library)", () => {
  it("covers every kind with status-token classes (HC-aware, no stock palette)", () => {
    for (const kind of ["pest", "disease", "invasive", "disorder"] as const) {
      const m = AILMENT_KIND_CLASSES[kind];
      expect(m.label).toBeTruthy();
      expect(m.chip).toMatch(/bg-status-\w+-fill/);
      expect(m.chip).toMatch(/text-status-\w+-ink/);
      expect(m.tile).toMatch(/bg-status-\w+-fill/);
    }
  });

  it("covers every severity on the escalation ladder", () => {
    expect(AILMENT_SEVERITY_CLASSES.low.chip).toContain("status-success");
    expect(AILMENT_SEVERITY_CLASSES.moderate.chip).toContain("status-caution");
    expect(AILMENT_SEVERITY_CLASSES.high.chip).toContain("status-watch");
    expect(AILMENT_SEVERITY_CLASSES.critical.chip).toContain("status-danger");
  });
});

describe("matchAffectedPlants (the 'could affect your garden' strip)", () => {
  const garden = ["Tomato", "Sweet Basil", "Rose", "Fern"];

  it("matches an affected type against a plant name (case-insensitive)", () => {
    expect(matchAffectedPlants(["tomato"], garden)).toEqual(["Tomato"]);
  });

  it("bridges naive plurals both ways (tomatoes → Tomato; rose ↔ roses)", () => {
    expect(matchAffectedPlants(["tomatoes"], garden)).toEqual(["Tomato"]);
    expect(matchAffectedPlants(["roses"], garden)).toEqual(["Rose"]);
  });

  it("matches a token inside a longer plant name", () => {
    expect(matchAffectedPlants(["basil"], garden)).toEqual(["Sweet Basil"]);
  });

  it("caps at the limit and de-duplicates", () => {
    const matches = matchAffectedPlants(["tomato", "basil", "rose", "fern"], garden, 2);
    expect(matches).toHaveLength(2);
  });

  it("ignores sub-3-char tokens (no noise matches) and returns [] when nothing hits", () => {
    expect(matchAffectedPlants(["ox"], garden)).toEqual([]);
    expect(matchAffectedPlants(["cactus"], garden)).toEqual([]);
    expect(matchAffectedPlants([], garden)).toEqual([]);
  });

  it("never substring-matches inside a word (review finding: 'ash' must not match 'Squash')", () => {
    expect(matchAffectedPlants(["ash"], ["Squash", "Mountain Ash"])).toEqual(["Mountain Ash"]);
  });

  it("splits multi-word affected types into word tokens", () => {
    expect(matchAffectedPlants(["fruit trees"], ["Apple Tree", "Fern"])).toEqual(["Apple Tree"]);
  });
});
