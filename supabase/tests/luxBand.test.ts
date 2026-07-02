import { assertEquals } from "@std/assert";
import { luxBand, luxBandLabel } from "@shared/luxBand.ts";

// ──────────────────────────────────────────────────────────────────────────
// luxBand — band boundaries
// ──────────────────────────────────────────────────────────────────────────

Deno.test("luxBand — below 10k is low", () => {
  assertEquals(luxBand(0), "low");
  assertEquals(luxBand(9_999), "low");
});

Deno.test("luxBand — 10k to <25k is moderate", () => {
  assertEquals(luxBand(10_000), "moderate");
  assertEquals(luxBand(24_999), "moderate");
});

Deno.test("luxBand — 25k to <45k is bright", () => {
  assertEquals(luxBand(25_000), "bright");
  assertEquals(luxBand(44_999), "bright");
});

Deno.test("luxBand — 45k and above is full sun", () => {
  assertEquals(luxBand(45_000), "full sun");
  assertEquals(luxBand(120_000), "full sun");
});

// ──────────────────────────────────────────────────────────────────────────
// luxBandLabel — rendering + null handling
// ──────────────────────────────────────────────────────────────────────────

Deno.test("luxBandLabel — renders band with rounded lux value", () => {
  assertEquals(luxBandLabel(35_000), "bright (35000 lux measured)");
  assertEquals(luxBandLabel(9_500.6), "low (9501 lux measured)");
});

Deno.test("luxBandLabel — null/undefined/invalid readings return null", () => {
  assertEquals(luxBandLabel(null), null);
  assertEquals(luxBandLabel(undefined), null);
  assertEquals(luxBandLabel(NaN), null);
  assertEquals(luxBandLabel(-1), null);
});
