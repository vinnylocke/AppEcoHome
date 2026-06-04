import { assertEquals, assertExists } from "@std/assert";
import { sunsetUtc, formatSunsetLocal } from "@shared/sunsetTime.ts";

Deno.test("London midsummer sunset is around 9pm UTC", () => {
  const date = new Date("2026-06-21T12:00:00Z");
  const sunset = sunsetUtc(date, 51.5074, -0.1278);
  assertExists(sunset);
  // BST = UTC+1; midsummer sunset is ~21:21 BST = ~20:21 UTC.
  // Allow ±15 min for the simplified solar formula.
  const hours = sunset!.getUTCHours();
  if (hours < 20 || hours > 21) {
    throw new Error(`Expected sunset around 20:00–21:00 UTC, got ${sunset!.toISOString()}`);
  }
});

Deno.test("Sydney midwinter sunset is in the late afternoon", () => {
  const date = new Date("2026-06-21T12:00:00Z");
  const sunset = sunsetUtc(date, -33.8688, 151.2093);
  assertExists(sunset);
  // Sydney is UTC+10. June is midwinter → sunset ~4:55pm AEST = ~6:55 UTC.
  const hours = sunset!.getUTCHours();
  if (hours < 5 || hours > 7) {
    throw new Error(`Expected ~6 UTC, got ${sunset!.toISOString()}`);
  }
});

Deno.test("Polar circle in midsummer returns null (sun never sets)", () => {
  const date = new Date("2026-06-21T12:00:00Z");
  // Tromsø, 69.65°N — sun doesn't set in midsummer.
  const sunset = sunsetUtc(date, 69.65, 18.95);
  assertEquals(sunset, null);
});

Deno.test("formatSunsetLocal returns a friendly lowercase string", () => {
  const sunset = new Date("2026-06-21T20:21:00Z");
  const out = formatSunsetLocal(sunset, "Europe/London");
  // BST → 21:21 → "9:21 pm"
  if (!/9:21 pm/.test(out)) {
    throw new Error(`Expected '9:21 pm' in '${out}'`);
  }
});

Deno.test("formatSunsetLocal falls back to UTC when timezone is bogus", () => {
  const sunset = new Date("2026-06-21T20:21:00Z");
  const out = formatSunsetLocal(sunset, "Not/A_Timezone");
  if (!/utc/i.test(out)) {
    throw new Error(`Expected UTC fallback in '${out}'`);
  }
});
