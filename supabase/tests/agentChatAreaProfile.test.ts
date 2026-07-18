import { assertEquals } from "@std/assert";
import { formatAreaProfile } from "../functions/agent-chat/context.ts";

// 2026-07-18 — bed-profile grounding in the chat context. Each area line
// gains a compact profile suffix so the Garden AI knows the bed's pH,
// drainage, feeding and light without a tool call. Unset fields must be
// omitted (no token spend, no "null" noise).

Deno.test("formatAreaProfile — full quartet + medium renders compactly", () => {
  assertEquals(
    formatAreaProfile({
      growing_medium: "Mineral Soil",
      medium_ph: 6.5,
      water_movement: "Well-Drained",
      nutrient_source: "Organic Breakdown",
      light_intensity_lux: 35000,
    }),
    " — mineral soil, pH 6.5, well-drained, organic breakdown nutrition, light: bright (35000 lux measured)",
  );
});

Deno.test("formatAreaProfile — partial profile omits unset fields", () => {
  assertEquals(
    formatAreaProfile({ medium_ph: 7.2, water_movement: "Static" }),
    " — pH 7.2, static",
  );
});

Deno.test("formatAreaProfile — nothing set → empty string (no suffix)", () => {
  assertEquals(formatAreaProfile({}), "");
  assertEquals(
    formatAreaProfile({
      growing_medium: null,
      medium_ph: null,
      water_movement: null,
      nutrient_source: null,
      light_intensity_lux: null,
    }),
    "",
  );
});

Deno.test("formatAreaProfile — invalid lux is skipped, not rendered", () => {
  assertEquals(formatAreaProfile({ light_intensity_lux: -5 }), "");
  assertEquals(formatAreaProfile({ medium_ph: 0, light_intensity_lux: null }), " — pH 0");
});
