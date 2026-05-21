import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { guardPerenualByUser } from "../_shared/aiGuard.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("PERENUAL_API_KEY");
    if (!apiKey) throw new Error("PERENUAL_API_KEY not configured");

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const guardErr = await guardPerenualByUser(db, userId);
    if (guardErr) return guardErr;

    const rateLimitErr = await enforceRateLimit(db, userId, "perenual-proxy");
    if (rateLimitErr) return rateLimitErr;

    const { action, query, id, page = 1, filters } = await req.json() as {
      action: "search" | "details" | "pest-disease";
      query?: string;
      id?: number;
      page?: number;
      filters?: {
        cycle?: string[];
        watering?: string[];
        sunlight?: string[];
        edible?: 0 | 1;
        poisonous?: 0 | 1;
        indoor?: 0 | 1;
        hardinessMin?: number;
        hardinessMax?: number;
      };
    };

    // ── Species search ────────────────────────────────────────────────────────
    if (action === "search") {
      const filtersSig = [
        ...(filters?.cycle     ?? []).slice().sort(),
        ...(filters?.watering  ?? []).slice().sort(),
        ...(filters?.sunlight  ?? []).slice().sort(),
        filters?.edible      !== undefined ? `edible:${filters.edible}`       : null,
        filters?.poisonous   !== undefined ? `poisonous:${filters.poisonous}` : null,
        filters?.indoor      !== undefined ? `indoor:${filters.indoor}`       : null,
        filters?.hardinessMin !== undefined ? `hmin:${filters.hardinessMin}`  : null,
        filters?.hardinessMax !== undefined ? `hmax:${filters.hardinessMax}`  : null,
      ].filter(Boolean).join("|") || "none";
      const searchCacheKey = cacheKey("perenual_search", query?.trim() ?? "", filtersSig, String(page));
      const cachedResult = await getCached<{ data: unknown[] }>(db, searchCacheKey);
      if (cachedResult) return json(cachedResult);

      const buildParams = (cycle?: string, watering?: string, sunlight?: string) => {
        const p = new URLSearchParams({ key: apiKey });
        if (query?.trim()) p.set("q", query.trim());
        if (page > 1)      p.set("page", String(page));
        if (cycle)         p.set("cycle", cycle);
        if (watering)      p.set("watering", watering);
        if (sunlight)      p.set("sunlight", sunlight);
        if (filters?.edible   !== undefined) p.set("edible",    String(filters.edible));
        if (filters?.poisonous !== undefined) p.set("poisonous", String(filters.poisonous));
        if (filters?.indoor   !== undefined) p.set("indoor",    String(filters.indoor));
        if (filters?.hardinessMin !== undefined || filters?.hardinessMax !== undefined) {
          const min = filters?.hardinessMin ?? 1;
          const max = filters?.hardinessMax ?? 13;
          p.set("hardiness", min === max ? String(min) : `${min}-${max}`);
        }
        return p;
      };

      const cycles    = filters?.cycle?.length    ? filters.cycle    : [undefined];
      const waterings = filters?.watering?.length ? filters.watering : [undefined];
      const sunlights = filters?.sunlight?.length ? filters.sunlight : [undefined];

      const calls: Promise<{ items: any[]; lastPage: number }>[] = [];
      for (const c of cycles) {
        for (const w of waterings) {
          for (const s of sunlights) {
            calls.push(
              fetch(`https://perenual.com/api/v2/species-list?${buildParams(c, w, s)}`, { signal: AbortSignal.timeout(12_000) })
                .then(async (r) => {
                  if (!r.ok) return { items: [], lastPage: 0 };
                  const d = await r.json();
                  return { items: d.data ?? [], lastPage: Number(d.last_page ?? 0) };
                }),
            );
          }
        }
      }

      const batches = await Promise.all(calls);
      const seen = new Set<number>();
      const merged: unknown[] = [];
      // Pagination signal: any underlying fan-out call with last_page > current
      // page means there's more to fetch. Caller increments `page` to load it.
      let maxLastPage = 0;
      for (const { items, lastPage } of batches) {
        if (lastPage > maxLastPage) maxLastPage = lastPage;
        for (const plant of items) {
          if (!seen.has(plant.id)) {
            seen.add(plant.id);
            merged.push(plant);
          }
        }
      }
      const hasMore = maxLastPage > page;

      const payload = {
        data: merged,
        current_page: page,
        last_page: maxLastPage,
        has_more: hasMore,
      };
      await setCached(db, searchCacheKey, "perenual-proxy", payload, 1);
      return json(payload);
    }

    // ── Species details ───────────────────────────────────────────────────────
    if (action === "details") {
      if (!id) return json({ error: "id is required" }, 400);
      const res = await fetch(`https://perenual.com/api/v2/species/details/${id}?key=${apiKey}`, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`Perenual details error: ${res.status}`);
      const data = await res.json();
      return json(data);
    }

    // ── Pest & disease search ─────────────────────────────────────────────────
    if (action === "pest-disease") {
      if (!query?.trim()) return json({ error: "query is required" }, 400);
      const url = `https://perenual.com/api/pest-disease-list?key=${apiKey}&q=${encodeURIComponent(query)}&page=${page}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      const text = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json") || text.trimStart().startsWith("<")) {
        return json({ error: "Pest & disease search is not available on your Perenual plan." }, 400);
      }
      return new Response(text, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("[perenual-proxy]", err.message);
    await captureException("perenual-proxy", err);
    return json({ error: err.message }, 400);
  }
});
