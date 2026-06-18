import { describe, it, expect } from "vitest";
import { plantPhotoQuery } from "../../../src/lib/plantPhotoQuery";

describe("plantPhotoQuery", () => {
  it("appends 'plant' to a bare crop name", () => {
    expect(plantPhotoQuery("runner bean")).toBe("runner bean plant");
  });

  it("prefers the model's search_query over the name", () => {
    expect(plantPhotoQuery("runner bean", "Phaseolus coccineus")).toBe(
      "Phaseolus coccineus plant",
    );
  });

  it("leaves an already-botanical phrase unchanged", () => {
    expect(plantPhotoQuery("Lavender", "lavender flowers")).toBe("lavender flowers");
    expect(plantPhotoQuery("Monstera plant")).toBe("Monstera plant");
    expect(plantPhotoQuery("oak tree")).toBe("oak tree");
  });

  it("trims whitespace and handles empty search_query", () => {
    expect(plantPhotoQuery("  Basil  ", "   ")).toBe("Basil plant");
  });

  it("returns '' when there is nothing to search", () => {
    expect(plantPhotoQuery("", null)).toBe("");
    expect(plantPhotoQuery("   ")).toBe("");
  });
});
