import { describe, it, expect } from "vitest";
import { stripMarkdownImages, stripCodeBlocks, sanitizeAssistantText } from "../../../src/lib/stripMarkdownImages";

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

describe("stripCodeBlocks", () => {
  it("removes a fenced tool_code block but keeps prose", () => {
    const t = "Here's a runner bean:\n```tool_code\nshow_plant_images(plants=[{name:'Runner bean'}])\n```";
    expect(stripCodeBlocks(t)).toBe("Here's a runner bean:");
  });
  it("removes plain ``` fences", () => {
    expect(stripCodeBlocks("a\n```\ncode\n```\nb")).toBe("a\n\nb".replace(/\n{3,}/g, "\n\n").trim());
  });
  it("leaves normal text", () => {
    expect(stripCodeBlocks("just a sentence")).toBe("just a sentence");
  });
});

describe("sanitizeAssistantText", () => {
  it("strips both images and code blocks", () => {
    const t = "Look: ![x](http://y) and\n```tool_code\nfoo()\n```\ndone";
    expect(sanitizeAssistantText(t)).toBe("Look: and\n\ndone".replace(/\n{3,}/g, "\n\n").trim());
  });
});
