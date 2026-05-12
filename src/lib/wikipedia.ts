const wikiCache = new Map<string, any>();

const PLANT_KEYWORDS = [
  "plant", "species", "genus", "cultivar", "variety", "herb", "shrub",
  "tree", "flower", "vegetable", "fruit", "native", "botanical",
  "leaves", "seeds", "roots", "stems", "perennial", "annual",
  "harvest", "garden", "crop", "edible", "legume", "grass", "bulb",
  "grown", "soil", "blooms", "flowering", "foliage",
];

function scorePlantContent(text: string): number {
  const lower = text.toLowerCase();
  return PLANT_KEYWORDS.filter((kw) => lower.includes(kw)).length;
}

// Prefer titles Wikipedia itself disambiguates as a plant/botanical article.
// Falls back to scoring the search snippet for plant vocabulary.
function pickBestTitle(results: any[]): string | null {
  const withPlantInTitle = results.find((r) =>
    /\((plant|flower|herb|vegetable|tree|shrub|crop|cultivar|species)\)/i.test(
      r.title,
    ),
  );
  if (withPlantInTitle) return withPlantInTitle.title;

  const scored = results
    .map((r) => ({ title: r.title, score: scorePlantContent(r.snippet || "") }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].title : null;
}

async function searchWiki(query: string, limit = 5): Promise<any[]> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&utf8=&format=json&origin=*`,
  );
  const data = await res.json();
  return data.query?.search || [];
}

// Try three increasingly broad queries. The first query that yields a
// plant-relevant title wins — we stop searching once we have a good match.
async function findPlantTitle(name: string): Promise<string | null> {
  const queries = [
    `${name} (plant)`,       // matches Wikipedia's explicit plant disambiguation titles
    `${name} plant species`, // narrows results toward botanical articles
    `${name} plant`,         // broadest — original approach as final fallback
  ];

  for (const query of queries) {
    const results = await searchWiki(query);
    const title = pickBestTitle(results);
    if (title) return title;
  }

  return null;
}

export interface WikiImageResult {
  title: string;
  thumbUrl: string; // 300 px wide — safe to store as thumbnail_url
  fullUrl: string;
  source: "wikimedia" | "pixabay";
}

// Strips leading cultivar/variety words so "Graham Thomas Honeysuckle"
// becomes "Honeysuckle" and "Royal Gala Apple" becomes "Gala Apple".
// Single-word and two-word names are returned unchanged.
function simplifyPlantName(name: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return null; // already short enough
  // Try the last two words first (e.g. "Gala Apple"), then just the last word
  return words.slice(-2).join(" ");
}

async function fetchWikimediaImages(query: string): Promise<WikiImageResult[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "300",
    format: "json",
    gsrlimit: "15",
    origin: "*",
  });

  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.query?.pages) return [];

  return (Object.values(data.query.pages) as any[])
    .filter((p) => {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl || !info?.url) return false;
      const mime: string = info.mime ?? "";
      return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
    })
    .map((p) => ({
      title: (p.title as string).replace("File:", ""),
      thumbUrl: p.imageinfo[0].thumburl as string,
      fullUrl: p.imageinfo[0].url as string,
      source: "wikimedia" as const,
    }));
}

/**
 * Searches Wikimedia Commons for photos of the given plant name.
 * If the full cultivar name returns nothing, automatically retries with
 * a simplified name (last 1–2 words) to handle cultivar names like
 * "Graham Thomas Honeysuckle" → "Honeysuckle".
 */
export async function searchWikimediaImages(plantName: string): Promise<WikiImageResult[]> {
  const clean = plantName.split("(")[0].trim();
  if (!clean) return [];

  try {
    const results = await fetchWikimediaImages(clean);
    if (results.length > 0) return results;

    // Cultivar fallback — try simplified name
    const simplified = simplifyPlantName(clean);
    if (!simplified) return [];

    const fallback = await fetchWikimediaImages(simplified);
    if (fallback.length > 0) return fallback;

    // Final fallback — just the last word
    const lastWord = clean.split(/\s+/).pop()!;
    if (lastWord === simplified) return [];
    return await fetchWikimediaImages(lastWord);
  } catch {
    return [];
  }
}

/**
 * Searches Pixabay for plant photos. Requires VITE_PIXABAY_API_KEY.
 * Pixabay License — no attribution required.
 * Uses the simplified (species-level) name + "plant" for best results.
 */
export async function searchPixabayImages(plantName: string): Promise<WikiImageResult[]> {
  const key = import.meta.env.VITE_PIXABAY_API_KEY;
  if (!key) return [];

  const clean = plantName.split("(")[0].trim();
  const words = clean.split(/\s+/);
  // Use last 1–2 words so "Graham Thomas Honeysuckle" searches "honeysuckle plant"
  const searchTerm = words.length > 2 ? words.slice(-2).join(" ") : clean;

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(searchTerm + " plant")}&image_type=photo&per_page=12&safesearch=true&orientation=vertical`,
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.hits ?? []).map((h: any) => ({
      title: h.tags ?? searchTerm,
      thumbUrl: h.webformatURL as string,   // ~640px — good quality for thumbnails
      fullUrl: h.webformatURL as string,
      source: "pixabay" as const,
    }));
  } catch {
    return [];
  }
}

export async function getPlantWikiInfo(plantName: string) {
  if (!plantName) return null;
  const cleanName = plantName.split("(")[0].trim();

  if (wikiCache.has(cleanName)) return wikiCache.get(cleanName);

  const empty = { extract: null, thumbnail: null };

  try {
    const title = await findPlantTitle(cleanName);
    if (!title) {
      wikiCache.set(cleanName, empty);
      return empty;
    }

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    if (!summaryRes.ok) throw new Error("Summary fetch failed");

    const summaryData = await summaryRes.json();

    if (summaryData.type === "disambiguation" || !summaryData.extract) {
      wikiCache.set(cleanName, empty);
      return empty;
    }

    // Final guard: the actual article body must read like a plant article.
    // This catches cases where a brand page slips through with a generic name.
    if (scorePlantContent(summaryData.extract) < 2) {
      wikiCache.set(cleanName, empty);
      return empty;
    }

    const result = {
      extract: summaryData.extract,
      thumbnail:
        summaryData.originalimage?.source ||
        summaryData.thumbnail?.source ||
        null,
    };
    wikiCache.set(cleanName, result);
    return result;
  } catch (err) {
    console.error("Wikipedia fetch failed for:", cleanName, err);
    wikiCache.set(cleanName, empty);
    return empty;
  }
}
