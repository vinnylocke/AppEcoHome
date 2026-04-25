// src/lib/wikipedia.ts

// Simple memory cache so we don't spam Wikipedia for the same plant
const wikiCache = new Map<string, any>();

export async function getPlantWikiInfo(plantName: string) {
  if (!plantName) return null;

  const cleanName = plantName.split("(")[0].trim();

  if (wikiCache.has(cleanName)) {
    return wikiCache.get(cleanName);
  }

  try {
    // STEP 1: Use the Search API to find the exact Wikipedia Page Title
    // We append "plant" to help Wikipedia know we want the botanical result
    let searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName + " plant")}&utf8=&format=json&origin=*`,
    );
    let searchData = await searchRes.json();

    // If no hits with "plant" appended, try just the clean name
    if (!searchData.query?.search?.length) {
      searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName)}&utf8=&format=json&origin=*`,
      );
      searchData = await searchRes.json();

      // If STILL no hits, cache the failure and bail out
      if (!searchData.query?.search?.length) {
        const empty = { extract: null, thumbnail: null };
        wikiCache.set(cleanName, empty);
        return empty;
      }
    }

    // Grab the exact title of the best match
    const exactTitle = searchData.query.search[0].title;

    // STEP 2: Use the exact title to hit the Summary API for the image and text
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(exactTitle)}`,
    );

    if (!summaryRes.ok) throw new Error("Summary fetch failed");

    const summaryData = await summaryRes.json();

    // Ignore disambiguation pages (where Wiki asks "Did you mean X or Y?")
    if (summaryData.type === "disambiguation" || !summaryData.extract) {
      const empty = { extract: null, thumbnail: null };
      wikiCache.set(cleanName, empty);
      return empty;
    }

    const result = {
      extract: summaryData.extract,
      // Favor the high-res original image if available, otherwise thumbnail
      thumbnail:
        summaryData.originalimage?.source ||
        summaryData.thumbnail?.source ||
        null,
    };

    wikiCache.set(cleanName, result);
    return result;
  } catch (err) {
    console.error("Wikipedia fetch failed for:", cleanName, err);
    const emptyResult = { extract: null, thumbnail: null };
    wikiCache.set(cleanName, emptyResult);
    return emptyResult;
  }
}
