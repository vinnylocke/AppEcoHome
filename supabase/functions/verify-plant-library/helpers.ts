// Pure helpers extracted from index.ts so the Deno test suite can exercise
// them without triggering the top-level `Deno.serve(...)` registration.

/** Fields the verifier must coerce to a finite number before applying. */
export const NUMERIC_FIELDS = new Set([
  "watering_min_days", "watering_max_days",
  "days_to_harvest_min", "days_to_harvest_max",
  "soil_ph_min", "soil_ph_max",
]);

/** Allowed season vocabulary for `flowering_season` / `harvest_season`. The
 *  seeder writes these exact lowercase strings; the verifier must not drift
 *  into month names just because Wikipedia's prose uses them. */
export const SEASON_ENUM = new Set(["spring", "summer", "autumn", "winter"]);

export const SEASON_FIELDS = new Set(["flowering_season", "harvest_season"]);

/** Multi-value array fields where sources rarely enumerate every legitimate
 *  entry — Wikipedia mentioning one pollinator does NOT prove the other
 *  pollinators we seeded are wrong. We refuse strict-subset amendments to
 *  preserve seed data; additions are still merged in.
 *
 *  NOTE: `pruning_month` is deliberately NOT in this set — it legitimately
 *  stores month names ("march", "october") and is handled like a plain
 *  free-form array. */
export const NON_SHRINKING_ARRAY_FIELDS = new Set([
  "propagation", "attracts", "pest_susceptibility",
  "sunlight", "soil",
]);

// Fields the verifier is allowed to amend. We accept partial updates
// targeted only at the columns that diverged so the AI doesn't rewrite
// the whole row on every call.
export const VERIFIABLE_FIELDS = [
  "common_name", "scientific_name", "family", "plant_type", "cycle",
  "care_level", "watering", "watering_min_days", "watering_max_days",
  "sunlight", "hardiness_min", "hardiness_max", "growth_rate", "growth_habit",
  "maintenance", "is_edible", "is_toxic_pets", "is_toxic_humans",
  "attracts", "description", "drought_tolerant", "salt_tolerant",
  "flowers", "fruits", "indoor", "invasive", "flowering_season",
  "harvest_season", "propagation", "pest_susceptibility", "soil",
  "soil_ph_min", "soil_ph_max", "days_to_harvest_min", "days_to_harvest_max",
] as const;

export type VerifiableField = typeof VERIFIABLE_FIELDS[number];

/**
 * Filter and shape the AI's `updates` object before writing it back to
 * `plant_library`. Three defences:
 *
 *   1. Numeric fields are coerced to finite numbers (or dropped).
 *   2. Season fields are filtered to the allowed enum — month names like
 *      "June" are silently dropped. If nothing remains the field is skipped
 *      entirely (we never wipe an existing season list to `[]`).
 *   3. Multi-value array fields in `NON_SHRINKING_ARRAY_FIELDS` reject
 *      strict-subset amendments. The AI is allowed to ADD entries but not
 *      remove them — sources rarely enumerate every legitimate value, so a
 *      shrinking amendment almost always reflects source incompleteness
 *      rather than our data being wrong. When the amendment adds new
 *      values alongside the existing ones, we merge.
 *
 * `currentRow` provides the existing values for the subset check.
 */
export function pickAllowedUpdates(
  updates: Record<string, unknown>,
  currentRow: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of VERIFIABLE_FIELDS) {
    if (!(key in updates)) continue;
    const raw = updates[key as VerifiableField];

    if (NUMERIC_FIELDS.has(key as string)) {
      // AI sometimes returns numeric fields as strings like "7" or
      // "7-10 days" — postgres rejects the update on type mismatch
      // and we used to silently lose the whole row. Coerce + skip
      // when we can't get a finite number.
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.\-]/g, ""));
      if (!Number.isFinite(n)) continue;
      out[key as VerifiableField] = n;
      continue;
    }

    if (SEASON_FIELDS.has(key as string)) {
      if (!Array.isArray(raw)) continue;
      const cleaned = raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.toLowerCase().trim())
        .filter((v) => SEASON_ENUM.has(v));
      if (cleaned.length === 0) continue;
      out[key as VerifiableField] = Array.from(new Set(cleaned));
      continue;
    }

    if (NON_SHRINKING_ARRAY_FIELDS.has(key as string)) {
      if (!Array.isArray(raw)) continue;
      const incoming = new Set(
        raw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.toLowerCase().trim())
          .filter((v) => v.length > 0),
      );
      const existingArr = Array.isArray(currentRow[key as string])
        ? (currentRow[key as string] as unknown[])
        : [];
      const existing = new Set(
        existingArr
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.toLowerCase().trim())
          .filter((v) => v.length > 0),
      );
      // Reject strict subsets: the amendment removes at least one existing
      // value and adds nothing new. Keeping the original is safer than
      // letting a sparse source overwrite seed data.
      const removed = [...existing].filter((v) => !incoming.has(v));
      const added = [...incoming].filter((v) => !existing.has(v));
      if (existing.size > 0 && removed.length > 0 && added.length === 0) {
        continue;
      }
      // Otherwise merge — preserve every existing value, fold in additions.
      const merged = new Set([...existing, ...incoming]);
      out[key as VerifiableField] = [...merged];
      continue;
    }

    out[key as VerifiableField] = raw;
  }
  return out;
}
