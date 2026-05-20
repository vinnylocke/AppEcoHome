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
 * Care-guide fields that the user can actually see and act on in the
 * ManualPlantCreation form. Pair this set with the form's rendered fields —
 * if you add/remove a field from the form, update this list to match.
 *
 * The previous STRUCTURED_CARE_FIELDS list included `maintenance`,
 * `care_level`, `growth_rate`, `description`, `thumbnail_url`, etc. — fields
 * that Gemini happily varies between calls but the user never sees in the
 * form. Diffs on those produced "10 fields updated" toasts for cosmetic
 * Gemini noise.
 *
 * Kept stable / out of the diff:
 *  - common_name / scientific_name (rarely change for the same species)
 *  - description (free-text, Gemini rewords every call → pure noise)
 *  - care_level / growth_rate / maintenance (not rendered in the form)
 *  - thumbnail_url (cosmetic, not a "field change" worth flagging)
 */
export const USER_VISIBLE_CARE_FIELDS = [
  "plant_type",
  "cycle",
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
] as const;

/**
 * Backwards-compatible alias — old name retained so legacy imports keep
 * compiling. Both names point at the same list.
 */
export const STRUCTURED_CARE_FIELDS = USER_VISIBLE_CARE_FIELDS;

/**
 * Free-text fields previously diffed binary (e.g. `description`). Removed
 * entirely from the diff because Gemini's wording variations swamped any
 * real signal. Kept as an exported empty array for callers that iterate it.
 */
export const FREE_TEXT_CARE_FIELDS: readonly string[] = [];

export type CareGuideDiff = {
  changed: boolean;
  fieldNames: string[];                                  // every field that's different
  perField: Record<string, { before: unknown; after: unknown }>;
};

/**
 * Unwrap a care-guide-shaped payload. Accepts either:
 *  - `{ plantData: { ...fields } }` — the shape we store in `plants.care_guide_data`
 *  - `{ ...fields }` — a flat row, e.g. the top-level columns of a plants row
 *
 * Returns the inner field bag in both cases. Lets the diff work uniformly
 * across `care_guide_data` jsonb and plain table rows.
 */
function unwrapCarePayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const inner = obj.plantData;
  if (inner && typeof inner === "object") return inner as Record<string, unknown>;
  return obj;
}

/**
 * Compare two care-guide payloads field-by-field. Both arguments can be
 * either the wrapped `{ plantData: {...} }` shape (what's stored in
 * `plants.care_guide_data`) OR a flat row (e.g. a `plants` row's top-level
 * columns). `unwrapCarePayload` handles both transparently.
 */
export function diffCareGuide(oldData: unknown, newData: unknown): CareGuideDiff {
  const oldPlant = unwrapCarePayload(oldData);
  const newPlant = unwrapCarePayload(newData);

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
