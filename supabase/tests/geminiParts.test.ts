import { assertEquals } from "@std/assert";
import { joinPartsText } from "@shared/gemini.ts";

Deno.test("joinPartsText — single part returns its text", () => {
  assertEquals(joinPartsText([{ text: "hello" }]), "hello");
});

Deno.test("joinPartsText — concatenates multiple parts in order, no separator", () => {
  // Gemini splits long output across parts; faithful reconstruction is concatenation.
  assertEquals(joinPartsText([{ text: '{"a":1,' }, { text: '"b":2}' }]), '{"a":1,"b":2}');
});

Deno.test("joinPartsText — ignores parts without string text (e.g. functionCall-only)", () => {
  assertEquals(
    joinPartsText([{ text: "x" }, { functionCall: { name: "f" } }, { text: "y" }]),
    "xy",
  );
});

Deno.test("joinPartsText — empty array → empty string", () => {
  assertEquals(joinPartsText([]), "");
});

Deno.test("joinPartsText — non-array input → empty string", () => {
  assertEquals(joinPartsText(undefined), "");
  assertEquals(joinPartsText(null), "");
  assertEquals(joinPartsText({}), "");
});

Deno.test("joinPartsText — non-string text values are skipped", () => {
  assertEquals(joinPartsText([{ text: 5 }, { text: "ok" }, {}]), "ok");
});
