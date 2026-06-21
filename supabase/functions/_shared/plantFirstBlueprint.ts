/**
 * Pure validator/normaliser for the plant-first planner blueprint.
 *
 * Gemini's structured output is mostly well-formed, but we harden it before it
 * reaches the DB / UI: cap the number of areas, drop empty areas, clamp
 * quantities + task frequencies, coerce missing fields, and derive `is_new` from
 * whether the area was mapped to an existing id. Kept side-effect free so it can
 * be unit-tested without a model call.
 */

export interface PfpPlant {
  common_name: string;
  scientific_name: string | null;
  quantity: number;
  role: string;
  companion_note: string;
}
export interface PfpTask {
  task_index: number;
  title: string;
  description: string;
  depends_on_index: number | null;
}
export interface PfpMaint {
  title: string;
  description: string;
  frequency_days: number;
  seasonality: string;
}
export interface PfpArea {
  area_name: string;
  existing_area_id: string | null;
  is_new: boolean;
  suggested_sunlight: string | null;
  suggested_medium: string | null;
  pairing_summary: string;
  plants: PfpPlant[];
  preparation_tasks: PfpTask[];
  maintenance_tasks: PfpMaint[];
}
export interface PlantFirstBlueprint {
  project_overview: { title: string; summary: string; estimated_difficulty: string };
  areas: PfpArea[];
}

function clampInt(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}
function str(v: unknown, dflt = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : dflt;
}

export function normalisePlantFirstBlueprint(
  raw: unknown,
  opts: { maxAreas?: number } = {},
): PlantFirstBlueprint {
  const maxAreas = opts.maxAreas ?? 6;
  // deno-lint-ignore no-explicit-any
  const r = (raw ?? {}) as any;
  const overview = r.project_overview ?? {};
  const areasRaw = Array.isArray(r.areas) ? r.areas : [];

  const areas: PfpArea[] = areasRaw
    .slice(0, maxAreas)
    // deno-lint-ignore no-explicit-any
    .map((a: any): PfpArea => {
      const existing_area_id = a?.existing_area_id ? String(a.existing_area_id) : null;
      const plants: PfpPlant[] = (Array.isArray(a?.plants) ? a.plants : [])
        // deno-lint-ignore no-explicit-any
        .filter((p: any) => p && str(p.common_name))
        // deno-lint-ignore no-explicit-any
        .map((p: any) => ({
          common_name: str(p.common_name),
          scientific_name: p.scientific_name ? str(p.scientific_name) : null,
          quantity: clampInt(p.quantity, 1, 99, 1),
          role: str(p.role),
          companion_note: str(p.companion_note),
        }));
      const preparation_tasks: PfpTask[] = (Array.isArray(a?.preparation_tasks) ? a.preparation_tasks : [])
        // deno-lint-ignore no-explicit-any
        .filter((t: any) => t && str(t.title))
        // deno-lint-ignore no-explicit-any
        .map((t: any, i: number) => ({
          task_index: clampInt(t.task_index, 1, 99, i + 1),
          title: str(t.title),
          description: str(t.description),
          depends_on_index: t.depends_on_index == null ? null : clampInt(t.depends_on_index, 1, 99, 1),
        }));
      const maintenance_tasks: PfpMaint[] = (Array.isArray(a?.maintenance_tasks) ? a.maintenance_tasks : [])
        // deno-lint-ignore no-explicit-any
        .filter((t: any) => t && str(t.title))
        // deno-lint-ignore no-explicit-any
        .map((t: any) => ({
          title: str(t.title),
          description: str(t.description),
          frequency_days: clampInt(t.frequency_days, 1, 365, 7),
          seasonality: str(t.seasonality, "All year"),
        }));
      return {
        area_name: str(a?.area_name, "Planting area"),
        existing_area_id,
        is_new: existing_area_id == null,
        suggested_sunlight: a?.suggested_sunlight ? str(a.suggested_sunlight) : null,
        suggested_medium: a?.suggested_medium ? str(a.suggested_medium) : null,
        pairing_summary: str(a?.pairing_summary),
        plants,
        preparation_tasks,
        maintenance_tasks,
      };
    })
    // Drop areas with no plants — they're not actionable.
    .filter((a: PfpArea) => a.plants.length > 0);

  return {
    project_overview: {
      title: str(overview.title, "My planting plan"),
      summary: str(overview.summary),
      estimated_difficulty: str(overview.estimated_difficulty, "Average"),
    },
    areas,
  };
}
