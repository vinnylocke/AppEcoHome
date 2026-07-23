import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages, type GeminiPart } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import {
  selectConfidentImages,
  parseScores,
  MIN_PLANT_PHOTO_CONFIDENCE,
} from "../_shared/plantImageVet.ts";
import {
  resolveMemberHome,
  loadRejectedUrls,
  isRejected,
  filterRejected,
} from "../_shared/imageRejections.ts";

const FN = "plant-image-search";

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
  // Wave 22.0002 — unified image credit shape. Mirrors src/lib/imageCredit.ts.
  image_credit?: {
    provider: string;
    license_name?: string | null;
    license_url?: string | null;
    attribution?: string | null;
    source_url?: string | null;
    commercial_ok?: boolean | null;
  };
}

// Wave 22.0002 — Build the unified ImageCredit from a normalised
// GalleryImage. Lets every consumer carry credit alongside the URL.
function buildGalleryCredit(img: GalleryImage): GalleryImage["image_credit"] {
  if (img.source === "unsplash") {
    return {
      provider:     "unsplash",
      license_name: "Unsplash License",
      license_url:  "https://unsplash.com/license",
      attribution:  img.photographer_name ? `Photo by ${img.photographer_name}` : null,
      source_url:   img.photo_page ?? null,
      commercial_ok: true,
    };
  }
  if (img.source === "pixabay") {
    return {
      provider:     "pixabay",
      license_name: "Pixabay Content License",
      license_url:  "https://pixabay.com/service/license-summary/",
      attribution:  null,
      source_url:   img.pixabay_page ?? null,
      commercial_ok: true,
    };
  }
  if (img.source === "wikipedia") {
    return {
      provider:     "wikipedia",
      license_name: null,
      license_url:  null,
      attribution:  null,
      source_url:   img.wiki_page ?? null,
      commercial_ok: null,
    };
  }
  return { provider: "unknown" };
}

function withUtm(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=rhozly&utm_medium=referral`;
}

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase();
}

/** Rebuild a GalleryImage from a `plant_image_cache` row. */
function imageFromCacheRow(row: {
  query_normalised: string;
  thumb_url: string;
  full_url: string;
  source: "unsplash" | "pixabay" | "wikipedia";
  attribution: Record<string, unknown> | null;
}): GalleryImage {
  const attribution = (row.attribution ?? {}) as Record<string, string | undefined>;
  return {
    id: `cache-${row.source}-${row.query_normalised}`,
    thumb_url: row.thumb_url,
    full_url: row.full_url,
    alt: (attribution.alt as string) ?? row.query_normalised,
    source: row.source,
    photo_page: attribution.photo_page,
    photographer_name: attribution.photographer_name,
    photographer_url: attribution.photographer_url,
    report_url: attribution.report_url,
    wiki_page: attribution.wiki_page,
    pixabay_page: attribution.pixabay_page,
  };
}

/** Strip a GalleryImage down to its serialisable attribution. */
function attributionFromImage(img: GalleryImage): Record<string, string | undefined> {
  return {
    alt: img.alt,
    photo_page: img.photo_page,
    photographer_name: img.photographer_name,
    photographer_url: img.photographer_url,
    report_url: img.report_url,
    wiki_page: img.wiki_page,
    pixabay_page: img.pixabay_page,
  };
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

// ── AI relevance vetting ──────────────────────────────────────────────────
const VET_SCORES_SCHEMA = {
  type: "object",
  properties: { scores: { type: "array", items: { type: "number" } } },
  required: ["scores"],
};

/** Chunked Uint8Array → base64 (avoids spreading huge arrays into btoa). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Fetch a (small) thumbnail and return it as an inline Gemini image part. */
async function fetchImageInline(url: string): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 3_000_000) return null;
    return { inlineData: { data: bytesToBase64(bytes), mimeType } };
  } catch {
    return null;
  }
}

/**
 * Score each candidate photo for how clearly it shows the requested plant and
 * drop those below the confidence threshold. Fails OPEN — any error returns the
 * unvetted images so the gallery never breaks on a model/network glitch.
 */
async function vetGallery<T extends GalleryImage>(
  images: T[],
  query: string,
  apiKey: string,
  db: SupabaseClient | null,
): Promise<T[]> {
  try {
    // Fetch thumbnails as inline parts, keeping alignment with what we got.
    const kept: T[] = [];
    const parts: GeminiPart[] = [];
    for (const img of images) {
      const part = await fetchImageInline(img.thumb_url);
      if (!part) continue;
      kept.push(img);
      parts.push(part);
    }
    if (kept.length === 0) return images; // couldn't fetch any → fail open

    const instruction =
      `A gardener asked to see photos of "${query}". You are shown ${kept.length} candidate ` +
      `photos, in order. For EACH photo, rate 0–1 how confident you are it clearly shows ` +
      `"${query}" as the living, growing plant — NOT seeds, packets, harvested produce on a ` +
      `plate, diagrams, logos, people, or an unrelated plant. Return JSON {"scores":[...]} with ` +
      `exactly ${kept.length} numbers in the SAME order as the photos.`;

    const { text, usage } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([instruction, ...parts]),
      {
        responseSchema: VET_SCORES_SCHEMA,
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 256,
        logContext: { query: query.toLowerCase() },
      },
    );

    if (db) {
      await logAiUsage(db, {
        functionName: FN,
        action: "vet_plant_images",
        usage,
        contextBlock:
          `query: ${query}\n` +
          kept.map((im, i) => `${i + 1}. [${im.source}] ${im.alt}`).join("\n"),
        prompt: instruction,
        rawResult: text,
      });
    }

    return selectConfidentImages(kept, parseScores(text), MIN_PLANT_PHOTO_CONFIDENCE);
  } catch {
    return images; // fail open
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { query, count = 9, vet = false, home_id = null, subject_kind = "plant" } = await req.json();
    if (!query?.trim()) throw new Error("query is required");

    const queryKey = normaliseQuery(query);
    const subjectKind = subject_kind === "ailment" ? "ailment" : "plant";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // Rejection-awareness (2026-07-23 image judge feature): when a home_id is
    // supplied AND the caller is a verified member, load the URLs this home has
    // rejected for this subject, so they are excluded from every candidate pool.
    // Empty set (the common case, and every call without home_id) → zero change.
    let rejectedUrls = new Set<string>();
    if (db && supabaseUrl && home_id) {
      const memberHome = await resolveMemberHome(req, db, supabaseUrl, anonKey, home_id);
      if (memberHome) {
        rejectedUrls = await loadRejectedUrls(db, memberHome, subjectKind, queryKey);
      }
    }
    const hasRejections = rejectedUrls.size > 0;

    // ── Fast path — cache hit for thumbnail-only requests (count === 1) ─
    // The result-list thumbnail is the universal hot path. Skipping the
    // external fetch entirely when we've seen this name before saves a
    // ~1-2s round-trip per result.
    if (db && count === 1) {
      const { data: cached } = await db
        .from("plant_image_cache")
        .select("query_normalised, thumb_url, full_url, source, attribution, expires_at")
        .eq("query_normalised", queryKey)
        .maybeSingle();
      if (
        cached &&
        cached.thumb_url &&
        new Date(cached.expires_at).getTime() > Date.now() &&
        !isRejected(cached, rejectedUrls)
      ) {
        return new Response(
          JSON.stringify({ images: [imageFromCacheRow(cached)] }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
    }

    // ── Vetted-gallery cache hit (vet path only). The vetting model call is
    //    the expensive part, so serve the stored vetted array when fresh.
    if (vet && db) {
      const { data: cachedGallery } = await db
        .from("plant_gallery_cache")
        .select("images, expires_at")
        .eq("query_normalised", queryKey)
        .maybeSingle();
      if (
        cachedGallery &&
        Array.isArray(cachedGallery.images) &&
        cachedGallery.images.length > 0 &&
        new Date(cachedGallery.expires_at).getTime() > Date.now()
      ) {
        const servable = filterRejected(cachedGallery.images, rejectedUrls);
        if (servable.length > 0) {
          return new Response(JSON.stringify({ images: servable }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        // else: every cached image was rejected by this home → fall through to a live refetch.
      }
    }

    const unsplashKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
    const pixabayKey = Deno.env.get("PIXABAY_API_KEY");
    // Wikipedia is always available (no key required) so we never need
    // to hard-fail the function. Missing Unsplash / Pixabay keys just
    // skip those providers — the caller still gets whatever Wikipedia
    // returns, which is enough for a thumbnail.

    const perSource = Math.ceil(count / 3);

    const promises: Promise<GalleryImage[]>[] = [
      unsplashKey ? fetchUnsplash(query, perSource, unsplashKey) : Promise.resolve([]),
      pixabayKey ? fetchPixabay(query, perSource, pixabayKey) : Promise.resolve([]),
      fetchWikipedia(query),
    ];

    const [unsplashRes, pixabayRes, wikiRes] = await Promise.allSettled(promises);

    const unsplash = unsplashRes.status === "fulfilled" ? unsplashRes.value : [];
    const pixabay = pixabayRes.status === "fulfilled" ? pixabayRes.value : [];
    const wiki = wikiRes.status === "fulfilled" ? wikiRes.value : [];

    // Wikipedia first (best reference image), then interleave Unsplash + Pixabay
    const pool: GalleryImage[] = [...wiki];
    const maxLen = Math.max(unsplash.length, pixabay.length);
    for (let i = 0; i < maxLen; i++) {
      if (unsplash[i]) pool.push(unsplash[i]);
      if (pixabay[i]) pool.push(pixabay[i]);
    }

    // Exclude anything this home has rejected (order preserved). Empty result
    // → the response is { images: [] } and the UI keeps its current image.
    const images: GalleryImage[] = filterRejected(pool, rejectedUrls);

    // ── Write-through — upsert the first image so the next caller (any user,
    //    any device) gets it from the DB. CRITICAL: skip when a rejection was
    //    applied — images[0] is then THIS home's next-choice, and the
    //    plant_image_cache row is cross-user, so writing it would leak one
    //    home's reject to everyone. Filtering stays per-home + in-memory only.
    if (db && images[0] && !hasRejections) {
      const first = images[0];
      // Fire-and-forget; we don't want cache writes to block the
      // response. Errors are non-fatal (RLS denial, quota, etc.).
      db.from("plant_image_cache")
        .upsert(
          {
            query_normalised: queryKey,
            thumb_url: first.thumb_url,
            full_url: first.full_url,
            source: first.source,
            attribution: attributionFromImage(first),
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "query_normalised" },
        )
        .then(() => {}, () => {});
    }

    // Wave 22.0002 — attach the unified image_credit to every result
    // before sending it down the wire. Per-provider fields stay too for
    // backwards compatibility with older clients.
    const imagesWithCredit = images.map((img: GalleryImage) => ({
      ...img,
      image_credit: buildGalleryCredit(img),
    }));

    // AI relevance vetting (chat gallery only). Scores each photo for whether
    // it actually shows the plant and drops low-confidence ones; fails open.
    let finalImages = imagesWithCredit;
    if (vet) {
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (geminiKey && finalImages.length > 0) {
        finalImages = await vetGallery(finalImages, query, geminiKey, db);
        // Cache the vetted gallery — non-empty only, so a glitchy all-filtered
        // run can retry next time rather than caching an empty result. Skip when
        // a rejection was applied (the array is this home's filtered set — the
        // cache is cross-user, same leak concern as the count:1 write-through).
        if (db && finalImages.length > 0 && !hasRejections) {
          db.from("plant_gallery_cache")
            .upsert(
              {
                query_normalised: queryKey,
                images: finalImages,
                cached_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              },
              { onConflict: "query_normalised" },
            )
            .then(() => {}, () => {});
        }
      }
    }

    return new Response(JSON.stringify({ images: finalImages }), {
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
