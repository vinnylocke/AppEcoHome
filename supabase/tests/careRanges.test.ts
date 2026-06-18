import { assertEquals } from "@std/assert";
import { mergeCareRanges, careMatchKey } from "@shared/careRanges.ts";

Deno.test("mergeCareRanges — plant value wins, library fills nulls", () => {
  const plant = { soil_moisture_min: 40, soil_moisture_max: null, soil_ec_min: null };
  const lib = { soil_moisture_min: 30, soil_moisture_max: 60, soil_ec_min: 800, soil_ec_max: 1800 };
  const m = mergeCareRanges(plant, lib);
  assertEquals(m.soil_moisture_min, 40); // plant wins
  assertEquals(m.soil_moisture_max, 60); // library fills
  assertEquals(m.soil_ec_min, 800);      // library fills
  assertEquals(m.soil_ec_max, 1800);
  assertEquals(m.soil_temp_min, null);   // neither has it
});

Deno.test("mergeCareRanges — both null/absent → null", () => {
  const m = mergeCareRanges(null, undefined);
  assertEquals(m.soil_moisture_min, null);
  assertEquals(m.soil_temp_max, null);
});

Deno.test("mergeCareRanges — ignores non-finite values", () => {
  const m = mergeCareRanges({ soil_temp_min: NaN }, { soil_temp_min: 12 });
  assertEquals(m.soil_temp_min, 12);
});

Deno.test("careMatchKey — prefers scientific name (text or jsonb array), lowercased", () => {
  assertEquals(careMatchKey("Fragaria × ananassa", "Strawberry"), "fragaria × ananassa");
  assertEquals(careMatchKey(["Fragaria vesca", "alt"], "Strawberry"), "fragaria vesca");
});

Deno.test("careMatchKey — falls back to common name; null when nothing usable", () => {
  assertEquals(careMatchKey(null, "Strawberry"), "strawberry");
  assertEquals(careMatchKey([], ""), null);
  assertEquals(careMatchKey(undefined, undefined), null);
});
