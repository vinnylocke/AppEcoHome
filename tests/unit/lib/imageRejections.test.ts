import { describe, it, expect } from "vitest";
import { normaliseSubjectKey } from "../../../src/lib/imageRejections";

// normaliseSubjectKey MUST match the edge functions' normaliseQuery
// (plant-image-search / ailment-image-search), which is `q.trim().toLowerCase()`.
// If these drift, a client-stored rejection never matches the key the edge
// function loads by, and the rejected image keeps coming back. These cases lock
// the contract.
describe("normaliseSubjectKey", () => {
  it("lowercases", () => {
    expect(normaliseSubjectKey("Tomato")).toBe("tomato");
    expect(normaliseSubjectKey("SPIDER MITE")).toBe("spider mite");
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseSubjectKey("  Basil  ")).toBe("basil");
    expect(normaliseSubjectKey("\tPowdery Mildew\n")).toBe("powdery mildew");
  });

  it("preserves internal spacing and punctuation (edge parity)", () => {
    // The edge normaliseQuery only trims + lowercases — it does NOT collapse
    // internal spaces or strip punctuation, so neither can this.
    expect(normaliseSubjectKey("Crab  Apple")).toBe("crab  apple");
    expect(normaliseSubjectKey("Rose-Rust")).toBe("rose-rust");
  });

  it("is idempotent", () => {
    const once = normaliseSubjectKey("  Aphid ");
    expect(normaliseSubjectKey(once)).toBe(once);
  });
});
