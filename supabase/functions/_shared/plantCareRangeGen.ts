// Generates a plant's ideal soil care ranges (moisture / EC / soil-temp) so the
// AI Area Coach can persist them to the shared `plants` catalogue the first time
// it meets a plant the library doesn't cover — meaning the ranges are generated
// once and reused by every user thereafter (no per-run drift).
//
// Mirrors the agronomic wording of the plant-library seeder so values are
// consistent with library-sourced ranges. The prompt + parser are pure; the
// orchestration (Gemini call + DB write) lives in area-sensor-analysis.

import { extractJsonObject } from "./extractJson.ts";

export const CARE_RANGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    soil_moisture_min: { type: "NUMBER" },
    soil_moisture_max: { type: "NUMBER" },
    soil_ec_min: { type: "NUMBER" },
    soil_ec_max: { type: "NUMBER" },
    soil_temp_min: { type: "NUMBER" },
    soil_temp_max: { type: "NUMBER" },
  },
} as const;

export interface GeneratedCareRanges {
  soil_moisture_min: number | null;
  soil_moisture_max: number | null;
  soil_ec_min: number | null;
  soil_ec_max: number | null;
  soil_temp_min: number | null;
  soil_temp_max: number | null;
}

function firstSciName(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].trim() || null;
  return null;
}

export function buildPlantCareRangePrompt(plant: { common_name: string; scientific_name?: unknown }): string {
  const sci = firstSciName(plant.scientific_name);
  const label = sci ? `"${plant.common_name}" (${sci})` : `"${plant.common_name}"`;
  return `Give the ideal soil care ranges for healthy growth of ${label} as JSON numbers:
- soil_moisture_min, soil_moisture_max: ideal volumetric soil moisture as whole-number percentages 0–100 (e.g. 30–60 for most veg).
- soil_ec_min, soil_ec_max: ideal nutrient/salinity range in µS/cm (e.g. 800–1800 for fruiting veg); use realistic agronomic values.
- soil_temp_min, soil_temp_max: ideal root-zone soil temperature range in °C.
Use realistic, widely-accepted agronomic values for this species. Output only the JSON object.`;
}

const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Parse the model response. Returns null when nothing usable came back (so the
 * caller doesn't persist an all-null row and can retry later).
 */
export function parseCareRangeResponse(text: string): GeneratedCareRanges | null {
  let obj: Record<string, unknown>;
  try {
    obj = extractJsonObject(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const r: GeneratedCareRanges = {
    soil_moisture_min: fin(obj.soil_moisture_min),
    soil_moisture_max: fin(obj.soil_moisture_max),
    soil_ec_min: fin(obj.soil_ec_min),
    soil_ec_max: fin(obj.soil_ec_max),
    soil_temp_min: fin(obj.soil_temp_min),
    soil_temp_max: fin(obj.soil_temp_max),
  };

  const hasAny = r.soil_moisture_min != null || r.soil_ec_min != null || r.soil_temp_min != null;
  return hasAny ? r : null;
}
