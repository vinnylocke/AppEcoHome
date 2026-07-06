import { describe, test, expect } from "vitest";
import { normalizePlantName, formatOtherNames } from "../../../src/lib/plantNames";

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
