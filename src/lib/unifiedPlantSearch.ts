// Unified plant search — the library-first engine behind the shared
// <PlantSearch> component. See docs/plans/plant-search-overhaul-design.md.
//
// Tiers of search (all funnel through here):
//   1. searchLibrary  — local plant_library, relevance-ranked, FREE, all tiers.
//   2. didYouMean     — fuzzy (trigram) spelling suggestions when results are thin.
//   3. searchExternal — Perenual + Verdantly (opt-in, Botanist+), via searchAllProviders.
//   4. createWithAI   — AI enrichment + insert into the library (opt-in, Sage+).
//
// Gating (which buttons show / upgrade nudges) is the component's job;
// this module just performs the actions.

import { supabase } from "./supabase";
import { searchAllProviders } from "./plantProvider";
import type { ProviderSearchResult } from "./verdantlyUtils";
import type { PlantLibraryRow } from "../services/plantLibraryAdminService";

export interface PlantSelection {
  source: "library" | "perenual" | "verdantly" | "ai" | "manual";
  common_name: string;
  scientific_name?: string;
  library_id?: number;
  perenual_id?: number;
  verdantly_id?: string;
  thumbnail_url?: string | null;
  /** Full provider/library record for hosts that need more than the basics. */
  raw?: unknown;
}

export interface LibrarySearchResult {
  rows: PlantLibraryRow[];
  total: number;
}

/** Structured filters applied against plant_library columns. */
export interface PlantFilters {
  cycle?: string[];
  watering?: string[];
  sunlight?: string[];
  edible?: boolean;
  indoor?: boolean;
  poisonous?: boolean;
}

export function countActiveFilters(f: PlantFilters): number {
  return [
    f.cycle?.length ? 1 : 0,
    f.watering?.length ? 1 : 0,
    f.sunlight?.length ? 1 : 0,
    f.edible !== undefined ? 1 : 0,
    f.indoor !== undefined ? 1 : 0,
    f.poisonous !== undefined ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
}

/** Build the jsonb filter blob the RPC expects — omits unset keys. */
function toFilterBlob(f?: PlantFilters): Record<string, unknown> {
  const blob: Record<string, unknown> = {};
  if (!f) return blob;
  if (f.cycle?.length) blob.cycle = f.cycle;
  if (f.watering?.length) blob.watering = f.watering;
  if (f.sunlight?.length) blob.sunlight = f.sunlight;
  if (f.edible !== undefined) blob.edible = f.edible;
  if (f.indoor !== undefined) blob.indoor = f.indoor;
  if (f.poisonous !== undefined) blob.poisonous = f.poisonous;
  return blob;
}

interface RelevanceRPCRow {
  row_data: PlantLibraryRow;
  rank: number;
  similarity_score: number;
  total_count: number;
}

interface FuzzyRPCRow {
  row_data: PlantLibraryRow;
  similarity_score: number;
  total_count: number;
}

/**
 * Library relevance search (exact → prefix → contains → trigram), with
 * optional structured filters. When filters are present the query may be
 * empty (browse-by-filter). Routes through the filtered RPC, which is a
 * superset of the name-only one.
 */
export async function searchLibrary(
  query: string,
  opts: { page?: number; pageSize?: number; filters?: PlantFilters } = {},
): Promise<LibrarySearchResult> {
  const trimmed = query.trim();
  const blob = toFilterBlob(opts.filters);
  const hasFilters = Object.keys(blob).length > 0;
  // Nothing to search on — no query and no filters.
  if (!trimmed && !hasFilters) return { rows: [], total: 0 };

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 10;
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc("search_plant_library_relevance_filtered", {
    p_query: trimmed,
    p_page_size: pageSize,
    p_offset: offset,
    p_filters: blob,
  });
  if (error) throw error;
  const rows = (data ?? []) as RelevanceRPCRow[];
  return {
    rows: rows.map((r) => r.row_data),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

/**
 * Spelling suggestions via the fuzzy (trigram) RPC. Returns up to `limit`
 * distinct common names ranked by similarity, excluding any that exactly
 * match the query (those aren't "did you mean" — they're hits).
 */
export async function didYouMean(query: string, limit = 3): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const { data, error } = await supabase.rpc("search_plant_library_fuzzy", {
    p_query: trimmed,
    p_page_size: 12,
    p_offset: 0,
    p_min_similarity: 0.2,
  });
  if (error) return [];
  const rows = (data ?? []) as FuzzyRPCRow[];
  const lowerQuery = trimmed.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const name = r.row_data?.common_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (key === lowerQuery) continue; // exact match isn't a suggestion
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Opt-in wider search — Perenual + Verdantly (+ AI when requested).
 * `searchAllProviders` respects which providers are enabled for the user.
 */
export async function searchExternal(
  query: string,
  opts: { includeAi?: boolean; homeId?: string } = {},
): Promise<ProviderSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchAllProviders(trimmed, undefined, undefined, {
    includeAi: opts.includeAi,
    homeId: opts.homeId,
  });
}

/**
 * Opt-in AI create — enriches the plant via Gemini and inserts it into the
 * shared library (so it's free for everyone afterwards), returning the new
 * row. Reuses the `add-plant-to-library` edge function. Throws on failure
 * (including tier-gate / quota errors surfaced by the function).
 */
export async function createWithAI(
  name: string,
): Promise<{ id: number; common_name: string }> {
  const { data, error } = await supabase.functions.invoke("add-plant-to-library", {
    body: { name: name.trim() },
  });
  if (error) {
    // Surface the function's real error body (FunctionsHttpError hides it).
    let detail = error.message ?? "Couldn't create the plant.";
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) detail = body.error;
      }
    } catch {
      /* keep generic */
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.plant) throw new Error("No plant returned.");
  return data.plant;
}

// ─── Normalisers → PlantSelection ──────────────────────────────────────

export function libraryRowToSelection(row: PlantLibraryRow): PlantSelection {
  return {
    source: "library",
    common_name: row.common_name,
    scientific_name: Array.isArray(row.scientific_name) ? row.scientific_name[0] : undefined,
    library_id: row.id,
    thumbnail_url: row.thumbnail_url ?? row.image_url ?? null,
    raw: row,
  };
}

export function providerResultToSelection(r: ProviderSearchResult): PlantSelection {
  return {
    source: r._provider, // "perenual" | "verdantly" | "ai"
    common_name: r.common_name,
    scientific_name: r.scientific_name?.[0],
    perenual_id: r.perenual_id ?? undefined,
    verdantly_id: r.verdantly_id ?? undefined,
    thumbnail_url: r.thumbnail_url ?? null,
    raw: r,
  };
}

/**
 * Convert a `PlantSelection` back into a `ProviderSearchResult` — the shape the
 * preview/detail pipeline (`PlantDetailModal`, the `/library` preview page)
 * consumes. Library hits route through the AI provider path carrying
 * `plant_library_id` so the catalogue clone skips Gemini; external hits pass
 * their original record through; anything else becomes an AI result by name.
 * Single source of truth shared by every host (Add-to-Shed, /library,
 * Shopping, Nursery).
 */
export function selectionToProviderResult(sel: PlantSelection): ProviderSearchResult {
  const sci = sel.scientific_name ? [sel.scientific_name] : [];
  if (sel.source === "library") {
    return {
      id: `library-${sel.library_id}`,
      common_name: sel.common_name,
      scientific_name: sci,
      thumbnail_url: sel.thumbnail_url ?? null,
      _provider: "ai",
      plant_library_id: sel.library_id,
    } as ProviderSearchResult;
  }
  if (sel.raw) return sel.raw as ProviderSearchResult;
  return {
    id: `ai-${sel.common_name}`,
    common_name: sel.common_name,
    scientific_name: sci,
    thumbnail_url: sel.thumbnail_url ?? null,
    _provider: "ai",
  } as ProviderSearchResult;
}
