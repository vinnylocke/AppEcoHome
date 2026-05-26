// Deterministic plant name discovery for the Plant Library seeder.
//
// Instead of asking Gemini to "propose 30 plants we don't have yet"
// — which it does poorly because its distribution skews to famous
// species and the avoid list can't fix that — we pull names from
// Wikipedia's category APIs (free, no key) and use AI only to enrich
// each named plant with care data. Duplicates become impossible by
// construction: we filter against the DB BEFORE the AI call.
//
// Categories are picked at random from a curated list spanning broad
// plant types (Vegetables, Herbs, Houseplants, etc.) and dedicated
// cultivar categories (Tomato_cultivars, Rose_cultivars, etc.) so the
// seeded library mixes species-level entries with named varieties.
//
// Wikipedia API endpoint:
//   /w/api.php?action=query&list=categorymembers
// Free, no key, ~200 req/min anonymous limit (way above our usage).

/** Categories of cultivated plants suitable for a garden knowledge base. */
const CATEGORIES = [
  // Broad types
  "Garden_plants",
  "Vegetables",
  "Leaf_vegetables",
  "Root_vegetables",
  "Fruit_vegetables",
  "Edible_legumes",
  "Herbs",
  "Culinary_herbs",
  "Medicinal_plants",
  "Fruits",
  "Berries",
  "Tropical_fruit",
  "Houseplants",
  "Ornamental_grasses",
  "Shrubs",
  "Trees",
  "Climbing_plants",
  "Succulents",
  "Cacti",
  "Bulbous_plants",
  "Annual_plants",
  "Perennials",
  "Edible_flowers",
  "Aquatic_plants",
  "Drought-tolerant_plants",
  // Cultivar-rich categories
  "Tomato_cultivars",
  "Apple_cultivars",
  "Rose_cultivars",
  "Lavender_cultivars",
  "Capsicum_cultivars",
  "Pear_cultivars",
  "Plum_cultivars",
  "Cherry_cultivars",
  "Grape_varieties",
  "Strawberry_cultivars",
  "Potato_cultivars",
  "Onion_cultivars",
  "Cabbage_cultivars",
  "Lettuce_cultivars",
];

/** Heuristic title filter — drops obvious non-plant articles. */
function isLikelyPlantTitle(title: string): boolean {
  if (!title || typeof title !== "string") return false;
  if (title.startsWith("List of ")) return false;
  if (title.startsWith("Lists of ")) return false;
  if (title.startsWith("Category:")) return false;
  if (title.startsWith("Template:")) return false;
  if (title.startsWith("File:")) return false;
  if (title.startsWith("Index of ")) return false;
  if (title.startsWith("Outline of ")) return false;
  if (title.startsWith("History of ")) return false;
  if (title.startsWith("Glossary of ")) return false;
  // Disambiguation pages — usually titled with "(disambiguation)" or
  // are plain genus pages that aren't a single cultivable plant.
  if (title.includes("(disambiguation)")) return false;
  return true;
}

/**
 * Strip parenthetical qualifiers Wikipedia adds to disambiguate titles.
 * "Tomato (plant)" → "Tomato"; "Pepper (Capsicum)" → "Pepper". Keeps
 * the AI prompt clean — the original title is preserved by the caller
 * if needed.
 */
export function cleanPlantName(title: string): string {
  return title.replace(/\s*\(.+?\)\s*$/g, "").trim();
}

export interface CategoryMembersPage {
  titles: string[];
  /** Opaque cursor for the next page; null when we've reached the end. */
  cmcontinue: string | null;
}

/**
 * Fetch one page of Wikipedia category members. `limit` capped at 500
 * by the API; we pass `cmtype=page` so subcategories aren't returned
 * as plant titles.
 */
export async function fetchCategoryMembers(
  category: string,
  limit = 500,
  cmcontinue?: string,
): Promise<CategoryMembersPage> {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmtype: "page",
    cmlimit: String(Math.min(500, Math.max(1, limit))),
    format: "json",
    origin: "*",
  });
  if (cmcontinue) params.set("cmcontinue", cmcontinue);
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { titles: [], cmcontinue: null };
    const data = await res.json();
    const members = data?.query?.categorymembers ?? [];
    const titles: string[] = members
      .map((m: { title?: string }) => m.title ?? "")
      .filter(isLikelyPlantTitle);
    const next: string | undefined = data?.continue?.cmcontinue;
    return { titles, cmcontinue: next ?? null };
  } catch {
    return { titles: [], cmcontinue: null };
  }
}

/**
 * One candidate plant name, optionally pre-resolved to a scientific
 * binomial when the source (iNat / Wikidata) supplies it directly.
 * Wikipedia-sourced candidates carry `sciName: null` and trigger
 * the per-candidate Wikipedia summary lookup downstream; the other
 * two sources skip that round-trip entirely.
 */
export interface CandidatePlant {
  name: string;
  /** Best-known scientific binomial. Lowercased + whitespace-collapsed
   *  the same way the DB's generated `scientific_name_key` column is. */
  sciName: string | null;
  /** Which source produced this candidate — for debug + log only. */
  source: "wikipedia" | "inaturalist" | "wikidata" | "gbif" | "perenual" | "verdantly" | "caller_supplied";
}

const USER_AGENT =
  "Rhozly/1.0 PlantLibrarySeeder (https://rhozly.com; admin contact: vinnylocke@gmail.com)";

// ─── Cursor helpers ────────────────────────────────────────────────
//
// Cursor-driven sources walk their catalogues sequentially using
// state stored in `plant_library_source_cursors`. Each fetch reads
// the current cursor, fetches the next N pages, and advances the
// cursor. Once a source returns empty (catalogue end) we mark it
// `exhausted` and subsequent fetches no-op.
//
// Concurrent submits CAN race on cursor reads — two parallel
// submits might both fetch the same page. The DB's
// `scientific_name_key` unique index dedupes the insert anyway, so
// the worst case is a couple wasted API calls per race. Not worth
// the locking complexity for our admin-only volume.

interface CursorRow {
  source: string;
  cursor: Record<string, unknown>;
  status: "active" | "exhausted";
}

async function readCursor(db: any, source: string): Promise<CursorRow | null> {
  const { data } = await db
    .from("plant_library_source_cursors")
    .select("source, cursor, status")
    .eq("source", source)
    .maybeSingle();
  return data ?? null;
}

async function advanceCursor(
  db: any,
  source: string,
  newCursor: Record<string, unknown>,
): Promise<void> {
  await db
    .from("plant_library_source_cursors")
    .update({ cursor: newCursor, updated_at: new Date().toISOString() })
    .eq("source", source);
}

async function markCursorExhausted(db: any, source: string): Promise<void> {
  await db
    .from("plant_library_source_cursors")
    .update({
      status: "exhausted",
      exhausted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("source", source);
}

/**
 * iNaturalist taxa API — returns 200 plant species per page sorted
 * by global observation count. Random page in [1, 500] reaches deep
 * into the long tail (~100k species) so we don't keep re-sampling
 * the top 10k popular plants that already saturate the DB. Bias is
 * still toward observation-rich species (real, identifiable, often
 * cultivated) but with much more variety per draw.
 *
 * Free, no key. taxon_id 47126 = Plantae kingdom.
 */
export async function fetchInaturalistTaxa(perPage = 200): Promise<CandidatePlant[]> {
  const page = 1 + Math.floor(Math.random() * 500);
  const url = new URL("https://api.inaturalist.org/v1/taxa");
  url.searchParams.set("taxon_id", "47126"); // Plantae
  url.searchParams.set("rank", "species");
  url.searchParams.set("per_page", String(Math.min(200, perPage)));
  url.searchParams.set("page", String(page));
  url.searchParams.set("order_by", "observations_count");
  url.searchParams.set("order", "desc");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    return results
      .map((r): CandidatePlant | null => {
        // iNat `name` is the scientific binomial; `preferred_common_name`
        // is the English common name (null for many obscure taxa).
        const sci: string | null = typeof r.name === "string" ? r.name.trim() : null;
        const common: string | null = typeof r.preferred_common_name === "string"
          ? r.preferred_common_name.trim()
          : null;
        // Prefer common name as the display "name" we hand to AI; fall
        // back to scientific when there's no English common name.
        const name = common || sci;
        if (!name) return null;
        return { name, sciName: sci, source: "inaturalist" };
      })
      .filter((c): c is CandidatePlant => c !== null);
  } catch {
    return [];
  }
}

/**
 * Wikidata SPARQL — pull a slice of taxa under the Plantae kingdom
 * (Q756) with English labels + a scientific name. Walks the
 * catalogue sequentially via cursor.offset, advancing by LIMIT
 * each call. Wikidata's labeled Plantae set is large enough that
 * we won't exhaust it for a long time.
 *
 * P225 = taxon name. P171 = parent taxon. Wikimedia policy
 * requires a descriptive User-Agent string.
 */
export async function fetchWikidataPlants(db: any): Promise<CandidatePlant[]> {
  const cursorRow = await readCursor(db, "wikidata");
  if (!cursorRow || cursorRow.status === "exhausted") return [];

  const offset = typeof cursorRow.cursor?.offset === "number"
    ? (cursorRow.cursor.offset as number)
    : 0;
  const LIMIT = 500;
  const query = `
SELECT DISTINCT ?item ?common ?sci WHERE {
  ?item wdt:P225 ?sci .
  ?item wdt:P171* wd:Q756 .
  ?item rdfs:label ?common . FILTER(LANG(?common) = "en")
}
LIMIT ${LIMIT} OFFSET ${offset}
`.trim();

  try {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `query=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const bindings: any[] = data?.results?.bindings ?? [];

    if (bindings.length === 0) {
      await markCursorExhausted(db, "wikidata");
      return [];
    }
    await advanceCursor(db, "wikidata", { offset: offset + LIMIT });

    return bindings
      .map((b): CandidatePlant | null => {
        const sci: string | null = b?.sci?.value ? String(b.sci.value).trim() : null;
        const common: string | null = b?.common?.value ? String(b.common.value).trim() : null;
        const name = common || sci;
        if (!name) return null;
        if (name.length < 2 || name.length > 120) return null;
        if (/^\d+$/.test(name)) return null;
        return { name, sciName: sci, source: "wikidata" };
      })
      .filter((c): c is CandidatePlant => c !== null);
  } catch {
    return [];
  }
}

/**
 * GBIF species search — accepted Plantae species. Walks the
 * catalogue sequentially via cursor.offset (advancing by LIMIT
 * each call). GBIF's search API caps offset at 100,000, so the
 * cursor effectively walks the first ~100k accepted species. When
 * we reach that cap or get an empty response, we mark exhausted.
 *
 * `status=ACCEPTED` skips taxonomic synonyms.
 */
export async function fetchGbifPlants(db: any): Promise<CandidatePlant[]> {
  const cursorRow = await readCursor(db, "gbif");
  if (!cursorRow || cursorRow.status === "exhausted") return [];

  const offset = typeof cursorRow.cursor?.offset === "number"
    ? (cursorRow.cursor.offset as number)
    : 0;
  // GBIF's offset cap is 100,000.
  if (offset >= 99_999) {
    await markCursorExhausted(db, "gbif");
    return [];
  }
  const LIMIT = 100;

  const url = new URL("https://api.gbif.org/v1/species/search");
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("kingdom", "Plantae");
  url.searchParams.set("status", "ACCEPTED");
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("offset", String(offset));

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data?.results ?? [];

    if (results.length === 0) {
      await markCursorExhausted(db, "gbif");
      return [];
    }
    await advanceCursor(db, "gbif", { offset: offset + LIMIT });

    return results
      .map((r): CandidatePlant | null => {
        const sci: string | null =
          typeof r.canonicalName === "string" && r.canonicalName.trim()
            ? r.canonicalName.trim()
            : (typeof r.scientificName === "string" ? r.scientificName.trim() : null);
        let common: string | null = null;
        if (Array.isArray(r.vernacularNames)) {
          const enHit = r.vernacularNames.find(
            (v: any) => typeof v?.vernacularName === "string" &&
              (v.language === "eng" || v.language === "en"),
          );
          if (enHit) common = String(enHit.vernacularName).trim();
        }
        const name = common || sci;
        if (!name) return null;
        if (name.length < 2 || name.length > 120) return null;
        return { name, sciName: sci, source: "gbif" };
      })
      .filter((c): c is CandidatePlant => c !== null);
  } catch {
    return [];
  }
}

/** Parse one page of Perenual results into CandidatePlant[]. */
function parsePerenualPage(results: any[]): CandidatePlant[] {
  return results
    .map((r): CandidatePlant | null => {
      const common: string | null = typeof r.common_name === "string"
        ? r.common_name.trim()
        : null;
      const sciArr = Array.isArray(r.scientific_name) ? r.scientific_name : [];
      const sci: string | null = sciArr.length > 0 && typeof sciArr[0] === "string"
        ? sciArr[0].trim()
        : null;
      const name = common || sci;
      if (!name) return null;
      if (name.length < 2 || name.length > 120) return null;
      return { name, sciName: sci, source: "perenual" };
    })
    .filter((c): c is CandidatePlant => c !== null);
}

/**
 * Perenual species-list — paid horticultural API curated for garden
 * apps (~120k species). Walks the catalogue page-by-page using a
 * cursor in `plant_library_source_cursors`, advancing through ~4000
 * pages (30 plants each) over many submits.
 *
 * `PAGES_PER_CALL` controls how aggressive each iteration is —
 * higher = more progress per submit, more API calls per submit.
 * Perenual paid tier accommodates several hundred calls/day easily.
 *
 * Requires PERENUAL_API_KEY (already configured).
 */
export async function fetchPerenualPlants(db: any): Promise<CandidatePlant[]> {
  const apiKey = Deno.env.get("PERENUAL_API_KEY");
  if (!apiKey) return [];

  const cursorRow = await readCursor(db, "perenual");
  if (!cursorRow || cursorRow.status === "exhausted") return [];

  const startPage = typeof cursorRow.cursor?.page === "number"
    ? (cursorRow.cursor.page as number)
    : 1;
  const PAGES_PER_CALL = 3;

  const accumulated: CandidatePlant[] = [];
  let lastFetchedPage = startPage - 1;
  let hitEmptyPage = false;

  for (let p = startPage; p < startPage + PAGES_PER_CALL; p++) {
    const params = new URLSearchParams({ key: apiKey, page: String(p) });
    const url = `https://perenual.com/api/v2/species-list?${params.toString()}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) break;
      const data = await res.json();
      const results: any[] = data?.data ?? [];
      if (results.length === 0) {
        hitEmptyPage = true;
        break;
      }
      accumulated.push(...parsePerenualPage(results));
      lastFetchedPage = p;
    } catch {
      break;
    }
  }

  if (hitEmptyPage) {
    await markCursorExhausted(db, "perenual");
  } else if (lastFetchedPage >= startPage) {
    await advanceCursor(db, "perenual", { page: lastFetchedPage + 1 });
  }

  return accumulated;
}

/** Parse one page of Verdantly results into CandidatePlant[]. */
function parseVerdantlyPage(items: any[]): CandidatePlant[] {
  return items
    .map((v): CandidatePlant | null => {
      const common: string | null =
        (typeof v.common_name === "string" && v.common_name.trim()) ||
        (typeof v.name === "string" && v.name.trim()) ||
        null;
      const sci: string | null = typeof v.scientific_name === "string"
        ? v.scientific_name.trim()
        : (Array.isArray(v.scientific_name) && typeof v.scientific_name[0] === "string"
          ? v.scientific_name[0].trim()
          : null);
      const name = common || sci;
      if (!name) return null;
      if (name.length < 2 || name.length > 120) return null;
      return { name, sciName: sci, source: "verdantly" };
    })
    .filter((c): c is CandidatePlant => c !== null);
}

/**
 * Verdantly varieties search via RapidAPI. The API requires a query
 * (no browse endpoint), so we walk letter-by-letter (a→z), paging
 * within each letter until empty, then advancing to the next letter.
 * Cursor tracks { letter, page }.
 *
 * Each fetch grabs `PAGES_PER_CALL` pages of the current letter
 * (advancing to the next letter mid-call if the current letter
 * exhausts). When letter advances past 'z', the source is marked
 * exhausted.
 *
 * Requires VERDANTLY_API_KEY.
 */
export async function fetchVerdantlyPlants(db: any): Promise<CandidatePlant[]> {
  const apiKey = Deno.env.get("VERDANTLY_API_KEY");
  if (!apiKey) return [];

  const cursorRow = await readCursor(db, "verdantly");
  if (!cursorRow || cursorRow.status === "exhausted") return [];

  let letter = typeof cursorRow.cursor?.letter === "string"
    ? (cursorRow.cursor.letter as string)
    : "a";
  let page = typeof cursorRow.cursor?.page === "number"
    ? (cursorRow.cursor.page as number)
    : 1;

  const PAGES_PER_CALL = 3;
  const accumulated: CandidatePlant[] = [];
  let pagesFetched = 0;

  while (pagesFetched < PAGES_PER_CALL && letter <= "z") {
    const url = `https://verdantly-gardening-api.p.rapidapi.com/v2/plants/varieties/search?page=${page}&q=${letter}&sortOrder=asc`;
    let items: any[] = [];
    let pages: number | null = null;
    try {
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Host": "verdantly-gardening-api.p.rapidapi.com",
          "X-RapidAPI-Key": apiKey,
          Accept: "application/json",
        },
      });
      if (!res.ok) break;
      const data = await res.json();
      items = data?.data ?? [];
      pages = typeof data?.meta?.pages === "number" ? data.meta.pages : null;
    } catch {
      break;
    }

    if (items.length > 0) {
      accumulated.push(...parseVerdantlyPage(items));
      pagesFetched += 1;
      page += 1;
      // Advance to next letter when we've consumed all pages of current.
      if (pages != null && page > pages) {
        letter = String.fromCharCode(letter.charCodeAt(0) + 1);
        page = 1;
      }
    } else {
      // Empty page → assume current letter is done, advance.
      letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      page = 1;
    }
  }

  if (letter > "z") {
    await markCursorExhausted(db, "verdantly");
  } else {
    await advanceCursor(db, "verdantly", { letter, page });
  }

  return accumulated;
}

/**
 * Wrap a source fetch in a timeout. Returns the source's default
 * empty value when it times out so one slow / hanging upstream
 * can't drain the iteration budget. 8s covers any reasonable
 * network round-trip and server-side query.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * Names of sources used by `fetchCandidatePlantNames`. The caller's
 * fresh-rate skip logic uses these as identifiers to track which
 * sources to mute for the rest of a submit.
 *
 * Wikipedia + iNaturalist were dropped from the active source pool
 * once they started returning mostly duplicates of popular plants
 * already in the DB (their random sampling re-hits the same head of
 * the distribution every call). Both helpers (`fetchCategoryMembers`,
 * `fetchInaturalistTaxa`) remain exported so they can be invoked
 * ad-hoc or re-enabled later, but `fetchCandidatePlantNames` no
 * longer calls them.
 */
export type SourceName =
  | "wikidata"
  | "gbif"
  | "perenual"
  | "verdantly";

/** All active source ids — exported for the caller's mute loop. */
export const ACTIVE_SOURCES: ReadonlyArray<SourceName> = [
  "wikidata",
  "gbif",
  "perenual",
  "verdantly",
];

/**
 * Fresh-rate floor below which a source gets muted for the rest of
 * the current submit. Below 10% means out of 100 candidates fetched,
 * fewer than 10 made it past the DB pre-filter — the source is mostly
 * returning plants we already have.
 */
export const FRESH_RATE_THRESHOLD = 0.10;

/**
 * Pick `count` candidate plant names by merging SIX sources in
 * parallel:
 *
 *   1. Wikipedia categories — curated, gardener-relevant, popular
 *      bias. RANDOM sampling.
 *   2. iNaturalist — random long-tail page. RANDOM sampling.
 *   3. Wikidata SPARQL — labeled Plantae taxa, cursor-driven
 *      sequential pagination via `plant_library_source_cursors`.
 *   4. GBIF species — accepted Plantae, cursor-driven sequential.
 *   5. Perenual — paid horticultural API, cursor-driven sequential
 *      page walk (3 pages per call). The big new supply now that
 *      saturation is biting.
 *   6. Verdantly — paid varieties API, cursor-driven letter+page
 *      walk (a→z, pages within each letter).
 *
 * Each source is wrapped in an 8s timeout so a slow upstream
 * returns [] instead of stalling the iteration.
 *
 * `skipSources` lets the caller mute specific sources for the rest
 * of a submit when their fresh-rate has dropped below threshold.
 *
 * Returns candidates deduped by lowercased name.
 */
export async function fetchCandidatePlantNames(
  db: any,
  count: number,
  skipSources: Set<SourceName> = new Set(),
): Promise<CandidatePlant[]> {
  const PER_SOURCE_TIMEOUT_MS = 8000;
  const empty: CandidatePlant[] = [];

  const [wdRes, gbifRes, perRes, verdRes] = await Promise.all([
    skipSources.has("wikidata")
      ? Promise.resolve(empty)
      : withTimeout(fetchWikidataPlants(db), PER_SOURCE_TIMEOUT_MS, empty),
    skipSources.has("gbif")
      ? Promise.resolve(empty)
      : withTimeout(fetchGbifPlants(db), PER_SOURCE_TIMEOUT_MS, empty),
    skipSources.has("perenual")
      ? Promise.resolve(empty)
      : withTimeout(fetchPerenualPlants(db), PER_SOURCE_TIMEOUT_MS, empty),
    skipSources.has("verdantly")
      ? Promise.resolve(empty)
      : withTimeout(fetchVerdantlyPlants(db), PER_SOURCE_TIMEOUT_MS, empty),
  ]);

  const pool = new Map<string, CandidatePlant>();

  // Merge each source — prefer the entry with a scientific name when
  // we have multiple hits for the same common name. All pass through
  // the cleaner just in case any source has parenthetical noise.
  const mergeSource = (incoming: CandidatePlant[]) => {
    for (const c of incoming) {
      const cleaned = cleanPlantName(c.name);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      const existing = pool.get(key);
      if (!existing || (!existing.sciName && c.sciName)) {
        pool.set(key, { ...c, name: cleaned });
      }
    }
  };
  mergeSource(wdRes);
  mergeSource(gbifRes);
  mergeSource(perRes);
  mergeSource(verdRes);

  const shuffled = [...pool.values()].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.max(0, count));
}

function pickRandomCategories(n: number): string[] {
  const out: string[] = [];
  const available = [...CATEGORIES];
  const take = Math.min(n, available.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(Math.random() * available.length);
    out.push(available.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Pull the binomial (Genus species) out of a Wikipedia summary
 * extract. Almost every plant article opens with "Foo bar
 * (Scientific name)" or "Scientific name (also known as Foo bar)";
 * either way the binomial sits in the first sentence as an italic
 * capitalised+lowercase pair.
 *
 * Returns null when no match — caller falls back to using the
 * common_name as the dedup key (current behaviour pre-this change).
 *
 * Conservative pattern: only matches when both halves look like a
 * real binomial (Genus capitalised, species lowercase, no
 * punctuation). False positives in the wild are rare; false
 * negatives are fine because we just don't pre-filter that
 * candidate's key and let ON CONFLICT mop up.
 */
export function extractScientificName(extract: string | null | undefined): string | null {
  if (!extract) return null;
  const window = extract.slice(0, 600);
  // Match "Capitalised Word" + space + "lowercase-word" — basic
  // binomial shape. Stop before any non-letter to avoid trailing
  // 'L.' authority abbreviations.
  const m = window.match(/\b([A-Z][a-z]{2,})\s+([a-z][a-z-]{2,})\b/);
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

/**
 * JS mirror of the `scientific_name_key` generated column on
 * `plant_library`. MUST stay byte-equivalent to the SQL formula
 * (lowercase + trim + collapse whitespace, prefers scientific name
 * over common name when available) or pre-filter results will
 * disagree with what the unique index actually accepts.
 *
 * SQL formula (from 20260624000900_plant_library.sql):
 *   lower(trim(both from regexp_replace(
 *     COALESCE(NULLIF((scientific_name->>0), ''), common_name),
 *     '\\s+', ' ', 'g'
 *   )))
 */
export function computeSciKey(
  scientificName: string | null,
  commonName: string,
): string {
  const source = (scientificName?.trim() || commonName).trim();
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}
