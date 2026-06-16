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
 * Field name candidates for soil temperature in Fahrenheit (most common
 * Ecowitt output unit).
 */
const TEMP_F_FIELDS = (ch: number): string[] => [
  `soiltemp${ch}f`,
  `soiltemp${ch}F`,
  `tf_ch${ch}`,
];

/**
 * Field name for soil temperature in Celsius (real-time endpoint format
 * — the form-data webhook usually sends F).
 */
const TEMP_C_FIELDS = (ch: number): string[] => [
  `soiltempc${ch}`,
  `soiltemp${ch}c`,
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

    // Temperature — try Celsius first (real_time), then Fahrenheit (webhook).
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

    out.push({
      channel: ch,
      soil_moisture: moisture,
      soil_temp: tempC,
      soil_ec: ec,
      ec_source: ecSource,
      inferredModel,
    });
  }

  out.sort((a, b) => a.channel - b.channel);
  return out;
}

/**
 * Flatten the `device/real_time` JSON shape into the flat field dict
 * `parseSoilChannels` expects.
 *
 * The endpoint returns:
 *   { soilwetness: { soilwetness1: { soilmoisture: { value: "42" }, ... } } }
 *
 * We turn that into:
 *   { soilmoisture1: "42", soiltempc1: "18.4", soilcond1: "850", ... }
 *
 * Unknown nested fields are preserved so a future firmware revealing a
 * new EC spelling doesn't require any flattening change.
 */
export function flattenRealTimeSoilwetness(
  payload: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!payload || typeof payload !== "object") return out;

  for (const [chKey, chDataRaw] of Object.entries(payload)) {
    // chKey looks like "soilwetness1" — extract the channel number.
    const m = chKey.match(/^soilwetness(\d+)$/i);
    if (!m) continue;
    const ch = m[1];
    if (!chDataRaw || typeof chDataRaw !== "object") continue;
    for (const [fieldName, valueObj] of Object.entries(chDataRaw)) {
      if (!valueObj || typeof valueObj !== "object") continue;
      const v = (valueObj as { value?: unknown }).value;
      if (v === undefined || v === null) continue;
      // Field name pattern: "soilmoisture", "soiltempc", "soilad", etc.
      // We append the channel to make it look like the webhook flat shape.
      out[`${fieldName.toLowerCase()}${ch}`] = String(v);
    }
  }
  return out;
}
