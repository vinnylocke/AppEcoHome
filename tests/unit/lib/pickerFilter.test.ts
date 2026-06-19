import { describe, it, expect } from "vitest";
import { shouldShowPickerSearch, filterPickerItems, PICKER_FILTER_THRESHOLD } from "../../../src/lib/pickerFilter";

describe("shouldShowPickerSearch", () => {
  it("only shows the search above the threshold", () => {
    expect(shouldShowPickerSearch(PICKER_FILTER_THRESHOLD)).toBe(false);
    expect(shouldShowPickerSearch(PICKER_FILTER_THRESHOLD + 1)).toBe(true);
    expect(shouldShowPickerSearch(0)).toBe(false);
  });
  it("honours a custom threshold", () => {
    expect(shouldShowPickerSearch(3, 2)).toBe(true);
    expect(shouldShowPickerSearch(2, 2)).toBe(false);
  });
});

describe("filterPickerItems", () => {
  const tasks = [
    { id: "1", title: "Water tomatoes" },
    { id: "2", title: "Prune roses" },
    { id: "3", title: "Feed citrus" },
  ];
  const sensors = [
    { id: "a", name: "Bed Front" },
    { id: "b", name: "Bed Back" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterPickerItems(tasks, "", [])).toHaveLength(3);
    expect(filterPickerItems(tasks, "   ", [])).toHaveLength(3);
  });

  it("matches title case-insensitively", () => {
    expect(filterPickerItems(tasks, "ROSE", []).map((t) => t.id)).toEqual(["2"]);
    expect(filterPickerItems(tasks, "water", []).map((t) => t.id)).toEqual(["1"]);
  });

  it("matches name (sensors) too", () => {
    expect(filterPickerItems(sensors, "front", []).map((s) => s.id)).toEqual(["a"]);
  });

  it("always keeps a selected item even when it doesn't match", () => {
    // Query matches only "Prune roses" (id 2), but id 1 is selected → kept.
    const out = filterPickerItems(tasks, "rose", ["1"]).map((t) => t.id);
    expect(out).toContain("1");
    expect(out).toContain("2");
    expect(out).not.toContain("3");
  });

  it("returns nothing when no match and nothing selected", () => {
    expect(filterPickerItems(tasks, "zzz", [])).toHaveLength(0);
  });
});
