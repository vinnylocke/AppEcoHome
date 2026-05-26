// Advanced search — explicit match-position dropdown:
//   • Starts with  → ILIKE '<query>%'
//   • Ends with    → ILIKE '%<query>'
//   • Contains     → ILIKE '%<query>%'  (same as Alphabetical's match)
//
// No RPC needed — the existing PostgREST builder handles it. Sorted
// alphabetically inside the matching set.

import React from "react";
import { supabase } from "../../lib/supabase";
import type { PlantLibraryRow, PlantLibrarySearchResult } from "../plantLibraryAdminService";
import type { SearchMethod } from "./index";

export type AdvancedMatchType = "startsWith" | "endsWith" | "contains";

export interface AdvancedOptions {
  matchType: AdvancedMatchType;
}

const MATCH_TYPE_LABELS: Record<AdvancedMatchType, string> = {
  startsWith: "Starts with",
  endsWith: "Ends with",
  contains: "Contains",
};

/** Build the ILIKE pattern for a given match type. Exported for testing. */
export function buildAdvancedPattern(
  query: string,
  matchType: AdvancedMatchType,
): string {
  // Escape ILIKE wildcards in the user input so a stray % or _ doesn't
  // broaden the match unexpectedly.
  const escaped = query.replace(/[%_]/g, "\\$&");
  switch (matchType) {
    case "startsWith": return `${escaped}%`;
    case "endsWith":   return `%${escaped}`;
    case "contains":   return `%${escaped}%`;
  }
}

const AdvancedOptionsControl: React.FC<{
  value: AdvancedOptions;
  onChange: (next: AdvancedOptions) => void;
}> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 shrink-0">
        Match
      </label>
      <select
        data-testid="plant-library-search-advanced-match-type"
        value={value.matchType}
        onChange={(e) =>
          onChange({ ...value, matchType: e.target.value as AdvancedMatchType })
        }
        className="px-3 py-2 min-h-[40px] rounded-xl border border-rhozly-outline/20 bg-white text-xs font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
      >
        {(Object.keys(MATCH_TYPE_LABELS) as AdvancedMatchType[]).map((k) => (
          <option key={k} value={k}>
            {MATCH_TYPE_LABELS[k]}
          </option>
        ))}
      </select>
    </div>
  );
};

export const advancedMethod: SearchMethod<AdvancedOptions> = {
  id: "advanced",
  label: "Advanced",
  description:
    "Constrain the match position — Starts with / Ends with / Contains. Alphabetical inside the matching set.",
  defaultOptions: { matchType: "contains" },
  Options: AdvancedOptionsControl,

  async run({ query, page, pageSize, options }) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return { rows: [], total: 0, page, pageSize };
    }

    const pattern = buildAdvancedPattern(trimmed, options.matchType);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("plant_library")
      .select("*", { count: "exact" })
      .ilike("search_text", pattern)
      .order("common_name", { ascending: true })
      .range(from, to);

    if (error) throw error;
    return {
      rows: (data ?? []) as PlantLibraryRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },
};
