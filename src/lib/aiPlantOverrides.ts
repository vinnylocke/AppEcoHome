// AI Plant Overhaul Wave 6 — override diff helper
//
// Decides which fields the user changed when they hit Save on an AI plant in
// Plant Edit Modal. The result drives:
//   - whether to show the DetachConfirmModal (any AI care field changed
//     against a catalogue-tracking row triggers it)
//   - what to store in `plants.overridden_fields` after detach
//
// Mirrors the structured-field set + normalisation rules from
// `supabase/functions/_shared/aiPlantCatalogue.ts` so the client and server
// agree on what counts as a change. Free-text fields (description) are
// included in the structured set here too because a description change still
// represents an opt-out signal from the user.

/**
 * The fields we treat as "care guide" data on a plant. Changes to these are
 * what flip a row from catalogue-tracking to custom.
 *
 * Pair this set with `STRUCTURED_CARE_FIELDS` + `FREE_TEXT_CARE_FIELDS` in
 * `supabase/functions/_shared/aiPlantCatalogue.ts` — if you add a field
 * there, add it here.
 */
export const OVERRIDABLE_CARE_FIELDS = [
  "common_name",
  "scientific_name",
  "description",
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
] as const;

export type OverridableField = (typeof OVERRIDABLE_CARE_FIELDS)[number];

/**
 * Normalise a single field value for comparison. Lowercases strings, sorts
 * arrays, treats null/undefined/"" as equivalent. Reduces noise from form
 * defaults that don't represent a real user edit.
 */
function normalise(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed.toLowerCase();
  }
  if (Array.isArray(v)) {
    return [...v]
      .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : x))
      .filter((x) => x !== "" && x != null)
      .sort();
  }
  if (typeof v === "number" && Number.isNaN(v)) return null;
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

/**
 * Compare an existing plant row's top-level fields against the form
 * submission to find which AI care fields the user changed.
 *
 * Returns the sorted, de-duplicated list of field names. Empty array means
 * the user saved without changing any AI care field (e.g. they only updated
 * a label or thumbnail).
 */
export function diffOverriddenFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): OverridableField[] {
  const beforeRow = before ?? {};
  const afterRow = after ?? {};
  const changed: OverridableField[] = [];

  for (const field of OVERRIDABLE_CARE_FIELDS) {
    const a = normalise(beforeRow[field]);
    const b = normalise(afterRow[field]);
    if (!valuesEqual(a, b)) {
      changed.push(field);
    }
  }
  return changed;
}

/**
 * Merge a new list of overridden fields into an existing one (e.g. the user
 * already has overrides and is now editing additional fields). Result is
 * sorted + de-duplicated for stable storage.
 */
export function mergeOverriddenFields(
  existing: string[] | null | undefined,
  added: string[],
): string[] {
  const set = new Set<string>([...(existing ?? []), ...added]);
  return [...set].sort();
}
