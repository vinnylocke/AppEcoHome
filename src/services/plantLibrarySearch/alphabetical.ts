// Alphabetical search — server-side ILIKE on `search_text`, ordered
// by `common_name ASC`. Baseline behaviour. Uses the GIN trigram
// index Postgres builds on `search_text gin_trgm_ops` so the ILIKE
// scan is fast even on 40k+ rows.

import { supabase } from "../../lib/supabase";
import type { PlantLibraryRow, PlantLibrarySearchResult } from "../plantLibraryAdminService";
import type { SearchMethod } from "./index";

export const alphabeticalMethod: SearchMethod<Record<string, never>> = {
  id: "alphabetical",
  label: "Alphabetical",
  description: "Server-side contains match, ordered A→Z by common name. Useful as a baseline.",
  defaultOptions: {},

  async run({ query, page, pageSize }) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return { rows: [], total: 0, page, pageSize };
    }

    const escaped = trimmed.replace(/[%_]/g, "\\$&");
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("plant_library")
      .select("*", { count: "exact" })
      .ilike("search_text", `%${escaped}%`)
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
