// ─── Plant name helpers ──────────────────────────────────────────────────────
//
// Shared logic for plant search + result display:
//   - normalizePlantName mirrors the SQL `search_norm` column so "crab apple",
//     "crabapple" and "Crab-Apple" all collapse to the same key. Used to build
//     the space-insensitive query the agent-chat plant search sends.
//   - formatOtherNames coerces the many shapes `other_names` arrives in
//     (string[] from providers, jsonb array from plant_library, null) into a
//     clean, de-duplicated string[] for display — never repeating the plant's
//     common or scientific name.

/** Collapse a name to lowercase alphanumerics — matches the SQL search_norm. */
export function normalizePlantName(input: string): string {
  return (input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Normalise an `other_names` value into a display-ready list.
 * @param value    string[] | jsonb array | comma string | null/undefined.
 * @param exclude  names already shown (common/scientific) — dropped, case- and
 *                 spacing-insensitively, so we never echo them back.
 */
export function formatOtherNames(
  value: unknown,
  exclude: (string | null | undefined)[] = [],
): string[] {
  let raw: string[] = [];
  if (Array.isArray(value)) {
    raw = value.map((v) => String(v ?? "").trim());
  } else if (typeof value === "string") {
    // Could be a JSON array string or a comma-joined string.
    const s = value.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) raw = parsed.map((v) => String(v ?? "").trim());
      } catch {
        raw = s.split(",").map((v) => v.trim());
      }
    } else if (s) {
      raw = s.split(",").map((v) => v.trim());
    }
  }

  const excludeKeys = new Set(exclude.filter(Boolean).map((n) => normalizePlantName(String(n))));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of raw) {
    if (!name) continue;
    const key = normalizePlantName(name);
    if (!key || excludeKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
