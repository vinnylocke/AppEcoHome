// Shared lookups against free, attributable sources used by the
// `verify-plant-library` flow. Wikipedia gives us a free-form summary;
// GBIF gives us a structured taxonomic backbone match.
//
// Both endpoints are key-less and tolerant. We return null on miss so
// the caller can degrade gracefully (e.g. verify against whichever
// source did return).

export interface WikipediaSummary {
  url: string;
  title: string;
  extract: string;
  /** PD / CC BY-SA depending on the specific article; we tag everything CC BY-SA 4.0 to be safe. */
  licence: string;
  accessed_at: string;
}

export interface GbifMatch {
  url: string;
  scientific_name: string;
  canonical_name: string;
  family: string | null;
  genus: string | null;
  species: string | null;
  rank: string | null;
  status: string | null;
  match_type: string | null;
  /** GBIF backbone is published under CC0. */
  licence: string;
  accessed_at: string;
}

/**
 * Fetch the Wikipedia REST summary for a scientific OR common name.
 * Tries the literal title first; falls back to opensearch to find the
 * best matching article. Returns null when nothing usable is found —
 * the verifier handles missing sources gracefully.
 */
export async function fetchWikipediaSummary(name: string): Promise<WikipediaSummary | null> {
  if (!name?.trim()) return null;
  const accessed_at = new Date().toISOString();

  const trySummary = async (title: string): Promise<WikipediaSummary | null> => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Disambiguation pages have no extract worth using.
      if (data.type && data.type !== "standard") return null;
      const extract: string = data.extract ?? "";
      if (!extract.trim()) return null;
      return {
        url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title ?? title)}`,
        title: data.title ?? title,
        extract,
        licence: "CC BY-SA 4.0",
        accessed_at,
      };
    } catch {
      return null;
    }
  };

  // Direct hit first.
  const direct = await trySummary(name);
  if (direct) return direct;

  // OpenSearch fallback — pick the highest-ranked title and try its summary.
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=3&format=json&origin=*`,
    );
    if (!res.ok) return null;
    const [, titles] = (await res.json()) as [string, string[]];
    for (const title of titles ?? []) {
      const hit = await trySummary(title);
      if (hit) return hit;
    }
  } catch {
    // Network fail — soft miss.
  }

  return null;
}

export interface WikipediaThumbnail {
  url: string;
  source: "wikipedia";
  licence: string;
  page_url: string;
  accessed_at: string;
}

/**
 * Fetch just the thumbnail URL for a plant name via Wikipedia's REST
 * summary API. Used as the seeder's guaranteed fallback when
 * `plant-image-search` returns null (e.g. provider quota / outage).
 * Wikipedia images are usually CC BY-SA 4.0 or public domain — we
 * record `CC BY-SA 4.0` as a conservative default.
 */
export async function fetchWikipediaThumbnail(name: string): Promise<WikipediaThumbnail | null> {
  if (!name?.trim()) return null;
  const accessed_at = new Date().toISOString();

  const trySummary = async (title: string): Promise<WikipediaThumbnail | null> => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.type && data.type !== "standard") return null;
      const url: string | undefined =
        data.thumbnail?.source ?? data.originalimage?.source;
      if (!url) return null;
      return {
        url,
        source: "wikipedia",
        licence: "CC BY-SA 4.0",
        page_url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title ?? title)}`,
        accessed_at,
      };
    } catch {
      return null;
    }
  };

  const direct = await trySummary(name);
  if (direct) return direct;

  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=3&format=json&origin=*`,
    );
    if (!res.ok) return null;
    const [, titles] = (await res.json()) as [string, string[]];
    for (const title of titles ?? []) {
      const hit = await trySummary(title);
      if (hit) return hit;
    }
  } catch {
    // soft miss
  }

  return null;
}

/**
 * Match a scientific name against the GBIF taxonomy backbone. Returns
 * the canonical name, family, and authority status so the verifier can
 * confirm we have the right species. Free, no key required.
 */
export async function fetchGbifMatch(scientificName: string): Promise<GbifMatch | null> {
  if (!scientificName?.trim()) return null;
  const accessed_at = new Date().toISOString();

  try {
    const res = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}&strict=false`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    // matchType "NONE" → GBIF couldn't find this plant. Treat as a miss.
    if (!data || data.matchType === "NONE") return null;

    return {
      url: data.usageKey ? `https://www.gbif.org/species/${data.usageKey}` : "https://api.gbif.org/v1/species",
      scientific_name: data.scientificName ?? scientificName,
      canonical_name: data.canonicalName ?? scientificName,
      family: data.family ?? null,
      genus: data.genus ?? null,
      species: data.species ?? null,
      rank: data.rank ?? null,
      status: data.status ?? null,
      match_type: data.matchType ?? null,
      licence: "CC0 1.0",
      accessed_at,
    };
  } catch {
    return null;
  }
}
