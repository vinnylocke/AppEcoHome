import { describe, it, expect } from "vitest";
import { stripMarkdownImages } from "../../../src/lib/stripMarkdownImages";

describe("stripMarkdownImages", () => {
  it("removes inline image syntax", () => {
    expect(stripMarkdownImages("Here it is: ![a peace lily](http://x/y.jpg)")).toBe("Here it is:");
  });
  it("removes reference-style images", () => {
    expect(stripMarkdownImages("![alt][ref] done")).toBe("done");
  });
  it("leaves normal links and text intact", () => {
    const t = "See [the guide](http://x) for more.";
    expect(stripMarkdownImages(t)).toBe(t);
  });
  it("collapses whitespace left behind", () => {
    expect(stripMarkdownImages("a ![x](y)  b")).toBe("a b");
  });
  it("handles empty / no-image text", () => {
    expect(stripMarkdownImages("")).toBe("");
    expect(stripMarkdownImages("just words")).toBe("just words");
  });
});
