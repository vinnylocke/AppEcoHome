/**
 * Shared Ecowitt webhook / real-time field parser.
 *
 * 2026-06-16 — WH52 support landed alongside the existing WH51 handler.
 *
 * The Ecowitt webhook + `device/real_time` endpoint both expose
 * channel-indexed soil sensor fields with model-specific names:
 *
 *   WH51 (moisture only):
 *     - soilmoisture{N}      → soil moisture %
 *     - soilbatt{N}          → battery voltage
 *     - soiltemp{N}f         → soil temp °F (firmware-dependent, may be absent)
 *     - soilad{N}            → EC RAW ADC (no calibration published by Ecowitt)
 *
 *   WH52 (multi-parameter):
 *     - soilmoisture{N}      → soil moisture %
 *     - soilbatt{N}          → battery voltage
 *     - soiltemp{N}f or
 *       tf_ch{N}             → soil temp °F (field name depends on firmware)
 *     - soilcond{N} or
 *       soil_ec{N} or
 *       soileC{N}            → calibrated EC in µS/cm (TBC on first real
 *                              webhook — see plan doc, we log unknown
 *                              fields at info level so we can correct
 *                              the candidate list below if needed)
 *
 * The field-priority chain below errs on the side of treating ANY of
 * the calibrated-EC candidate fields as calibrated µS/cm. If a future
 * firmware lands a new spelling, add it to CALIBRATED_EC_FIELDS — that's
 * the only one-line fix needed.
 */

import type { EcowittSoilModel, EcSource } from "./providerTypes.ts";

/**
 * Field name candidates that Ecowitt firmware uses for the **calibrated
 * EC value** in µS/cm. Order matters — we use the first match.
 */
const CALIBRATED_EC_FIELDS = (ch: number): string[] => [
  `soilcond${ch}`,
  `soil_ec${ch}`,
  `soilec${ch}`,
  `soileC${ch}`,
];

/**
 * Field name candidates for soil temperature in Fahrenheit. The webhook
 * form-data shape carries the F suffix explicitly; the real_time JSON
 * shape sometimes uses `tf_ch{N}` for WH52 firmware variants.
 */
const TEMP_F_FIELDS = (ch: number): string[] => [
  `soiltemp${ch}f`,
  `soiltemp${ch}F`,
  `tf_ch${ch}`,
];

/**
 * Field name candidates for soil temperature in Celsius. Order matters
 * — explicit C-suffixed names are tried first. Plain `soiltemp${ch}`
 * is intentionally NOT in this list because the WH52's
 * `soil_moisture_ec_chN` container sends it in Fahrenheit even though
 * the field name carries no suffix; the parser routes it through the
 * AMBIGUOUS path below where the unit sidecar field + a value
 * heuristic decide F vs C correctly.
 */
const TEMP_C_FIELDS = (ch: number): string[] => [
  `soiltempc${ch}`,
  `soiltemp${ch}c`,
];

/**
 * Plain (no-suffix) temperature field — Ecowitt's WH52 reports its
 * temperature here. The unit lives on the sibling `${field}${ch}_unit`
 * sidecar field captured by `flattenRealTimeSoilwetness`. When the
 * sidecar is absent we use a value heuristic (>50 → assume F).
 */
const TEMP_AMBIGUOUS_FIELDS = (ch: number): string[] => [
  `soiltemp${ch}`,
];

const RAW_ADC_FIELD = (ch: number) => `soilad${ch}`;

function pickField(
  fields: Record<string, unknown>,
  candidates: string[],
): { key: string; value: string } | null {
  for (const key of candidates) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    const str = typeof value === "string" ? value : String(value);
    if (str === "" || str === "null") continue;
    return { key, value: str };
  }
  return null;
}

function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

export interface ParsedSoilChannel {
  channel: number;
  soil_moisture: number;
  soil_temp: number;
  soil_ec: number;
  ec_source: EcSource;
  inferredModel: EcowittSoilModel;
  /** Parsed from `soilbatt{N}`. Null when the gateway didn't send a
   *  battery field for this channel, when the value is non-numeric,
   *  or when the value is too high to safely auto-classify (likely
   *  millivolts — we'd rather show no pip than a wrong one). */
  battery_percent: number | null;
}

/**
 * Parse Ecowitt's `soilbatt{N}` field with auto-detect.
 *
 * Ecowitt firmware reports battery differently across models:
 *   - 0-5 "level" scale (WH51 most firmwares) → 5 means full
 *   - 0-100 percent (some newer firmwares)
 *   - millivolts (rare, e.g. 1500 = 1.5V) — IGNORED today because
 *     mapping mV to a percentage needs a calibration curve we don't
 *     have. Better to leave the pip dark than guess wrong.
 */
export function parseEcowittBattery(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const v = parseFloat(typeof value === "string" ? value : String(value));
  if (!Number.isFinite(v) || v < 0) return null;
  if (v <= 5) return Math.round((v / 5) * 100);
  if (v <= 100) return Math.round(v);
  return null;
}

/**
 * Pull all soil channels out of a flat field dictionary.
 *
 * Used by:
 *   - integrations-ecowitt-webhook (form-data POST from gateway)
 *   - integrations-ecowitt-poll (real_time JSON unwrapped to flat shape)
 *
 * `fields` is a flat map of field name → value (string-coerced). Caller
 * is responsible for flattening the real_time endpoint's nested shape
 * before calling.
 */
export function parseSoilChannels(
  fields: Record<string, unknown>,
): ParsedSoilChannel[] {
  const out: ParsedSoilChannel[] = [];
  const channelKeyPattern = /^soilmoisture(\d+)$/i;
  const seen = new Set<number>();

  for (const key of Object.keys(fields)) {
    const m = key.match(channelKeyPattern);
    if (!m) continue;
    const ch = parseInt(m[1], 10);
    if (!Number.isFinite(ch) || ch < 1 || ch > 16) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);

    const moistureRaw = fields[`soilmoisture${ch}`];
    if (moistureRaw === undefined) continue;
    const moisture = parseFloat(String(moistureRaw));
    if (!Number.isFinite(moisture)) continue;

    // Temperature — three-way decision:
    //   1. Explicit Celsius field (real_time, suffixed C).
    //   2. Explicit Fahrenheit field (webhook flat form, suffixed F).
    //   3. Ambiguous `soiltemp{ch}` (WH52 soil_moisture_ec_chN
    //      container): use the unit sidecar emitted by the flattener,
    //      then fall back to a value heuristic (>50 → assume F since
    //      typical soil temperatures in °C never exceed 50).
    //
    // Storage is always Celsius — the display unit preference lives on
    // the client per-device (EcowittDeviceMeta.display_temp_unit).
    let tempC = 0;
    const tempCField = pickField(fields, TEMP_C_FIELDS(ch));
    if (tempCField) {
      const parsed = parseFloat(tempCField.value);
      if (Number.isFinite(parsed)) tempC = parsed;
    } else {
      const tempFField = pickField(fields, TEMP_F_FIELDS(ch));
      if (tempFField) {
        const parsedF = parseFloat(tempFField.value);
        if (Number.isFinite(parsedF)) tempC = fahrenheitToCelsius(parsedF);
      } else {
        const ambiguous = pickField(fields, TEMP_AMBIGUOUS_FIELDS(ch));
        if (ambiguous) {
          const parsed = parseFloat(ambiguous.value);
          if (Number.isFinite(parsed)) {
            const sidecarUnitRaw = fields[`${ambiguous.key}_unit`];
            const sidecarUnit = typeof sidecarUnitRaw === "string"
              ? sidecarUnitRaw.trim().toUpperCase()
              : "";
            const isFahrenheit = sidecarUnit === "F" || sidecarUnit === "°F"
              ? true
              : sidecarUnit === "C" || sidecarUnit === "°C"
                ? false
                // Fall back to a value heuristic — soil temperatures in
                // °C above 50 are impossible (deserts cap soil at ~45°C);
                // anything higher is almost certainly Fahrenheit.
                : parsed > 50;
            tempC = isFahrenheit ? fahrenheitToCelsius(parsed) : parsed;
          }
        }
      }
    }

    // EC — prefer calibrated µS/cm if present (WH52), fall back to raw ADC (WH51).
    let ec = 0;
    let ecSource: EcSource = "raw_adc";
    const calibrated = pickField(fields, CALIBRATED_EC_FIELDS(ch));
    if (calibrated) {
      const parsed = parseFloat(calibrated.value);
      if (Number.isFinite(parsed)) {
        ec = parsed;
        ecSource = "calibrated_us_cm";
      }
    } else {
      const rawAdRaw = fields[RAW_ADC_FIELD(ch)];
      if (rawAdRaw !== undefined) {
        const parsed = parseFloat(String(rawAdRaw));
        if (Number.isFinite(parsed)) ec = parsed;
      }
    }

    // If we picked up calibrated EC OR a soil temperature reading the
    // WH51 doesn't natively expose, the gateway is showing WH52-shaped
    // data. We use this for connect-time model classification too.
    const hasTempReading = tempC !== 0;
    const inferredModel: EcowittSoilModel =
      ecSource === "calibrated_us_cm" || hasTempReading ? "WH52" : "WH51";

    const battery_percent = parseEcowittBattery(fields[`soilbatt${ch}`]);

    out.push({
      channel: ch,
      soil_moisture: moisture,
      soil_temp: tempC,
      soil_ec: ec,
      ec_source: ecSource,
      inferredModel,
      battery_percent,
    });
  }

  out.sort((a, b) => a.channel - b.channel);
  return out;
}

/**
 * Flatten the `device/real_time` JSON shape into the flat field dict
 * `parseSoilChannels` expects.
 *
 * 2026-06-16 (fix-up) — Ecowitt API v3 actually exposes soil sensors as
 * top-level `soil_chN` (or `ch_soilN`) keys directly under `data`, NOT
 * under a wrapper key called `soilwetness`. The original guess
 * (`data.soilwetness.soilwetness1`) was wrong — connect always returned
 * 0 devices because that wrapper never existed in the response.
 *
 * Real response shape (`call_back=all` against a gateway with WH51 on
 * channel 1):
 *   { code: 0, data: { soil_ch1: { soilmoisture: { value: "42", unit: "%" },
 *                                  soiltemp: { value: "18.4", unit: "C" },
 *                                  soilad: { value: "850" } } } }
 *
 * This permissive flattener accepts BOTH the actual shape and the
 * legacy `soilwetness` wrapper (in case some firmware variant uses it).
 * It walks every key matching `(soil_ch|ch_soil|soilwetness)(\d+)`
 * inside any container — at the top level of the payload, or one level
 * deep inside a `soilwetness` / `ch_soil` wrapper.
 *
 * Output shape mirrors the webhook flat form (`soilmoisture1`,
 * `soiltempc1`, `soilad1`, etc.) so `parseSoilChannels` works
 * identically for both transports.
 */
export function flattenRealTimeSoilwetness(
  payload: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!payload || typeof payload !== "object") return out;

  // Match all known channel-key spellings. The set has grown as users have
  // surfaced new firmware-specific names via the connect diagnostics:
  //   - soil_ch1 / ch_soil1 — Ecowitt API v3 standard names
  //   - soilwetness1        — legacy / some firmware variants
  //   - soil_moisture_ec_ch1 — WH52 multi-parameter sensor category
  //                            (observed 2026-06-16 via diagnostic expander)
  const channelKeyRe = /^(?:soil_ch|ch_soil|soilwetness|soil_moisture_ec_ch)(\d+)$/i;

  /**
   * Alias inner-field names to the canonical webhook spelling so
   * `parseSoilChannels` recognises them no matter which firmware
   * category emitted them. The WH52's `soil_moisture_ec_chN` category
   * (observed 2026-06-16) may use plain `humidity` for moisture and
   * `ec` / `conductivity` for EC instead of the WH51's `soilmoisture`
   * and `soilcond`. Aliases are applied case-insensitively.
   *
   * Pass-through is permissive — any unknown field name flows through
   * with its original lowercase spelling so future EC field names
   * already handled by `parseSoilChannels` (soilcond, soil_ec,
   * soilec, soileC) keep working.
   */
  const aliasFieldName = (raw: string): string => {
    const key = raw.toLowerCase();
    // Moisture aliases — collapse to the canonical "soilmoisture".
    if (key === "humidity" || key === "moisture" || key === "vwc") {
      return "soilmoisture";
    }
    // EC aliases — collapse to the canonical "soilcond" (recognised as
    // calibrated µS/cm by parseSoilChannels).
    if (key === "ec" || key === "conductivity") {
      return "soilcond";
    }
    // Temperature aliases — Ecowitt uses both `soiltemp` (some firmwares
    // include a unit, some don't) and `temp` inside category containers
    // like `soil_moisture_ec_ch`. Don't normalise the F/C distinction
    // here — parseSoilChannels handles both temperature units.
    if (key === "temp" || key === "temperature") {
      return "soiltemp";
    }
    return key;
  };

  // Walk a container (an object whose values are per-channel objects)
  // and flatten every channel we find.
  const walkContainer = (container: Record<string, unknown>) => {
    for (const [chKey, chDataRaw] of Object.entries(container)) {
      const m = chKey.match(channelKeyRe);
      if (!m) continue;
      const ch = m[1];
      if (!chDataRaw || typeof chDataRaw !== "object") continue;
      for (const [fieldName, valueObj] of Object.entries(chDataRaw)) {
        if (valueObj === null || valueObj === undefined) continue;
        // Ecowitt sometimes wraps values as { value, unit }, sometimes
        // sends a bare string/number. Accept both.
        let v: unknown;
        let unit: string | null = null;
        if (typeof valueObj === "object") {
          v = (valueObj as { value?: unknown }).value;
          // 2026-06-16 — preserve the unit info as a sidecar field so
          // parseSoilChannels can pick F vs C correctly even when the
          // field name itself doesn't carry the suffix. The WH52's
          // `soil_moisture_ec_chN` container reports `{ soiltemp:
          // { value: "70.4", unit: "F" } }` — without the unit we'd
          // store 70°F as 70°C.
          const u = (valueObj as { unit?: unknown }).unit;
          if (typeof u === "string" && u.length > 0) unit = u;
        } else {
          v = valueObj;
        }
        if (v === undefined || v === null) continue;
        const canonical = aliasFieldName(fieldName);
        out[`${canonical}${ch}`] = String(v);
        if (unit !== null) {
          out[`${canonical}${ch}_unit`] = unit;
        }
      }
    }
  };

  // Try the top level first — modern Ecowitt v3 puts soil_chN directly
  // under data.
  walkContainer(payload);

  // Then look one level deep inside any wrapper key (legacy fallback).
  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object") continue;
    // Skip keys that already looked like channel keys (already walked).
    if (channelKeyRe.test(key)) continue;
    walkContainer(value as Record<string, unknown>);
  }

  return out;
}
