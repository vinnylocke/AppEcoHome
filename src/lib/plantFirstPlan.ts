// Client-side types for the plant-first planner. The server
// (generate-plant-first-plan + _shared/plantFirstBlueprint.ts) is the source of
// truth for the shape + validation; this mirrors it for the wizard, the plan
// view and the execution service.

export type AreaMode = "existing" | "existing_plus_new" | "new";

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

/** A plant the user has chosen to include in the plan (Shed or search). */
export interface PfpSelectedPlant {
  name: string;
  scientific_name?: string | null;
  source: "shed" | "library" | "perenual" | "verdantly" | "ai" | "manual";
  inventory_item_id?: string | null;
}

/** Total plants across all area groups in a blueprint. */
export function countBlueprintPlants(bp: PlantFirstBlueprint | null | undefined): number {
  if (!bp?.areas) return 0;
  return bp.areas.reduce((n, a) => n + (a.plants?.length ?? 0), 0);
}
