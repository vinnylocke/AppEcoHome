import { describe, test, expect } from "vitest";
import { normalizePlantName, formatOtherNames, preferPickedName } from "../../../src/lib/plantNames";

describe("preferPickedName", () => {
  test("keeps the variety the user picked, even when it resolved to a different-cultivar or species row", () => {
    // Extends the species row → keep.
    expect(preferPickedName("Radish 'French Breakfast'", "Radish")).toBe("Radish 'French Breakfast'");
    expect(preferPickedName("Beetroot 'Boltardy'", "Beetroot")).toBe("Beetroot 'Boltardy'");
    // Resolved to a DIFFERENT cultivar (the Lollo Rossa bug) → still show the pick.
    expect(preferPickedName("Lettuce 'Lollo Rossa'", "Daisy Lambert Butterhead Lettuce")).toBe("Lettuce 'Lollo Rossa'");
    expect(preferPickedName("Carrot 'Autumn King'", "Root vegetable")).toBe("Carrot 'Autumn King'");
  });
  test("normalises to the catalogue's casing when the two are the same name", () => {
    expect(preferPickedName("radish", "Radish")).toBe("Radish");
    expect(preferPickedName("Radish", "Radish")).toBe("Radish");
  });
  test("handles empties", () => {
    expect(preferPickedName("", "Radish")).toBe("Radish");
    expect(preferPickedName("Radish 'X'", "")).toBe("Radish 'X'");
    expect(preferPickedName(null, undefined)).toBe("");
  });
});

describe("normalizePlantName", () => {
  test("collapses spacing and case so crab apple === crabapple", () => {
    expect(normalizePlantName("crab apple")).toBe("crabapple");
    expect(normalizePlantName("Crabapple")).toBe("crabapple");
    expect(normalizePlantName("Crab-Apple")).toBe("crabapple");
    expect(normalizePlantName("  CRAB  APPLE ")).toBe("crabapple");
  });
  test("strips punctuation but keeps digits", () => {
    expect(normalizePlantName("Aloe vera 'Chinensis'")).toBe("aloeverachinensis");
    expect(normalizePlantName("Rosa x 2")).toBe("rosax2");
  });
  test("empty / nullish → empty string", () => {
    expect(normalizePlantName("")).toBe("");
    // @ts-expect-error runtime nullish tolerance
    expect(normalizePlantName(null)).toBe("");
  });
});

describe("formatOtherNames", () => {
  test("accepts a string[] and trims", () => {
    expect(formatOtherNames([" Crabapple ", "Wild apple"])).toEqual(["Crabapple", "Wild apple"]);
  });
  test("accepts a JSON-array string (jsonb from plant_library)", () => {
    expect(formatOtherNames('["Crabapple", "Malus"]')).toEqual(["Crabapple", "Malus"]);
  });
  test("accepts a comma-joined string", () => {
    expect(formatOtherNames("Crabapple, Wild apple")).toEqual(["Crabapple", "Wild apple"]);
  });
  test("null / undefined / non-array → empty", () => {
    expect(formatOtherNames(null)).toEqual([]);
    expect(formatOtherNames(undefined)).toEqual([]);
    expect(formatOtherNames(42)).toEqual([]);
  });
  test("dedupes and drops names already shown as common/scientific (spacing-insensitive)", () => {
    expect(
      formatOtherNames(["Crab apple", "Crabapple", "Malus sylvestris", "Wild apple"], [
        "Crabapple",
        "Malus sylvestris",
      ]),
    ).toEqual(["Wild apple"]);
  });
});
