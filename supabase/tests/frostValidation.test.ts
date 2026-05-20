import { assertEquals } from "@std/assert";
import { validateFrostPayload } from "@shared/frostValidation.ts";

// ──────────────────────────────────────────────────────────────────────────
// Happy paths
// ──────────────────────────────────────────────────────────────────────────

Deno.test("northern hemisphere — typical UK pair passes", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26", growing_season_days: 197 },
    "Northern",
  );
  assertEquals(result, { ok: true });
});

Deno.test("southern hemisphere — typical Australian pair passes", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-09-20", first_frost_iso: "2027-05-10", growing_season_days: 232 },
    "Southern",
  );
  assertEquals(result, { ok: true });
});

Deno.test("hemisphere argument is case-insensitive", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26" },
    "northern",
  );
  assertEquals(result, { ok: true });
});

Deno.test("growing_season_days = null is acceptable", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26", growing_season_days: null },
    "Northern",
  );
  assertEquals(result, { ok: true });
});

// ──────────────────────────────────────────────────────────────────────────
// Invalid date strings
// ──────────────────────────────────────────────────────────────────────────

Deno.test("rejects when last_frost_iso is missing", () => {
  const result = validateFrostPayload(
    { last_frost_iso: null, first_frost_iso: "2026-10-26" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "invalid_last_frost_iso" });
});

Deno.test("rejects when first_frost_iso is missing", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: null },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "invalid_first_frost_iso" });
});

Deno.test("rejects non-strict date format", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "April 12, 2026", first_frost_iso: "2026-10-26" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "invalid_last_frost_iso" });
});

Deno.test("rejects garbage date string", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "not-a-date", first_frost_iso: "2026-10-26" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "invalid_last_frost_iso" });
});

// ──────────────────────────────────────────────────────────────────────────
// Ordering
// ──────────────────────────────────────────────────────────────────────────

Deno.test("rejects when last_frost_iso == first_frost_iso", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-04-12" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "last_frost_must_precede_first_frost" });
});

Deno.test("rejects when last_frost_iso > first_frost_iso", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-10-26", first_frost_iso: "2026-04-12" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "last_frost_must_precede_first_frost" });
});

// ──────────────────────────────────────────────────────────────────────────
// Hemisphere month-range checks
// ──────────────────────────────────────────────────────────────────────────

Deno.test("rejects NH last frost in June (out of Jan-May range)", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-06-15", first_frost_iso: "2026-10-26" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "northern_last_frost_out_of_range" });
});

Deno.test("rejects NH first frost in July (out of Aug-Dec range)", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-07-30" },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "northern_first_frost_out_of_range" });
});

Deno.test("rejects SH last frost in May (out of Jul-Nov range)", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-05-15", first_frost_iso: "2026-11-30" },
    "Southern",
  );
  assertEquals(result, { ok: false, reason: "southern_last_frost_out_of_range" });
});

Deno.test("rejects SH first frost in August (out of Feb-Jun range)", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-09-20", first_frost_iso: "2027-08-10" },
    "Southern",
  );
  assertEquals(result, { ok: false, reason: "southern_first_frost_out_of_range" });
});

Deno.test("rejects unknown hemisphere", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26" },
    "Eastern" as unknown as "Northern",
  );
  assertEquals(result, { ok: false, reason: "unknown_hemisphere" });
});

// ──────────────────────────────────────────────────────────────────────────
// growing_season_days range
// ──────────────────────────────────────────────────────────────────────────

Deno.test("rejects growing_season_days below 30", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26", growing_season_days: 10 },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "growing_season_days_out_of_range" });
});

Deno.test("rejects growing_season_days above 365", () => {
  const result = validateFrostPayload(
    { last_frost_iso: "2026-04-12", first_frost_iso: "2026-10-26", growing_season_days: 500 },
    "Northern",
  );
  assertEquals(result, { ok: false, reason: "growing_season_days_out_of_range" });
});
