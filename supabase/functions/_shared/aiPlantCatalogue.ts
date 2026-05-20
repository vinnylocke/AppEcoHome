// AI Plant Catalogue helpers
//
// Shared between the plant-doctor edge function (Wave 2) and the
// refresh-stale-ai-plants cron (Wave 4).
//
// - normaliseScientificKey: mirror the GENERATED column on plants
//   (lowercased + whitespace-collapsed first scientific name) so we can
//   look up rows by the same key the DB uses for uniqueness.
//
// - diffCareGuide: per-field comparison of two care_guide_data jsonb
//   payloads. Returns the list of changed field names + a per-field
//   before/after summary for the UI to highlight.

// ──────────────────────────────────────────────────────────────────────────
// Scientific-name key normalisation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the GENERATED column expression on plants.scientific_name_key.
 * Always pair the two — if you change one, change the other.
 *
 * SQL:
 *   lower(trim(regexp_replace(
 *     COALESCE(NULLIF(scientific_name->>0, ''), common_name),
 *     '\s+', ' ', 'g'
 *   )))
 */
export function normaliseScientificKey(scientificName: unknown, commonName: unknown): string | null {
  let primary: string | undefined;

  // scientific_name is stored as jsonb array; accept either array or string.
  if (Array.isArray(scientificName) && scientificName.length > 0) {
    primary = String(scientificName[0] ?? "").trim();
  } else if (typeof scientificName === "string") {
    primary = scientificName.trim();
  }

  if (!primary && typeof commonName === "string") {
    primary = commonName.trim();
  }
  if (!primary) return null;

  return primary.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse a "Common Name (Scientific Name)" match string from Gemini's
 * search_plants_text response into structured pieces.
 */
export function parseMatchString(match: string): { commonName: string; scientificName: string | null } {
  const m = match.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    return { commonName: m[1].trim(), scientificName: m[2].trim() };
  }
  return { commonName: match.trim(), scientificName: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Care-guide diff
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fields in CARE_GUIDE_SCHEMA that are structured (scalar / boolean / sortable
 * array). Diffs on these fields use deep value comparison.
 */
export const STRUCTURED_CARE_FIELDS = [
  "common_name",
  "scientific_name",
  "plant_type",
  "cycle",
  "care_level",
  "growth_rate",
  "maintenance",
  "watering_min_days",
  "watering_max_days",
  "sunlight",
  "flowering_season",
  "harvest_season",
  "pruning_month",
  "propagation",
  "attracts",
  "is_toxic_pets",
  "is_toxic_humans",
  "indoor",
  "is_edible",
  "drought_tolerant",
  "tropical",
  "medicinal",
  "cuisine",
  "thumbnail_url",
] as const;

/**
 * Fields that are free-text. Diff is binary (changed yes/no) — the UI shows
 * a "this section changed" chip but does not highlight individual words.
 */
export const FREE_TEXT_CARE_FIELDS = ["description"] as const;

export type CareGuideDiff = {
  changed: boolean;
  fieldNames: string[];                                  // every field that's different
  perField: Record<string, { before: unknown; after: unknown }>;
};

/**
 * Compare two care_guide_data payloads field-by-field. Both arguments are
 * `{ plantData: {...} }` (the shape we store in plants.care_guide_data).
 */
export function diffCareGuide(oldData: unknown, newData: unknown): CareGuideDiff {
  const oldPlant = (oldData as { plantData?: Record<string, unknown> })?.plantData ?? {};
  const newPlant = (newData as { plantData?: Record<string, unknown> })?.plantData ?? {};

  const fieldNames: string[] = [];
  const perField: Record<string, { before: unknown; after: unknown }> = {};

  for (const field of STRUCTURED_CARE_FIELDS) {
    const a = normaliseFieldValue(oldPlant[field]);
    const b = normaliseFieldValue(newPlant[field]);
    if (!valuesEqual(a, b)) {
      fieldNames.push(field);
      perField[field] = { before: oldPlant[field] ?? null, after: newPlant[field] ?? null };
    }
  }

  for (const field of FREE_TEXT_CARE_FIELDS) {
    const a = typeof oldPlant[field] === "string" ? (oldPlant[field] as string).trim() : "";
    const b = typeof newPlant[field] === "string" ? (newPlant[field] as string).trim() : "";
    if (a !== b) {
      fieldNames.push(field);
      perField[field] = { before: oldPlant[field] ?? null, after: newPlant[field] ?? null };
    }
  }

  return {
    changed: fieldNames.length > 0,
    fieldNames,
    perField,
  };
}

/**
 * Normalise a single value for comparison. Lowercases strings, sorts arrays,
 * trims whitespace. Reduces noise from cosmetic AI variations.
 */
function normaliseFieldValue(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v)) {
    return [...v]
      .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : x))
      .sort();
  }
  return v;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  return false;
}
