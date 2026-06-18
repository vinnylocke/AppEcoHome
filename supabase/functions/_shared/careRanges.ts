// Resolving stable plant care ranges for the AI Area Coach.
//
// The authoritative ground-truth ranges live two places: a plant's own
// `plants.soil_*` columns (rarely populated) and the seeded `plant_library`
// knowledge base (matchable by `scientific_name_key`). The Coach drifts when a
// plant has no stored range and the model re-estimates each run — so we fill any
// missing field from the library. Per-field coalesce: the plant's own value
// wins, the library fills gaps, otherwise null (the prompt then estimates only
// that gap). Pure + tested.

export interface CareRanges {
  soil_ph_min: number | null;
  soil_ph_max: number | null;
  soil_moisture_min: number | null;
  soil_moisture_max: number | null;
  soil_ec_min: number | null;
  soil_ec_max: number | null;
  soil_temp_min: number | null;
  soil_temp_max: number | null;
}

const FIELDS: (keyof CareRanges)[] = [
  "soil_ph_min", "soil_ph_max",
  "soil_moisture_min", "soil_moisture_max",
  "soil_ec_min", "soil_ec_max",
  "soil_temp_min", "soil_temp_max",
];

const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Per-field merge: `primary` (the plant) wins; `fallback` (library) fills nulls. */
export function mergeCareRanges(
  primary: Partial<Record<keyof CareRanges, unknown>> | null | undefined,
  fallback: Partial<Record<keyof CareRanges, unknown>> | null | undefined,
): CareRanges {
  const out = {} as CareRanges;
  for (const f of FIELDS) {
    out[f] = fin(primary?.[f]) ?? fin(fallback?.[f]);
  }
  return out;
}

/** First scientific name from a text / jsonb-array / object value. */
function firstSciName(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].trim() || null;
  return null;
}

/**
 * Lowercased lookup key mirroring `plant_library.scientific_name_key`
 * (`lower(coalesce(scientific_name->>0, common_name))`). Used to match a plant
 * to its library entry.
 */
export function careMatchKey(scientificName: unknown, commonName: unknown): string | null {
  const base = firstSciName(scientificName) ?? (typeof commonName === "string" ? commonName.trim() : "");
  return base ? base.toLowerCase() : null;
}
