import { describe, it, expect } from "vitest";
import { filterByText } from "../../../src/lib/textFilter";

const items = [
  { name: "Bed A", area: "Veg patch" },
  { name: "Bed B", area: null },
  { name: "Greenhouse", area: "Glass house" },
];

describe("filterByText", () => {
  it("returns everything when the query is blank", () => {
    expect(filterByText(items, "   ", (i) => [i.name]).length).toBe(3);
  });

  it("matches case-insensitively", () => {
    expect(filterByText(items, "bed", (i) => [i.name]).map((i) => i.name)).toEqual(["Bed A", "Bed B"]);
  });

  it("matches across multiple fields", () => {
    expect(filterByText(items, "glass", (i) => [i.name, i.area]).map((i) => i.name)).toEqual(["Greenhouse"]);
  });

  it("tolerates null/undefined fields and returns [] on no match", () => {
    expect(filterByText(items, "zzz", (i) => [i.name, i.area])).toEqual([]);
  });
});
