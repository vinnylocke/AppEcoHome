import { describe, test, expect } from "vitest";
import { diffOverriddenFields, mergeOverriddenFields } from "../../../src/lib/aiPlantOverrides";

describe("diffOverriddenFields", () => {
  test("returns empty array when nothing changed", () => {
    const row = {
      common_name: "Tomato",
      sunlight: ["full_sun"],
      watering_min_days: 2,
    };
    expect(diffOverriddenFields(row, row)).toEqual([]);
  });

  test("detects scalar change (watering_min_days)", () => {
    const before = { watering_min_days: 2, sunlight: ["full_sun"] };
    const after = { watering_min_days: 4, sunlight: ["full_sun"] };
    expect(diffOverriddenFields(before, after)).toEqual(["watering_min_days"]);
  });

  test("detects array change (sunlight)", () => {
    const before = { sunlight: ["full_sun"] };
    const after = { sunlight: ["full_sun", "part_shade"] };
    expect(diffOverriddenFields(before, after)).toEqual(["sunlight"]);
  });

  test("treats array reordering as equal (sort-insensitive)", () => {
    const before = { sunlight: ["full_sun", "part_shade"] };
    const after = { sunlight: ["part_shade", "full_sun"] };
    expect(diffOverriddenFields(before, after)).toEqual([]);
  });

  test("treats case difference in strings as equal (case-insensitive)", () => {
    const before = { cycle: "annual" };
    const after = { cycle: "Annual" };
    expect(diffOverriddenFields(before, after)).toEqual([]);
  });

  test("treats null / undefined / empty string as equivalent", () => {
    expect(diffOverriddenFields({ description: null }, { description: "" })).toEqual([]);
    expect(diffOverriddenFields({ description: undefined }, { description: null })).toEqual([]);
    expect(diffOverriddenFields({}, { description: "" })).toEqual([]);
  });

  test("ignores non-overridable fields (labels, thumbnail_url)", () => {
    const before = { sunlight: ["full_sun"], labels: ["edible"], thumbnail_url: "x.jpg" };
    const after = { sunlight: ["full_sun"], labels: ["edible", "annual"], thumbnail_url: "y.jpg" };
    expect(diffOverriddenFields(before, after)).toEqual([]);
  });

  test("returns multiple changed fields", () => {
    const before = {
      sunlight: ["full_sun"],
      watering_min_days: 2,
      cycle: "Annual",
      is_edible: true,
    };
    const after = {
      sunlight: ["part_shade"],
      watering_min_days: 5,
      cycle: "Annual",
      is_edible: false,
    };
    expect(diffOverriddenFields(before, after).sort()).toEqual(
      ["is_edible", "sunlight", "watering_min_days"].sort(),
    );
  });
});

describe("mergeOverriddenFields", () => {
  test("returns sorted unique union", () => {
    expect(mergeOverriddenFields(["sunlight"], ["watering_min_days"])).toEqual([
      "sunlight",
      "watering_min_days",
    ]);
  });

  test("deduplicates", () => {
    expect(mergeOverriddenFields(["sunlight"], ["sunlight", "cycle"])).toEqual([
      "cycle",
      "sunlight",
    ]);
  });

  test("handles null / undefined existing", () => {
    expect(mergeOverriddenFields(null, ["cycle"])).toEqual(["cycle"]);
    expect(mergeOverriddenFields(undefined, ["cycle"])).toEqual(["cycle"]);
  });

  test("handles empty added", () => {
    expect(mergeOverriddenFields(["sunlight"], [])).toEqual(["sunlight"]);
  });
});
