// Fuzzy search — typo-tolerant Postgres `pg_trgm` similarity ranking.
// Ranks rows by similarity(search_text, query) DESC, filtered by a
// minimum-similarity floor that the user can tune via the slider.
// Backed by `search_plant_library_fuzzy` RPC.

import React from "react";
import { supabase } from "../../lib/supabase";
import type { PlantLibraryRow, PlantLibrarySearchResult } from "../plantLibraryAdminService";
import type { SearchMethod } from "./index";

interface FuzzyRPCRow {
  row_data: PlantLibraryRow;
  similarity_score: number;
  total_count: number;
}

export interface FuzzyOptions {
  /** Minimum trigram similarity — 0–1. Higher = stricter, fewer results. */
  minSimilarity: number;
}

const FuzzyOptionsControl: React.FC<{
  value: FuzzyOptions;
  onChange: (next: FuzzyOptions) => void;
}> = ({ value, onChange }) => {
  const pct = Math.round(value.minSimilarity * 100);
  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 shrink-0">
        Threshold
      </label>
      <input
        type="range"
        min={5}
        max={80}
        step={5}
        value={pct}
        onChange={(e) =>
          onChange({ ...value, minSimilarity: parseInt(e.target.value, 10) / 100 })
        }
        data-testid="plant-library-search-fuzzy-threshold"
        className="flex-1 accent-rhozly-primary"
      />
      <span className="text-[10px] font-black tabular-nums text-rhozly-on-surface/70 w-9 text-right shrink-0">
        {pct}%
      </span>
    </div>
  );
};

export const fuzzyMethod: SearchMethod<FuzzyOptions> = {
  id: "fuzzy",
  label: "Fuzzy",
  description:
    "Typo-tolerant ranking via Postgres pg_trgm similarity. Adjust the threshold to widen or tighten the match.",
  defaultOptions: { minSimilarity: 0.15 },
  Options: FuzzyOptionsControl,

  async run({ query, page, pageSize, options }) {
    const trimmed = query.trim();
    if (!trimmed) {
      return { rows: [], total: 0, page, pageSize };
    }
    const offset = (page - 1) * pageSize;

    const { data, error } = await supabase.rpc("search_plant_library_fuzzy", {
      p_query: trimmed,
      p_page_size: pageSize,
      p_offset: offset,
      p_min_similarity: options.minSimilarity,
    });
    if (error) throw error;

    const rows = (data ?? []) as FuzzyRPCRow[];
    return {
      rows: rows.map((r) => r.row_data),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
      page,
      pageSize,
    };
  },
};
