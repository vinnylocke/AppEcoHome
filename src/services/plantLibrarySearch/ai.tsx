// AI search — ask Gemini (via search-plants-ai) for plants matching the
// query, then cross-check each against plant_library. Existing plants
// render as normal library rows; suggestions NOT yet in the library
// render as "candidates" with an "Add to Library" button (handled in
// PlantLibrarySearchTab).
//
// Unlike the DB-backed methods this returns a fixed AI result set on
// page 1 only — there's no server-side pagination over an AI response.

import { supabase } from "../../lib/supabase";
import type { PlantLibraryRow, PlantLibrarySearchResult } from "../plantLibraryAdminService";
import type { SearchMethod } from "./index";

export const aiMethod: SearchMethod<Record<string, never>> = {
  id: "ai",
  label: "AI ✦",
  description:
    "Ask AI for plants matching your term. Results already in the library open as normal; ones that aren't show an \"Add to Library\" button to enrich + insert them.",
  defaultOptions: {},

  async run({ query, page, pageSize }): Promise<PlantLibrarySearchResult> {
    const trimmed = query.trim();
    if (!trimmed) return { rows: [], total: 0, page, pageSize };

    // AI returns a fixed small set — only meaningful on page 1.
    if (page > 1) return { rows: [], total: 0, page, pageSize };

    // 1. Ask the AI for matching plant names.
    const { data, error } = await supabase.functions.invoke("search-plants-ai", {
      body: { query: trimmed },
    });
    if (error) throw error;
    const aiPlants: Array<{ name: string; description?: string }> = data?.plants ?? [];
    if (aiPlants.length === 0) return { rows: [], total: 0, page, pageSize };

    // 2. Cross-check each AI name against plant_library (case-insensitive
    //    exact-ish match on common_name). One query per name is fine —
    //    the AI returns ≤ ~8 names.
    const rows: PlantLibraryRow[] = [];
    let candidateSeq = -1;
    for (const ai of aiPlants) {
      const name = ai.name?.trim();
      if (!name) continue;
      const escaped = name.replace(/[%_]/g, "\\$&");
      const { data: existing } = await supabase
        .from("plant_library")
        .select("*")
        .ilike("common_name", escaped)
        .limit(1)
        .maybeSingle();

      if (existing) {
        rows.push(existing as PlantLibraryRow);
      } else {
        // Synthetic candidate row — negative sentinel id, _aiCandidate flag.
        rows.push({
          id: candidateSeq--,
          _aiCandidate: true,
          _aiDescription: ai.description ?? "",
          common_name: name,
          scientific_name: [],
          other_names: null,
          family: null,
          plant_type: null,
          cycle: null,
          image_url: null,
          thumbnail_url: null,
          watering: null,
          watering_min_days: null,
          watering_max_days: null,
          sunlight: null,
          care_level: null,
          hardiness_min: null,
          hardiness_max: null,
          growth_rate: null,
          growth_habit: null,
          maintenance: null,
          is_edible: null,
          is_toxic_pets: null,
          is_toxic_humans: null,
          // via unknown: the synthetic candidate intentionally omits the
          // remaining PlantLibraryRow columns (consumers only read the
          // fields above plus the _aiCandidate flag).
        } as unknown as PlantLibraryRow);
      }
    }

    return { rows, total: rows.length, page, pageSize };
  },
};
