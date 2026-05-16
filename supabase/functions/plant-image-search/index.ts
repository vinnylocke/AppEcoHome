import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export interface GalleryImage {
  id: string;
  /** Small thumbnail (~150–200px) for the strip */
  thumb_url: string;
  /** Medium/full image for the lightbox (~640px) */
  full_url: string;
  alt: string;
  source: "unsplash" | "pixabay" | "wikipedia";
  // Unsplash — attribution required by license
  photo_page?: string;
  photographer_name?: string;
  photographer_url?: string;
  report_url?: string;
  // Wikipedia — attribution by courtesy
  wiki_page?: string;
  // Pixabay — no attribution required, link optional
  pixabay_page?: string;
}

function withUtm(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=rhozly&utm_medium=referral`;
}

async function fetchUnsplash(
  query: string,
  count: number,
  accessKey: string,
): Promise<GalleryImage[]> {
  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=${Math.min(count, 12)}` +
    `&orientation=squarish` +
    `&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" },
  });
  if (!res.ok) return [];

  const payload = await res.json();
  return (payload.results ?? []).map((p: any): GalleryImage => ({
    id: `unsplash-${p.id}`,
    thumb_url: p.urls.thumb,
    full_url: p.urls.small,
    alt: p.alt_description || p.description || query,
    source: "unsplash",
    photo_page: withUtm(`https://unsplash.com/photos/${p.id}`),
    photographer_name: p.user.name,
    photographer_url: withUtm(p.user.links.html),
    report_url: `https://unsplash.com/photos/${p.id}/report`,
  }));
}

async function fetchPixabay(
  query: string,
  count: number,
  apiKey: string,
): Promise<GalleryImage[]> {
  const url =
    `https://pixabay.com/api/` +
    `?key=${apiKey}` +
    `&q=${encodeURIComponent(query)}` +
    `&image_type=photo` +
    `&per_page=${Math.min(Math.max(3, count), 20)}` +
    `&safesearch=true` +
    `&min_width=300`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const payload = await res.json();
  return (payload.hits ?? []).map((p: any): GalleryImage => ({
    id: `pixabay-${p.id}`,
    thumb_url: p.previewURL,
    full_url: p.webformatURL,
    alt: p.tags || query,
    source: "pixabay",
    pixabay_page: p.pageURL,
  }));
}

async function fetchWikipedia(query: string): Promise<GalleryImage[]> {
  const trySummary = async (title: string): Promise<GalleryImage | null> => {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { "Accept": "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fullSrc = data.originalimage?.source || data.thumbnail?.source;
    if (!fullSrc) return null;
    const thumb = data.thumbnail?.source || fullSrc;
    return {
      id: `wiki-${encodeURIComponent(data.title ?? title)}`,
      thumb_url: thumb,
      full_url: fullSrc,
      alt: data.title || title,
      source: "wikipedia",
      wiki_page: data.content_urls?.desktop?.page,
    };
  };

  // Try the query directly first
  let result = await trySummary(query);
  if (result) return [result];

  // Fall back to OpenSearch to find the best matching article title
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php` +
        `?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`,
    );
    if (searchRes.ok) {
      const [, titles] = (await searchRes.json()) as [string, string[]];
      for (const title of titles) {
        result = await trySummary(title);
        if (result) return [result];
      }
    }
  } catch {
    // non-critical — Wikipedia is a bonus source
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { query, count = 9 } = await req.json();
    if (!query?.trim()) throw new Error("query is required");

    const unsplashKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
    const pixabayKey = Deno.env.get("PIXABAY_API_KEY");
    if (!unsplashKey) throw new Error("Missing UNSPLASH_ACCESS_KEY secret");
    // Pixabay is optional — skip gracefully if key not available

    const perSource = Math.ceil(count / 3);

    const promises: Promise<GalleryImage[]>[] = [
      fetchUnsplash(query, perSource, unsplashKey),
      pixabayKey ? fetchPixabay(query, perSource, pixabayKey) : Promise.resolve([]),
      fetchWikipedia(query),
    ];

    const [unsplashRes, pixabayRes, wikiRes] = await Promise.allSettled(promises);

    const unsplash = unsplashRes.status === "fulfilled" ? unsplashRes.value : [];
    const pixabay = pixabayRes.status === "fulfilled" ? pixabayRes.value : [];
    const wiki = wikiRes.status === "fulfilled" ? wikiRes.value : [];

    // Wikipedia first (best reference image), then interleave Unsplash + Pixabay
    const images: GalleryImage[] = [...wiki];
    const maxLen = Math.max(unsplash.length, pixabay.length);
    for (let i = 0; i < maxLen; i++) {
      if (unsplash[i]) images.push(unsplash[i]);
      if (pixabay[i]) images.push(pixabay[i]);
    }

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[plant-image-search]", error.message);
    await captureException("plant-image-search", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
