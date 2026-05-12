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
}

/**
 * Searches Wikimedia Commons for photos of the given plant name.
 * Returns up to 12 JPEG/PNG/WebP results, sorted by relevance.
 * The thumbUrl is a 300px-wide version — appropriate for plant card thumbnails.
 */
export async function searchWikimediaImages(plantName: string): Promise<WikiImageResult[]> {
  const clean = plantName.split("(")[0].trim();
  if (!clean) return [];

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",       // File: namespace
    gsrsearch: clean,
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "300",
    format: "json",
    gsrlimit: "15",
    origin: "*",
  });

  try {
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
