import { assertEquals } from "@std/assert";
import {
  flattenRealTimeSoilwetness,
  parseEcowittBattery,
  parseSoilChannels,
} from "@shared/integrations/ecowittFields.ts";

// 2026-06-16 — Soil sensor Phase 1 (WH52 + WH51 multi-model).
//
// The parser is the load-bearing piece of the multi-model Ecowitt
// integration. It needs to:
//   1. Handle WH51 webhook shape (moisture + tempF + raw ADC EC).
//   2. Handle WH52 webhook shape (moisture + tempF + calibrated µS/cm EC).
//   3. Handle WH52 real_time API shape (Celsius temp via flattening).
//   4. Default to "raw_adc" on absent EC field (back-compat with old
//      webhooks that didn't carry an EC field at all).
//   5. Skip malformed channels without throwing.

Deno.test("parseSoilChannels — WH51 webhook shape (Fahrenheit + raw ADC EC)", () => {
  const fields = {
    soilmoisture1: "42",
    soiltemp1f: "65.3",  // ~18.5°C
    soilad1: "850",      // raw ADC integer
    soilbatt1: "1.6",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels.length, 1);
  const ch = channels[0];
  assertEquals(ch.channel, 1);
  assertEquals(ch.soil_moisture, 42);
  // 65.3°F → 18.5°C (rounded to 0.1)
  assertEquals(ch.soil_temp, 18.5);
  assertEquals(ch.soil_ec, 850);
  assertEquals(ch.ec_source, "raw_adc");
  assertEquals(ch.inferredModel, "WH52"); // because tempC !== 0
});

Deno.test("parseSoilChannels — WH51 with no temperature field stays as WH51", () => {
  const fields = {
    soilmoisture1: "42",
    soilad1: "850",
    soilbatt1: "1.6",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].inferredModel, "WH51");
  assertEquals(channels[0].soil_temp, 0);
});

Deno.test("parseSoilChannels — WH52 with calibrated EC (soilcond)", () => {
  const fields = {
    soilmoisture1: "55",
    soiltemp1f: "68.0",  // 20°C
    soilcond1: "1250",   // calibrated µS/cm
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels.length, 1);
  const ch = channels[0];
  assertEquals(ch.soil_moisture, 55);
  assertEquals(ch.soil_temp, 20);
  assertEquals(ch.soil_ec, 1250);
  assertEquals(ch.ec_source, "calibrated_us_cm");
  assertEquals(ch.inferredModel, "WH52");
});

Deno.test("parseSoilChannels — WH52 alternative EC spelling 'soil_ec'", () => {
  const fields = {
    soilmoisture1: "55",
    soil_ec1: "1100",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_ec, 1100);
  assertEquals(channels[0].ec_source, "calibrated_us_cm");
});

Deno.test("parseSoilChannels — WH52 alternative EC spelling 'soilec'", () => {
  const fields = {
    soilmoisture1: "55",
    soilec1: "900",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_ec, 900);
  assertEquals(channels[0].ec_source, "calibrated_us_cm");
});

Deno.test("parseSoilChannels — calibrated EC wins over raw ADC when both present", () => {
  // A misconfigured firmware could report BOTH the calibrated value and
  // the raw ADC. We always prefer calibrated.
  const fields = {
    soilmoisture1: "55",
    soilcond1: "1250",
    soilad1: "850",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_ec, 1250);
  assertEquals(channels[0].ec_source, "calibrated_us_cm");
});

Deno.test("parseSoilChannels — Celsius temperature field (real_time format)", () => {
  const fields = {
    soilmoisture1: "55",
    soiltempc1: "18.4",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 18.4);
});

Deno.test("parseSoilChannels — plain soiltemp{N} with unit sidecar = F → converts to C", () => {
  // 2026-06-16 — WH52 reports plain `soiltemp` with a unit sidecar
  // captured by the flattener. When the sidecar says "F", the parser
  // converts to Celsius before storing.
  const fields = {
    soilmoisture1: "55",
    soiltemp1: "70.0",        // 70°F
    soiltemp1_unit: "F",
    soilcond1: "1100",
  };
  const channels = parseSoilChannels(fields);
  // 70°F = 21.1°C
  assertEquals(channels[0].soil_temp, 21.1);
});

Deno.test("parseSoilChannels — plain soiltemp{N} with unit sidecar = C → kept as-is", () => {
  const fields = {
    soilmoisture1: "55",
    soiltemp1: "20.4",
    soiltemp1_unit: "C",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 20.4);
});

Deno.test("parseSoilChannels — plain soiltemp{N} with no unit + value > 50 → assume F", () => {
  // Heuristic fallback: soil temperatures in Celsius never exceed 50,
  // so anything higher must be Fahrenheit. This is what was burning the
  // user — 70 stored as 70°C when the gateway was actually sending °F.
  const fields = {
    soilmoisture1: "55",
    soiltemp1: "70.0",
  };
  const channels = parseSoilChannels(fields);
  // 70°F → 21.1°C
  assertEquals(channels[0].soil_temp, 21.1);
});

Deno.test("parseSoilChannels — plain soiltemp{N} with no unit + value <= 50 → keep as C", () => {
  const fields = {
    soilmoisture1: "55",
    soiltemp1: "20.4",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 20.4);
});

Deno.test("parseSoilChannels — explicit Celsius candidate wins over ambiguous plain field", () => {
  // If both `soiltempc1` (explicit C) and `soiltemp1` (ambiguous) are
  // present, the explicit-C one MUST take priority.
  const fields = {
    soilmoisture1: "55",
    soiltempc1: "18.0",
    soiltemp1: "99",  // garbage that must NOT win
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 18.0);
});

Deno.test("parseSoilChannels — explicit Fahrenheit candidate wins over ambiguous plain field", () => {
  // Same precedence guarantee on the F side — webhook form-data sends
  // `soiltemp1f`, which is explicit and must beat any plain alias.
  const fields = {
    soilmoisture1: "55",
    soiltemp1f: "68.0",  // → 20°C
    soiltemp1: "99",      // garbage that must NOT win
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 20);
});

Deno.test("parseSoilChannels — alternative temp F spelling 'tf_ch'", () => {
  const fields = {
    soilmoisture1: "55",
    tf_ch1: "68.0",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_temp, 20);
});

Deno.test("parseSoilChannels — multiple channels emit in channel order", () => {
  const fields = {
    soilmoisture2: "40",
    soilmoisture1: "55",
    soilmoisture3: "33",
    soilcond1: "1000",
    soilcond2: "1100",
    soilcond3: "900",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels.length, 3);
  assertEquals(channels[0].channel, 1);
  assertEquals(channels[1].channel, 2);
  assertEquals(channels[2].channel, 3);
});

Deno.test("parseSoilChannels — malformed moisture is skipped", () => {
  const fields = {
    soilmoisture1: "not-a-number",
    soilmoisture2: "55",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels.length, 1);
  assertEquals(channels[0].channel, 2);
});

Deno.test("parseSoilChannels — out-of-range channel numbers are skipped", () => {
  const fields = {
    soilmoisture0: "55",   // 0 invalid
    soilmoisture99: "44",  // > 16 invalid
    soilmoisture1: "33",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels.length, 1);
  assertEquals(channels[0].channel, 1);
});

Deno.test("parseSoilChannels — empty / unrelated field dict returns empty array", () => {
  assertEquals(parseSoilChannels({}), []);
  assertEquals(parseSoilChannels({ random_field: "garbage" }), []);
});

Deno.test("parseSoilChannels — empty string EC value falls through to raw ADC", () => {
  const fields = {
    soilmoisture1: "55",
    soilcond1: "",     // empty string — must not be treated as 0 µS/cm
    soilad1: "850",
  };
  const channels = parseSoilChannels(fields);
  assertEquals(channels[0].soil_ec, 850);
  assertEquals(channels[0].ec_source, "raw_adc");
});

Deno.test("flattenRealTimeSoilwetness — legacy 'soilwetness' wrapper shape still works", () => {
  const payload = {
    soilwetness1: {
      soilmoisture: { value: "42" },
      soiltempc: { value: "18.5" },
      soilcond: { value: "1000" },
    },
    soilwetness2: {
      soilmoisture: { value: "55" },
      soiltempc: { value: "19.0" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "42");
  assertEquals(flat.soiltempc1, "18.5");
  assertEquals(flat.soilcond1, "1000");
  assertEquals(flat.soilmoisture2, "55");
});

Deno.test("flattenRealTimeSoilwetness — Ecowitt v3 real shape (soil_chN at top level)", () => {
  // The actual response from `device/real_time?call_back=all`.
  // soil_ch1 lives directly under `data`, NOT inside any wrapper.
  const payload = {
    soil_ch1: {
      soilmoisture: { value: "42", unit: "%" },
      soiltemp: { value: "18.4", unit: "C" },
      soilcond: { value: "1250", unit: "uS/cm" },
    },
    soil_ch2: {
      soilmoisture: { value: "55" },
      soilad: { value: "850" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "42");
  assertEquals(flat.soiltemp1, "18.4");
  assertEquals(flat.soilcond1, "1250");
  assertEquals(flat.soilmoisture2, "55");
  assertEquals(flat.soilad2, "850");
});

Deno.test("flattenRealTimeSoilwetness — ch_soilN alternative spelling also works", () => {
  const payload = {
    ch_soil1: {
      soilmoisture: { value: "55" },
      soilcond: { value: "1100" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "55");
  assertEquals(flat.soilcond1, "1100");
});

Deno.test("flattenRealTimeSoilwetness — bare value (no {value,unit} wrapper) works", () => {
  // Some firmware variants send a raw string instead of { value }.
  const payload = {
    soil_ch1: {
      soilmoisture: "42",
      soiltemp: "18.4",
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "42");
  assertEquals(flat.soiltemp1, "18.4");
});

Deno.test("flattenRealTimeSoilwetness — feeds straight into parseSoilChannels (v3 shape)", () => {
  const payload = {
    soil_ch1: {
      soilmoisture: { value: "55" },
      soiltemp: { value: "18.4" },  // °C — soiltemp1 will be parsed in C-first then F
      soilcond: { value: "1250" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  const channels = parseSoilChannels(flat);
  assertEquals(channels.length, 1);
  assertEquals(channels[0].soil_moisture, 55);
  assertEquals(channels[0].soil_ec, 1250);
  assertEquals(channels[0].ec_source, "calibrated_us_cm");
  assertEquals(channels[0].inferredModel, "WH52");
});

Deno.test("flattenRealTimeSoilwetness — WH52 soil_moisture_ec_ch (canonical inner field names)", () => {
  // Observed via diagnostics 2026-06-16. The WH52 reports under a new
  // category name `soil_moisture_ec_ch{N}`. We don't know yet whether
  // the inner fields use the canonical Ecowitt names (`soilmoisture`,
  // `soilcond`) or aliases (`humidity`, `ec`). Test both shapes to
  // belt-and-braces the support.
  const payload = {
    soil_moisture_ec_ch1: {
      soilmoisture: { value: "42", unit: "%" },
      soiltemp: { value: "18.4", unit: "C" },
      soilcond: { value: "1250", unit: "uS/cm" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "42");
  assertEquals(flat.soiltemp1, "18.4");
  assertEquals(flat.soilcond1, "1250");
});

Deno.test("flattenRealTimeSoilwetness — WH52 soil_moisture_ec_ch (alias inner fields humidity/ec)", () => {
  // Defensive — if the WH52 firmware uses humidity/ec instead of
  // soilmoisture/soilcond, the flattener aliases them to the canonical
  // names so parseSoilChannels still works.
  const payload = {
    soil_moisture_ec_ch1: {
      humidity: { value: "42" },
      temp: { value: "18.4" },
      ec: { value: "1250" },
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "42");
  assertEquals(flat.soiltemp1, "18.4");
  assertEquals(flat.soilcond1, "1250");

  // And it should round-trip cleanly through parseSoilChannels.
  const channels = parseSoilChannels(flat);
  assertEquals(channels.length, 1);
  assertEquals(channels[0].soil_moisture, 42);
  assertEquals(channels[0].soil_ec, 1250);
  assertEquals(channels[0].ec_source, "calibrated_us_cm");
  assertEquals(channels[0].inferredModel, "WH52");
});

Deno.test("flattenRealTimeSoilwetness — soil_moisture_ec_ch with conductivity alias", () => {
  const payload = {
    soil_moisture_ec_ch1: {
      moisture: "55",          // bare value, not { value }
      conductivity: "900",     // alternative EC alias
    },
  };
  const flat = flattenRealTimeSoilwetness(payload);
  assertEquals(flat.soilmoisture1, "55");
  assertEquals(flat.soilcond1, "900");
});

Deno.test("flattenRealTimeSoilwetness — empty / non-object input returns empty dict", () => {
  assertEquals(flattenRealTimeSoilwetness({}), {});
  // @ts-expect-error: testing runtime guard against bad input
  assertEquals(flattenRealTimeSoilwetness(null), {});
});

// ── battery_percent (voltage-based) ─────────────────────────────────────────
//
// 2026-06-16 hot-fix: soilbatt{N} is voltage in volts (or millivolts on
// some firmware variants), NOT a 0-5 level scale. AA Lithium curve:
// 1.0V = empty, 1.65V = full. The previous level-scale interpretation
// reported a fresh 1.6V battery as 30% (level 1.6 / 5).

Deno.test("parseEcowittBattery — fresh AA Lithium at 1.65V is 100%", () => {
  assertEquals(parseEcowittBattery("1.65"), 100);
});

Deno.test("parseEcowittBattery — slightly over-fresh (1.7V) clamps at 100%", () => {
  assertEquals(parseEcowittBattery("1.7"), 100);
});

Deno.test("parseEcowittBattery — empty (1.0V) is 0%", () => {
  assertEquals(parseEcowittBattery("1.0"), 0);
});

Deno.test("parseEcowittBattery — mid-range curve", () => {
  // 1.325V is halfway between 1.0 and 1.65 → 50%
  assertEquals(parseEcowittBattery("1.325"), 50);
  // 1.5V (AA nominal) → ~77%
  assertEquals(parseEcowittBattery("1.5"), 77);
  // 1.2V (low) → ~31%
  assertEquals(parseEcowittBattery("1.2"), 31);
});

Deno.test("parseEcowittBattery — millivolts variant", () => {
  assertEquals(parseEcowittBattery("1650"), 100);
  assertEquals(parseEcowittBattery("1500"), 77);
  assertEquals(parseEcowittBattery("1000"), 0);
});

Deno.test("parseEcowittBattery — out of range returns null", () => {
  assertEquals(parseEcowittBattery("0"), null); // below 0.5V floor → null
  assertEquals(parseEcowittBattery("4"), null); // above 3.5V ceiling, below mV floor
  assertEquals(parseEcowittBattery("50"), null); // dead zone between V and mV
  assertEquals(parseEcowittBattery("4000"), null); // above mV ceiling
});

Deno.test("parseEcowittBattery — widened range accepts AAA + alkaline edge cases", () => {
  // 0.5V is the new floor — empty AAA, still classified as 0% rather than null
  assertEquals(parseEcowittBattery("0.5"), 0);
  // 3.0V (2x alkaline) → clamped to 100% by voltsToPercent
  assertEquals(parseEcowittBattery("3.0"), 100);
});

Deno.test("parseEcowittBattery — non-numeric / missing returns null", () => {
  assertEquals(parseEcowittBattery("abc"), null);
  assertEquals(parseEcowittBattery(undefined), null);
  assertEquals(parseEcowittBattery(null), null);
});

Deno.test("parseSoilChannels — battery threaded through (volts)", () => {
  const channels = parseSoilChannels({
    soilmoisture1: "42",
    soilbatt1: "1.6", // fresh → 92%
  });
  assertEquals(channels.length, 1);
  assertEquals(channels[0].battery_percent, 92);
});

Deno.test("parseSoilChannels — battery threaded through (millivolts)", () => {
  const channels = parseSoilChannels({
    soilmoisture1: "42",
    soilbatt1: "1600", // same as 1.6V → 92%
  });
  assertEquals(channels[0].battery_percent, 92);
});

Deno.test("parseSoilChannels — missing battery yields null (pip stays hidden)", () => {
  const channels = parseSoilChannels({ soilmoisture1: "42" });
  assertEquals(channels[0].battery_percent, null);
  // Diagnostic surfaces "field was absent" (raw value null) so callers
  // can tell missing-field apart from out-of-range.
  assertEquals(channels[0].batteryDiagnostic.soilbattRawValue, null);
  assertEquals(channels[0].batteryDiagnostic.outOfRangeValue, null);
});

Deno.test("parseSoilChannels — out-of-range battery surfaces in diagnostic", () => {
  const channels = parseSoilChannels({
    soilmoisture1: "42",
    soilbatt1: "9999", // wildly out of any accepted scale
  });
  assertEquals(channels[0].battery_percent, null);
  assertEquals(channels[0].batteryDiagnostic.soilbattRawValue, "9999");
  assertEquals(channels[0].batteryDiagnostic.outOfRangeValue, 9999);
});
