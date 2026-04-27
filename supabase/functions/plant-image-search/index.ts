import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Append required UTM attribution params for all Unsplash links.
function withUtm(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=rhozly&utm_medium=referral`;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { query, count = 6 } = await req.json();

    if (!query?.trim()) throw new Error("query is required");

    const accessKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
    if (!accessKey) throw new Error("Missing UNSPLASH_ACCESS_KEY secret");

    const perPage = Math.min(Math.max(1, count), 12);
    const searchUrl =
      `https://api.unsplash.com/search/photos` +
      `?query=${encodeURIComponent(query.trim())}` +
      `&per_page=${perPage}` +
      `&orientation=squarish` +
      `&content_filter=high`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    });

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}));
      throw new Error(
        err.errors?.[0] ?? `Unsplash responded with status ${searchRes.status}`,
      );
    }

    const payload = await searchRes.json();

    const images = (payload.results ?? []).map((p: any) => ({
      id: p.id,
      // thumb (~200 px) — used for the gallery strip
      thumb_url: p.urls.thumb,
      // small (~400 px) — used in the lightbox
      small_url: p.urls.small,
      alt: p.alt_description || p.description || query,
      // Unsplash License requires linking back to the photo page AND the
      // photographer profile; UTM params are mandatory for attribution.
      photo_page: withUtm(`https://unsplash.com/photos/${p.id}`),
      photographer_name: p.user.name,
      photographer_url: withUtm(p.user.links.html),
      // Unsplash native report form for DMCA / copyright concerns
      report_url: `https://unsplash.com/photos/${p.id}/report`,
    }));

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[plant-image-search]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
