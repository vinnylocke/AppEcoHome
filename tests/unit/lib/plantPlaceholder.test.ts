import { describe, it, expect } from "vitest";
import {
  plantPlaceholderKey,
  plantPlaceholderInitial,
  plantPlaceholderColor,
} from "../../../src/lib/plantPlaceholder";

// Mirrors PALETTE in src/lib/garden/plantTokens.ts — the placeholder tint must
// always be one of the shared token colours.
const PALETTE = [
  "#16a34a",
  "#65a30d",
  "#84cc16",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
];

describe("plantPlaceholderKey", () => {
  it("extracts the genus from the first scientific name", () => {
    expect(plantPlaceholderKey({ scientific_name: ["Solanum lycopersicum"], common_name: "Tomato" }))
      .toBe("solanum");
  });

  it("gives same-genus plants the same key (and colour)", () => {
    const tomato = { scientific_name: ["Solanum lycopersicum"], common_name: "Tomato" };
    const potato = { scientific_name: ["Solanum tuberosum"], common_name: "Potato" };
    expect(plantPlaceholderKey(tomato)).toBe(plantPlaceholderKey(potato));
    expect(plantPlaceholderColor(tomato)).toBe(plantPlaceholderColor(potato));
  });

  it("falls back to the lowercased common name when there is no scientific name", () => {
    expect(plantPlaceholderKey({ scientific_name: null, common_name: "Cherry Tomato" }))
      .toBe("cherry tomato");
    expect(plantPlaceholderKey({ scientific_name: [], common_name: "  Sage " })).toBe("sage");
  });

  it("falls back to \"plant\" when nothing is known", () => {
    expect(plantPlaceholderKey({})).toBe("plant");
    expect(plantPlaceholderKey({ scientific_name: [""], common_name: "   " })).toBe("plant");
  });
});

describe("plantPlaceholderInitial", () => {
  it("uppercases the first letter of the common name", () => {
    expect(plantPlaceholderInitial({ common_name: "tomato" })).toBe("T");
    expect(plantPlaceholderInitial({ common_name: "  basil" })).toBe("B");
  });

  it("returns \"?\" when there is no common name", () => {
    expect(plantPlaceholderInitial({})).toBe("?");
    expect(plantPlaceholderInitial({ common_name: "  " })).toBe("?");
  });
});

describe("plantPlaceholderColor", () => {
  it("is deterministic and always one of the token palette", () => {
    const p = { scientific_name: ["Ocimum basilicum"], common_name: "Basil" };
    const c1 = plantPlaceholderColor(p);
    const c2 = plantPlaceholderColor(p);
    expect(c1).toBe(c2);
    expect(PALETTE).toContain(c1);
    expect(PALETTE).toContain(plantPlaceholderColor({})); // "plant" fallback tints too
  });
});
