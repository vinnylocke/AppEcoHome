import { describe, it, expect } from "vitest";
import { stripMarkdownImages, stripCodeBlocks, sanitizeAssistantText, markdownToSpeech } from "../../../src/lib/stripMarkdownImages";

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

describe("markdownToSpeech", () => {
  it("drops bold markers but keeps the words (the asterisks-read-aloud bug)", () => {
    expect(markdownToSpeech("Water your **tomatoes** now")).toBe("Water your tomatoes now");
  });
  it("drops italic markers (single * and _)", () => {
    expect(markdownToSpeech("that is *really* important")).toBe("that is really important");
    expect(markdownToSpeech("a _subtle_ hint")).toBe("a subtle hint");
  });
  it("strips heading hashes", () => {
    expect(markdownToSpeech("## Care tips\nWater weekly")).toBe("Care tips\nWater weekly");
  });
  it("strips unordered list bullets (- and *)", () => {
    expect(markdownToSpeech("- prune\n- water\n* feed")).toBe("prune\nwater\nfeed");
  });
  it("keeps link text, drops the URL", () => {
    expect(markdownToSpeech("see [the guide](http://x) for more")).toBe("see the guide for more");
  });
  it("keeps inline code words, drops the backticks", () => {
    expect(markdownToSpeech("run `npm test` first")).toBe("run npm test first");
  });
  it("removes images and fenced code entirely", () => {
    expect(markdownToSpeech("Look ![x](http://y)\n```\ncode()\n```\ndone")).toBe("Look\n\ndone");
  });
  it("leaves plain prose untouched and handles empty", () => {
    expect(markdownToSpeech("just a plain sentence")).toBe("just a plain sentence");
    expect(markdownToSpeech("")).toBe("");
  });
  it("has no stray asterisks or underscores left in a mixed reply", () => {
    const out = markdownToSpeech("**Aphids**: try _neem oil_ and\n- ladybirds\n- soapy water");
    expect(out).not.toMatch(/[*_]/);
    expect(out).toContain("Aphids");
    expect(out).toContain("neem oil");
    expect(out).toContain("ladybirds");
  });
});
