// Guard against poisoning the global plant_library with over-generalised or
// garbage AI enrichments (2026-07-22). Gemini sometimes answers a specific
// plant/cultivar with a bare CATEGORY ("Carrot 'Autumn King'" → common_name
// "Root vegetable" / sci "Daucus carota"), or returns junk scientific names
// ("Herbs are", "Edible plant", "Portal:Trees", garbled unicode). Those rows
// then get matched by scientific_name_key from picks + search, so a real plant
// inherits generic/wrong data.
//
// A library MISS is fine — the AI care-guide path fills a plant on demand — so
// we'd rather reject a dubious enrichment than store it. Pure + Deno-tested
// (supabase/tests/plantEnrichmentGuard.test.ts).

/** Bare category / non-specific common names that must never be a plant's name. */
const GENERIC_CATEGORY_NAMES = new Set([
  "root vegetable", "root vegetables", "leafy green", "leafy greens",
  "leafy vegetable", "leafy vegetables", "salad leaf", "salad leaves",
  "salad green", "salad greens", "herb", "herbs", "vegetable", "vegetables",
  "fruit", "fruits", "flower", "flowers", "legume", "legumes", "brassica",
  "brassicas", "edible plant", "edible plants", "edible root", "tuber", "tubers",
  "grass", "grasses", "weed", "weeds", "shrub", "shrubs", "tree", "trees",
  "houseplant", "houseplants", "succulent", "succulents", "cactus", "cacti",
  "fern", "ferns", "climber", "climbers", "vine", "vines", "bulb", "bulbs",
  "annual", "perennial", "biennial", "plant", "plants",
]);

/** First-token junk signals in a scientific name (truncated sentences etc.). */
const JUNK_SCI_FIRST_TOKENS = new Set([
  "edible", "unlike", "herbs", "portal", "arbor", "general", "various",
  "a", "an", "the", "this", "these", "commonly", "typically",
]);

export interface EnrichmentVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether an AI-enriched plant is specific enough to store in
 * plant_library. Returns `{ ok: false, reason }` for over-generic or garbage
 * enrichments so the caller can skip the insert.
 */
export function isAcceptablePlantEnrichment(
  commonName: string | null | undefined,
  scientificName: string | string[] | null | undefined,
): EnrichmentVerdict {
  const cn = (commonName ?? "").trim();
  if (!cn) return { ok: false, reason: "empty common_name" };
  if (cn.includes(":")) return { ok: false, reason: `common_name contains ':' ("${cn}")` };
  if (GENERIC_CATEGORY_NAMES.has(cn.toLowerCase())) {
    return { ok: false, reason: `generic-category common_name ("${cn}")` };
  }

  const sciRaw = Array.isArray(scientificName) ? scientificName[0] : scientificName;
  const sci = (sciRaw ?? "").trim();
  if (!sci) return { ok: false, reason: "empty scientific_name" };
  if (sci.includes(":")) return { ok: false, reason: `scientific_name contains ':' ("${sci}")` };
  // Reject garbled unicode, but allow the botanical hybrid marker × (U+00D7).
  // deno-lint-ignore no-control-regex
  if (/[^\x00-\x7f×]/.test(sci)) return { ok: false, reason: `non-ASCII scientific_name ("${sci}")` };
  if (GENERIC_CATEGORY_NAMES.has(sci.toLowerCase())) {
    return { ok: false, reason: `scientific_name is a category ("${sci}")` };
  }
  // Must read like a Latin name (letters, spaces, hybrid ×, hyphen, apostrophe,
  // dot) — not a sentence fragment or code.
  if (!/^[A-Za-z][A-Za-z0-9 .×'-]*$/.test(sci)) {
    return { ok: false, reason: `scientific_name not Latin-plausible ("${sci}")` };
  }
  const firstToken = sci.toLowerCase().split(/\s+/)[0];
  if (JUNK_SCI_FIRST_TOKENS.has(firstToken)) {
    return { ok: false, reason: `scientific_name looks like prose ("${sci}")` };
  }

  return { ok: true };
}
