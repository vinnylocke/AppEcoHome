// Plant-name hygiene + library matching for the seasonal picks pipeline
// (2026-07-23). Pure, no I/O — Deno-tested in supabase/tests/plantNameMatch.test.ts.
//
//   - stripPropagationMethod: the picks AI sometimes bakes the propagation
//     method into the name ("Geranium softwood cuttings", "Lavender 'Hidcote'
//     cuttings"). The method already lives in `sow_method`, so strip it from the
//     name — otherwise it's shown as the plant name and locked into the care
//     guide the name generates for.
//   - bestLibraryMatch: `attachPlantLibraryIds` matched a pick to ANY row sharing
//     its scientific_name_key, so a lettuce cultivar attached to whatever single
//     Lactuca sativa row exists — a DIFFERENT cultivar ("Daisy Lambert
//     Butterhead" for "Lollo Rossa"), inheriting its name + sparse data. Only
//     accept a genuine identity match; otherwise return null so the pick resolves
//     via the AI care path with its own name.

/** Trailing propagation-method phrases, longest first so "softwood cuttings"
 *  wins over "cuttings". */
const METHOD_SUFFIXES = [
  "softwood cuttings", "hardwood cuttings", "semi-ripe cuttings", "semi ripe cuttings",
  "greenwood cuttings", "root cuttings", "stem cuttings", "leaf cuttings", "basal cuttings",
  "tip cuttings", "cuttings", "cutting", "divisions", "division", "from seed",
  "from cuttings", "seeds", "seed", "plug plants", "plug plant", "plugs",
  "layering", "offsets", "offset", "transplants",
];

/**
 * Remove a trailing propagation-method phrase from a plant name, repeatedly, so
 * "Geranium softwood cuttings" → "Geranium" and "Lavender 'Hidcote' cuttings" →
 * "Lavender 'Hidcote'". Never returns empty (falls back to the original).
 */
export function stripPropagationMethod(name: string): string {
  let out = (name ?? "").trim();
  let changed = true;
  while (changed && out) {
    changed = false;
    const lower = out.toLowerCase();
    for (const suf of METHOD_SUFFIXES) {
      if (lower.endsWith(" " + suf)) {
        out = out.slice(0, out.length - suf.length - 1).replace(/[\s,\-–—]+$/, "").trim();
        changed = true;
        break;
      }
    }
  }
  return out || (name ?? "").trim();
}

/** Collapse a name to lowercase alphanumerics — matches SQL `search_norm` and
 *  the client `normalizePlantName`, so spacing/punctuation don't matter. */
export function normName(input: string): string {
  return (input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface LibraryCandidate {
  id: number;
  common_name: string;
}

/**
 * Pick the library row that genuinely IS this plant, from the candidates that
 * share its scientific_name_key. Returns:
 *   - an exact (normalised) name match, else
 *   - the generic-species row the pick extends (row name is a prefix of the pick
 *     name — "Radish" for "Radish 'French Breakfast'"; the longest such wins),
 *   - else null — the only same-species rows are DIFFERENT cultivars, so don't
 *     attach; the pick resolves via the AI care path with its own identity.
 */
export function bestLibraryMatch(
  pickName: string,
  candidates: LibraryCandidate[],
): number | null {
  const pn = normName(pickName);
  if (!pn) return null;

  for (const c of candidates) {
    if (normName(c.common_name) === pn) return c.id;
  }

  let best: number | null = null;
  let bestLen = 0;
  for (const c of candidates) {
    const rn = normName(c.common_name);
    // Row is the base species the pick extends: "radish" ⊂ "radishfrenchbreakfast".
    if (rn && rn.length < pn.length && pn.startsWith(rn) && rn.length > bestLen) {
      best = c.id;
      bestLen = rn.length;
    }
  }
  return best;
}
