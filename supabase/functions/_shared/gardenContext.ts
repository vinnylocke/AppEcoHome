/**
 * Build a structured snapshot of the user's garden for AI prompts
 * that need whole-garden context (e.g. the planner's Garden Overhaul
 * flow). Pulls home / areas / existing plants / preferences /
 * climate in parallel and returns BOTH:
 *
 *   - `block`: a human-readable text block ready to drop into a
 *     Gemini prompt.
 *   - `snapshot`: a structured JSON object for storing on the
 *     plan_overhaul_inputs.context_used column — makes the AI's
 *     decision auditable after-the-fact.
 *
 * Different shape from `_shared/visionEnvContext.ts` because that
 * one is per-plant / per-area (PlantDoctor); this one is
 * whole-garden (Planner Overhaul).
 */

import {
  fetchHomeRotationBlocks,
  renderRotationBlock,
} from "./rotationContext.ts";

export interface GardenContext {
  block: string;
  snapshot: GardenContextSnapshot;
}

export interface GardenContextSnapshot {
  home: {
    id: string;
    name: string | null;
    postcode: string | null;
    hemisphere: "northern" | "southern" | null;
    hardiness_zone: string | null;
  };
  climate: {
    first_frost_date: string | null;
    last_frost_date: string | null;
    avg_temp_c: number | null;
    annual_rainfall_mm: number | null;
  };
  areas: Array<{
    id?: string | null;
    name: string;
    is_outside: boolean | null;
    sunlight: string | null;
    growing_medium: string | null;
    medium_ph: number | null;
    medium_texture: string | null;
    water_movement: string | null;
    width_m: number | null;
    length_m: number | null;
    rotation?: {
      history: Array<{ year: number; families: string[] }>;
      avoid: string[];
      prefer: string[];
    };
  }>;
  existing_plants: Array<{
    name: string;
    scientific_name: string | null;
    area_name: string | null;
    status: string | null;
  }>;
  preferences: Record<string, unknown> | null;
  meta: {
    current_month: number;
    captured_at: string;
  };
}

/** Returns "" when homeId missing (caller can no-op gracefully). */
export async function buildGardenContext(
  supabase: any,
  homeId: string,
): Promise<GardenContext> {
  const empty: GardenContextSnapshot = emptySnapshot(homeId);
  if (!homeId) return { block: "", snapshot: empty };

  // Hard timeout on the rotation fetch — if it ever stalls (e.g. PostgREST
  // hiccup), the snapshot still completes within seconds rather than blocking
  // the AI call indefinitely. 4s is plenty for a sub-second query.
  const rotationWithTimeout = Promise.race([
    fetchHomeRotationBlocks(supabase, homeId).catch(() => ({})),
    new Promise<Record<string, never>>((resolve) =>
      setTimeout(() => resolve({}), 4000),
    ),
  ]);

  const [
    homeRes,
    climateRes,
    areasRes,
    plantsRes,
    prefsRes,
    rotationBlocksRaw,
  ] = await Promise.all([
    supabase
      .from("homes")
      .select("id, name, postcode, hemisphere, hardiness_zone")
      .eq("id", homeId)
      .maybeSingle(),
    supabase
      .from("home_climate")
      .select("first_frost_date, last_frost_date, avg_temp_c, annual_rainfall_mm")
      .eq("home_id", homeId)
      .maybeSingle(),
    supabase
      .from("areas")
      .select("id, name, is_outside, sunlight, growing_medium, medium_ph, medium_texture, water_movement, width_m, length_m")
      .eq("home_id", homeId)
      .order("name", { ascending: true })
      .limit(30),
    supabase
      .from("inventory_items")
      .select("plant_name, status, areas:area_id(name), plants:plant_id(scientific_name)")
      .eq("home_id", homeId)
      .in("status", ["Planted", "Growing", "Established"])
      .order("plant_name", { ascending: true })
      .limit(50),
    supabase
      .from("user_preferences")
      .select("data")
      .eq("home_id", homeId)
      .maybeSingle(),
    rotationWithTimeout,
  ]);

  const home = homeRes?.data ?? null;
  const climate = climateRes?.data ?? null;
  const areas: any[] = areasRes?.data ?? [];
  const plants: any[] = plantsRes?.data ?? [];
  const prefs = prefsRes?.data?.data ?? null;
  const rotationBlocks = rotationBlocksRaw as Awaited<
    ReturnType<typeof fetchHomeRotationBlocks>
  >;

  const snapshot: GardenContextSnapshot = {
    home: {
      id: homeId,
      name: home?.name ?? null,
      postcode: home?.postcode ?? null,
      hemisphere: (home?.hemisphere as "northern" | "southern" | null) ?? null,
      hardiness_zone: home?.hardiness_zone ?? null,
    },
    climate: {
      first_frost_date:   climate?.first_frost_date  ?? null,
      last_frost_date:    climate?.last_frost_date   ?? null,
      avg_temp_c:         climate?.avg_temp_c        ?? null,
      annual_rainfall_mm: climate?.annual_rainfall_mm ?? null,
    },
    areas: areas.map((a) => ({
      id: a.id ?? null,
      name: a.name ?? "(unnamed)",
      is_outside: a.is_outside ?? null,
      sunlight: a.sunlight ?? null,
      growing_medium: a.growing_medium ?? null,
      medium_ph: a.medium_ph ?? null,
      medium_texture: a.medium_texture ?? null,
      water_movement: a.water_movement ?? null,
      width_m: a.width_m ?? null,
      length_m: a.length_m ?? null,
      rotation: a.id && rotationBlocks[a.id] ? rotationBlocks[a.id] : undefined,
    })),
    existing_plants: plants.map((p) => ({
      name: p.plant_name ?? "(unknown)",
      scientific_name: p.plants?.scientific_name ?? null,
      area_name: p.areas?.name ?? null,
      status: p.status ?? null,
    })),
    preferences: prefs,
    meta: {
      current_month: new Date().getUTCMonth() + 1,
      captured_at: new Date().toISOString(),
    },
  };

  return { block: renderBlock(snapshot), snapshot };
}

function emptySnapshot(homeId: string): GardenContextSnapshot {
  return {
    home: { id: homeId, name: null, postcode: null, hemisphere: null, hardiness_zone: null },
    climate: { first_frost_date: null, last_frost_date: null, avg_temp_c: null, annual_rainfall_mm: null },
    areas: [],
    existing_plants: [],
    preferences: null,
    meta: { current_month: new Date().getUTCMonth() + 1, captured_at: new Date().toISOString() },
  };
}

/**
 * Render the snapshot as a Markdown block ready to drop into the
 * AI prompt. Kept compact (no fluff) — the AI doesn't need
 * narration, just the facts.
 */
function renderBlock(s: GardenContextSnapshot): string {
  const lines: string[] = ["=== GARDENER CONTEXT ==="];

  if (s.home.postcode || s.home.hemisphere || s.home.hardiness_zone) {
    lines.push("Home:");
    if (s.home.postcode) lines.push(`  - Location: ${s.home.postcode}`);
    if (s.home.hemisphere) lines.push(`  - Hemisphere: ${s.home.hemisphere}`);
    if (s.home.hardiness_zone) lines.push(`  - USDA hardiness zone: ${s.home.hardiness_zone}`);
  }

  if (s.climate.first_frost_date || s.climate.last_frost_date || s.climate.avg_temp_c || s.climate.annual_rainfall_mm) {
    lines.push("Climate:");
    if (s.climate.first_frost_date) lines.push(`  - First frost (autumn): ${s.climate.first_frost_date}`);
    if (s.climate.last_frost_date)  lines.push(`  - Last frost (spring): ${s.climate.last_frost_date}`);
    if (s.climate.avg_temp_c != null) lines.push(`  - Avg temp: ${s.climate.avg_temp_c}°C`);
    if (s.climate.annual_rainfall_mm != null) lines.push(`  - Annual rainfall: ${s.climate.annual_rainfall_mm}mm`);
  }

  if (s.areas.length > 0) {
    lines.push(`Existing areas (${s.areas.length}):`);
    for (const a of s.areas.slice(0, 15)) {
      const dims = a.width_m && a.length_m ? `${a.width_m}×${a.length_m}m` : "";
      const facts: string[] = [];
      if (a.is_outside === false) facts.push("indoor");
      if (a.sunlight) facts.push(`sun:${a.sunlight}`);
      if (a.growing_medium) facts.push(`medium:${a.growing_medium}`);
      if (a.medium_ph) facts.push(`pH:${a.medium_ph}`);
      if (a.medium_texture) facts.push(a.medium_texture);
      if (a.water_movement) facts.push(`drainage:${a.water_movement}`);
      lines.push(`  - ${a.name}${dims ? ` (${dims})` : ""}${facts.length ? ` — ${facts.join(", ")}` : ""}`);
      // Append rotation context for outdoor areas with history. Skipped
      // for indoor areas where rotation rules don't really apply.
      if (a.is_outside !== false && a.rotation) {
        const rotationBlock = renderRotationBlock(a.name, a.rotation);
        if (rotationBlock) {
          for (const line of rotationBlock.split("\n")) {
            lines.push(`    ${line}`);
          }
        }
      }
    }
    if (s.areas.length > 15) lines.push(`  - … and ${s.areas.length - 15} more`);
  }

  if (s.existing_plants.length > 0) {
    lines.push(`Existing plants (${s.existing_plants.length} active):`);
    // Group by area for readability when there are many.
    const byArea = new Map<string, string[]>();
    for (const p of s.existing_plants) {
      const key = p.area_name ?? "(unassigned)";
      const label = p.scientific_name ? `${p.name} (${p.scientific_name})` : p.name;
      const arr = byArea.get(key) ?? [];
      arr.push(label);
      byArea.set(key, arr);
    }
    for (const [area, list] of byArea) {
      lines.push(`  - ${area}: ${list.slice(0, 10).join(", ")}${list.length > 10 ? `, … +${list.length - 10}` : ""}`);
    }
  }

  if (s.preferences && Object.keys(s.preferences).length > 0) {
    lines.push("Gardener preferences:");
    for (const [k, v] of Object.entries(s.preferences)) {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      const formatted = Array.isArray(v) ? v.join(", ") : String(v);
      lines.push(`  - ${k}: ${formatted}`);
    }
  }

  lines.push(`Current month (UTC): ${s.meta.current_month}`);
  lines.push("=== END CONTEXT ===");
  return lines.join("\n");
}
