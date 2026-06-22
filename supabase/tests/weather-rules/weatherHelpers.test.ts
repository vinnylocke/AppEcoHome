import { assertEquals } from "@std/assert";
import { maxConsecutiveDays } from "@shared/weatherRules/index.ts";
import { heatThresholdForClimate } from "@shared/climateZones.ts";

Deno.test("maxConsecutiveDays — longest run of consecutive calendar days", () => {
  assertEquals(maxConsecutiveDays([]), 0);
  assertEquals(maxConsecutiveDays(["2026-05-01"]), 1);
  assertEquals(maxConsecutiveDays(["2026-05-01", "2026-05-02", "2026-05-03"]), 3);
  assertEquals(maxConsecutiveDays(["2026-05-01", "2026-05-03"]), 1); // gap breaks the run
  // longest run is 04→06 (length 3), not the 01→02 pair
  assertEquals(maxConsecutiveDays(["2026-05-01", "2026-05-02", "2026-05-04", "2026-05-05", "2026-05-06"]), 3);
  assertEquals(maxConsecutiveDays(["2026-05-02", "2026-05-01", "2026-05-02"]), 2); // unsorted + duplicate
});

Deno.test("heatThresholdForClimate — scales with climate, defaults to 28", () => {
  assertEquals(heatThresholdForClimate("tropical"), 36);
  assertEquals(heatThresholdForClimate("mediterranean"), 32);
  assertEquals(heatThresholdForClimate("cool_temperate"), 28);
  assertEquals(heatThresholdForClimate("arctic"), 25);
  assertEquals(heatThresholdForClimate("COOL_TEMPERATE"), 28); // case-insensitive
  assertEquals(heatThresholdForClimate(null), 28);
  assertEquals(heatThresholdForClimate("made_up_zone"), 28);
});

Deno.test("heatThresholdForClimate — UK uses the Met Office 25°C baseline regardless of zone", () => {
  assertEquals(heatThresholdForClimate("cool_temperate", "United Kingdom"), 25);
  assertEquals(heatThresholdForClimate("continental", "Scotland"), 25); // northern UK falls in continental by latitude
  assertEquals(heatThresholdForClimate("warm_temperate", "GB"), 25);
  assertEquals(heatThresholdForClimate("cool_temperate", "england"), 25); // case-insensitive
  assertEquals(heatThresholdForClimate("tropical", "Brazil"), 36); // non-UK still uses the zone map
});
