// ailment-image-search — the ailment (pest / disease / invasive) counterpart to
// plant-image-search. A structural fork: it drops Unsplash/Pixabay (decorative-
// plant-dense, aesthetic ranking) and instead pulls from sources that actually
// carry organism / damage photography — Perenual's curated pest-disease images
// FIRST (when a name/scientific match resolves), then iNaturalist (large, free,
// CC-licensed organism photos), then Wikipedia by clean title — and vets with an
// ailment-aware Gemini prompt (_shared/ailmentImageVet.ts) instead of the plant
// "is this the living plant" vet, which would downrank a correct insect macro.
//
// Rejection-aware (shared with plant-image-search via _shared/imageRejections):
// when a home_id is a verified member, this home's rejected URLs are excluded
// from every candidate pool and — critically — the shared caches are NOT written
// when a rejection is applied, so one home's reject never leaks cross-home.
//
// Caches are service-role-only (ailment_image_cache count:1, ailment_gallery_cache
// vetted). See docs/plans/image-judge-and-replace.md.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages, type GeminiPart } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { parseScores, selectConfidentImages } from "../_shared/plantImageVet.ts";
import { AILMENT_PHOTO_CONFIDENCE, buildAilmentVetInstruction } from "../_shared/ailmentImageVet.ts";
import {
  resolveMemberHome,
  loadRejectedUrls,
  isRejected,
  filterRejected,
} from "../_shared/imageRejections.ts";

const FN = "ailment-image-search";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GalleryImage {
  id: string;
  thumb_url: string;
  full_url: string;
  alt: string;
  source: "perenual" | "inaturalist" | "wikipedia";
  source_url?: string | null;
  /** iNaturalist requires an attribution string; Perenual/Wikipedia optional. */
  attribution?: string | null;
  license_name?: string | null;
  image_credit?: Record<string, unknown>;
}

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase();
}

function buildAilmentCredit(img: GalleryImage): Record<string, unknown> {
  if (img.source === "inaturalist") {
    const cc = (img.license_name ?? "").toLowerCase();
    return {
      provider: "inaturalist",
      license_name: img.license_name ?? null,
      attribution: img.attribution ?? null,
      source_url: img.source_url ?? null,
      commercial_ok: cc.includes("cc0") || cc === "cc-by" || cc === "cc-by-sa",
    };
  }
  if (img.source === "perenual") {
    return {
      provider: "perenual",
      license_name: img.license_name ?? null,
      attribution: img.attribution ?? null,
      source_url: img.source_url ?? null,
      commercial_ok: null,
    };
  }
  return {
    provider: "wikipedia",
    license_name: null,
    attribution: null,
    source_url: img.source_url ?? null,
    commercial_ok: null,
  };
}

/** Rebuild a GalleryImage from an ailment_image_cache row. */
function imageFromCacheRow(row: {
  query_normalised: string;
  thumb_url: string;
  full_url: string;
  source: string;
  attribution: Record<string, unknown> | null;
}): GalleryImage {
  const a = (row.attribution ?? {}) as Record<string, unknown>;
  return {
    id: `cache-${row.source}-${row.query_normalised}`,
    thumb_url: row.thumb_url,
    full_url: row.full_url,
    alt: (a.alt as string) ?? row.query_normalised,
    source: (row.source as GalleryImage["source"]) ?? "wikipedia",
    source_url: (a.source_url as string) ?? null,
    attribution: (a.attribution as string) ?? null,
    license_name: (a.license_name as string) ?? null,
    image_credit: a.image_credit as Record<string, unknown> | undefined,
  };
}

function attributionFromImage(img: GalleryImage): Record<string, unknown> {
  return {
    alt: img.alt,
    source_url: img.source_url ?? null,
    attribution: img.attribution ?? null,
    license_name: img.license_name ?? null,
    image_credit: img.image_credit ?? null,
  };
}

// ── Providers ───────────────────────────────────────────────────────────────

/** Perenual pest-disease-list — curated pest/disease photography (first choice). */
async function fetchPerenualPest(query: string, apiKey: string): Promise<GalleryImage[]> {
  try {
    const res = await fetch(
      `https://perenual.com/api/pest-disease-list?key=${apiKey}&q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const out: GalleryImage[] = [];
    for (const item of (data?.data ?? [])) {
      for (const img of (item.images ?? [])) {
        const full = img.original_url || img.regular_url || img.medium_url;
        const thumb = img.thumbnail || img.small_url || img.medium_url || full;
        if (!full) continue;
        out.push({
          id: `perenual-${item.id}-${out.length}`,
          thumb_url: thumb,
          full_url: full,
          alt: item.common_name || query,
          source: "perenual",
          source_url: null,
          license_name: img.license_name ?? null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** iNaturalist taxa — large, free, CC-licensed organism photos (workhorse). */
async function fetchINaturalist(query: string, count: number): Promise<GalleryImage[]> {
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}` +
        `&per_page=${Math.min(Math.max(count, 3), 10)}&order=desc&order_by=observations_count`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const out: GalleryImage[] = [];
    for (const t of (data?.results ?? [])) {
      const photo = t.default_photo;
      if (!photo?.medium_url) continue;
      out.push({
        id: `inat-${t.id}`,
        thumb_url: photo.square_url || photo.medium_url,
        full_url: photo.medium_url,
        alt: t.preferred_common_name || t.name || query,
        source: "inaturalist",
        source_url: `https://www.inaturalist.org/taxa/${t.id}`,
        attribution: photo.attribution ?? null,
        license_name: photo.license_code ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Wikipedia summary → OpenSearch fallback, by clean (scientific) title. */
async function fetchWikipedia(query: string): Promise<GalleryImage[]> {
  const trySummary = async (title: string): Promise<GalleryImage | null> => {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fullSrc = data.originalimage?.source || data.thumbnail?.source;
    if (!fullSrc) return null;
    return {
      id: `wiki-${encodeURIComponent(data.title ?? title)}`,
      thumb_url: data.thumbnail?.source || fullSrc,
      full_url: fullSrc,
      alt: data.title || title,
      source: "wikipedia",
      source_url: data.content_urls?.desktop?.page ?? null,
    };
  };
  try {
    const direct = await trySummary(query);
    if (direct) return [direct];
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}` +
        `&limit=3&format=json&origin=*`,
    );
    if (!searchRes.ok) return [];
    const [, titles] = await searchRes.json();
    for (const title of (titles ?? []).slice(0, 2)) {
      const hit = await trySummary(title);
      if (hit) return [hit];
    }
  } catch {
    // Wikipedia is a bonus source — never hard-fail.
  }
  return [];
}

// ── Ailment-aware Gemini vet (fails open) ─────────────────────────────────────
const VET_SCORES_SCHEMA = {
  type: "object",
  properties: { scores: { type: "array", items: { type: "number" } } },
  required: ["scores"],
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

async function vetGallery(
  images: GalleryImage[],
  query: string,
  apiKey: string,
  db: SupabaseClient | null,
): Promise<GalleryImage[]> {
  try {
    const kept: GalleryImage[] = [];
    const parts: GeminiPart[] = [];
    for (const img of images) {
      const part = await fetchImageInline(img.thumb_url);
      if (!part) continue;
      kept.push(img);
      parts.push(part);
    }
    if (kept.length === 0) return images; // couldn't fetch any → fail open

    const instruction = buildAilmentVetInstruction(query, kept.length);
    const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([instruction, ...parts]), {
      responseSchema: VET_SCORES_SCHEMA,
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 256,
      logContext: { query: query.toLowerCase() },
    });
    if (db) {
      await logAiUsage(db, {
        functionName: FN,
        action: "vet_ailment_images",
        usage,
        contextBlock: `query: ${query}\n` + kept.map((im, i) => `${i + 1}. [${im.source}] ${im.alt}`).join("\n"),
        prompt: instruction,
        rawResult: text,
      });
    }
    return selectConfidentImages(kept, parseScores(text), AILMENT_PHOTO_CONFIDENCE);
  } catch {
    return images; // fail open
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      query,
      count = 9,
      vet = false,
      home_id = null,
      scientific_name = null,
    } = await req.json();
    if (!query?.trim()) throw new Error("query is required");

    // Prefer the scientific name for provider matching (cleaner Wikipedia title,
    // better iNaturalist taxon hit), but key the cache/rejections on the common
    // name the user sees (matches how the client stores subject_key).
    const providerQuery = (scientific_name && String(scientific_name).trim()) || query;
    const queryKey = normaliseQuery(query);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const perenualKey = Deno.env.get("PERENUAL_API_KEY");
    const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // Rejection-awareness — exclude this home's rejected URLs (verified member only).
    let rejectedUrls = new Set<string>();
    if (db && supabaseUrl && home_id) {
      const memberHome = await resolveMemberHome(req, db, supabaseUrl, anonKey, home_id);
      if (memberHome) rejectedUrls = await loadRejectedUrls(db, memberHome, "ailment", queryKey);
    }
    const hasRejections = rejectedUrls.size > 0;

    // count:1 hot path — the winning-image cache.
    if (db && count === 1) {
      const { data: cached } = await db
        .from("ailment_image_cache")
        .select("query_normalised, thumb_url, full_url, source, attribution, expires_at")
        .eq("query_normalised", queryKey)
        .maybeSingle();
      if (
        cached &&
        cached.thumb_url &&
        new Date(cached.expires_at).getTime() > Date.now() &&
        !isRejected(cached, rejectedUrls)
      ) {
        return new Response(JSON.stringify({ images: [imageFromCacheRow(cached)] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Vetted-gallery cache (vet path only).
    if (vet && db) {
      const { data: cachedGallery } = await db
        .from("ailment_gallery_cache")
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
      }
    }

    // Providers, in priority order: Perenual (curated) → iNaturalist → Wikipedia.
    const [perenualRes, inatRes, wikiRes] = await Promise.allSettled([
      perenualKey ? fetchPerenualPest(providerQuery, perenualKey) : Promise.resolve([]),
      fetchINaturalist(providerQuery, count),
      fetchWikipedia(providerQuery),
    ]);
    const perenual = perenualRes.status === "fulfilled" ? perenualRes.value : [];
    const inat = inatRes.status === "fulfilled" ? inatRes.value : [];
    const wiki = wikiRes.status === "fulfilled" ? wikiRes.value : [];

    const pool: GalleryImage[] = [...perenual, ...inat, ...wiki].slice(0, Math.max(count, 1));
    const images = filterRejected(pool, rejectedUrls);

    // Write-through the winning image — SKIP when a rejection was applied (the
    // cache is cross-home; the survivor is this home's next-choice).
    if (db && images[0] && !hasRejections) {
      const first = images[0];
      db.from("ailment_image_cache")
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

    const imagesWithCredit: GalleryImage[] = images.map((img) => ({ ...img, image_credit: buildAilmentCredit(img) }));

    let finalImages: GalleryImage[] = imagesWithCredit;
    if (vet) {
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (geminiKey && finalImages.length > 0) {
        finalImages = await vetGallery(finalImages, query, geminiKey, db);
        if (db && finalImages.length > 0 && !hasRejections) {
          db.from("ailment_gallery_cache")
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
    console.error("[ailment-image-search]", error.message);
    await captureException("ailment-image-search", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
