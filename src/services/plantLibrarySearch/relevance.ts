// Relevance search — exact match first, then prefix, then contains,
// with trigram similarity as the tiebreak inside each tier and
// alphabetical as the final tiebreak. Backed by the
// `search_plant_library_relevance` RPC (see the
// `20260525120000_plant_library_search_extensions.sql` migration).

import { supabase } from "../../lib/supabase";
import type { PlantLibraryRow, PlantLibrarySearchResult } from "../plantLibraryAdminService";
import type { SearchMethod } from "./index";

interface RelevanceRPCRow {
  row_data: PlantLibraryRow;
  rank: number;
  similarity_score: number;
  total_count: number;
}

export const relevanceMethod: SearchMethod<Record<string, never>> = {
  id: "relevance",
  label: "Relevance",
  description:
    "Exact matches first, then prefix matches, then contains matches. Similarity score breaks ties; alphabetical breaks the rest.",
  defaultOptions: {},

  async run({ query, page, pageSize }) {
    const trimmed = query.trim();
    if (!trimmed) {
      return { rows: [], total: 0, page, pageSize };
    }
    const offset = (page - 1) * pageSize;

    const { data, error } = await supabase.rpc("search_plant_library_relevance", {
      p_query: trimmed,
      p_page_size: pageSize,
      p_offset: offset,
    });
    if (error) throw error;

    const rows = (data ?? []) as RelevanceRPCRow[];
    return {
      rows: rows.map((r) => r.row_data),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
      page,
      pageSize,
    };
  },
};
