/**
 * Season / month value normalisation for the plant care form.
 *
 * Care-guide season + month fields (`flowering_season`, `harvest_season`,
 * `pruning_month`) reach the form from three sources that don't agree on shape:
 *   - AI-catalogue plants store them as a comma-JOINED string
 *     ("Spring, Summer, Autumn") via `plantCatalogue.ts`'s `.join(", ")`.
 *   - Library-cloned plants keep them as arrays (sometimes mixed-case, sometimes
 *     with American "fall").
 *   - Freshly generated guides occasionally slip past the Gemini enum with
 *     lower-case or comma-joined values.
 *
 * These helpers coerce ANY of those into a clean, canonical array so the
 * MultiSelect renders one chip per value (not one chip for a whole joined
 * string) and uses British-English, correctly-cased tokens. Pure + display-only
 * — they never mutate stored data.
 */

const CANONICAL_SEASONS = ["Spring", "Summer", "Autumn", "Winter", "Year-round"] as const;

const SEASON_SYNONYMS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  fall: "Autumn", // American → British
  winter: "Winter",
  "year-round": "Year-round",
  yearround: "Year-round",
  "year round": "Year-round",
  "all year": "Year-round",
  "all-year": "Year-round",
  "all year round": "Year-round",
  perennial: "Year-round",
};

const CANONICAL_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// Lower-cased 3-letter → canonical abbrev. English month names all resolve by
// their first three letters ("september" → "sep", "sept" → "sep").
const MONTH_BY_PREFIX: Record<string, string> = Object.fromEntries(
  CANONICAL_MONTHS.map((m) => [m.toLowerCase(), m]),
);

/** Flatten array-or-string input into trimmed, comma-split raw tokens. */
function toTokens(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input) ? input : input == null ? [] : [input];
  const out: string[] = [];
  for (const el of raw) {
    if (el == null) continue;
    for (const piece of String(el).split(",")) {
      const t = piece.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Normalise a flowering/harvest-season value into a clean array of canonical
 * season names. Handles joined strings, casing, and "fall" → "Autumn".
 * Unrecognised tokens are kept (title-cased) rather than dropped, so a real but
 * unexpected value is never silently lost. Deduped; canonical seasons ordered
 * Spring → Summer → Autumn → Winter → Year-round, extras after in first-seen order.
 */
export function normaliseSeasons(input: unknown): string[] {
  const seen = new Set<string>();
  const canonical: string[] = [];
  const extras: string[] = [];
  for (const token of toTokens(input)) {
    const mapped = SEASON_SYNONYMS[token.toLowerCase()] ?? titleCase(token);
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    (CANONICAL_SEASONS.includes(mapped as never) ? canonical : extras).push(mapped);
  }
  canonical.sort((a, b) => CANONICAL_SEASONS.indexOf(a as never) - CANONICAL_SEASONS.indexOf(b as never));
  return [...canonical, ...extras];
}

/**
 * Normalise a pruning-month value into a clean array of canonical 3-letter
 * month abbreviations. Handles joined strings, full month names, and casing.
 * Unrecognised tokens are dropped. Deduped; ordered Jan → Dec.
 */
export function normaliseMonths(input: unknown): string[] {
  const seen = new Set<string>();
  for (const token of toTokens(input)) {
    const key = token.toLowerCase().slice(0, 3);
    const month = MONTH_BY_PREFIX[key];
    if (month) seen.add(month);
  }
  return CANONICAL_MONTHS.filter((m) => seen.has(m));
}
