import { supabase } from "../lib/supabase";
import type { SuggestedTask } from "../components/TaskActionButtons";

export interface DiseaseInfo {
  description: string;
  solution: string;
  source: string;
}

export interface PestInfo {
  description: string;
  affected_plants: string;
  treatment: string;
  prevention: string;
  source: string;
}

export interface IdentificationCandidate {
  name: string;
  scientific_name?: string;
  confidence: number;
}

export interface VisionResult {
  notes?: string;
  possible_names?: IdentificationCandidate[];
  possible_diseases?: IdentificationCandidate[] | null;
  diseaseInfo?: DiseaseInfo;
  plantData?: any;
  remedial_schedules?: any[];
  possible_pests?: IdentificationCandidate[];
  is_pest?: boolean;
  pest_severity?: "Low" | "Medium" | "High" | null;
  pestInfo?: PestInfo;
  severity?: "Low" | "Medium" | "High" | "Healthy" | null;
  environmental_factors?: string[] | null;
  immediate_actions?: string[] | null;
}

/**
 * AI plant catalogue hit returned by `search_plants_text` for matches that
 * already exist in the global catalogue (`hit_kind: "global"`) or as the
 * current home's fork (`hit_kind: "home_fork"`).
 *
 * When present, the client should:
 *  - Render an "In catalogue" / "Your custom version" pill on the result.
 *  - Skip the `generate_care_guide` call on add — use `plant_id` directly.
 *
 * Added in Wave 2 of AI Plant Overhaul; consumed in Wave 3.
 */
export interface CatalogueHit {
  hit_kind: "global" | "home_fork";
  plant_id: number;
  care_guide_data: { plantData?: any } | null;
  freshness_version: number | null;
  last_care_generated_at: string | null;
  overridden_fields: string[] | null;
}

/**
 * Extended `generate_care_guide` response (Wave 2 of AI Plant Overhaul).
 * Backward-compatible — old clients only consume `plantData`.
 *
 *  - `db_plant_id` is set whenever the catalogue store succeeded (either
 *    the global row existed already, or the edge fn just inserted it).
 *  - `fromCatalogue` is true when no Gemini call was made.
 */
export interface CareGuideResponse {
  plantData: any;
  db_plant_id?: number | null;
  freshness_version?: number | null;
  last_care_generated_at?: string | null;
  fromCatalogue?: boolean;
}

/**
 * Full payload returned by the `analyse_comprehensive` action — a single
 * Gemini call that combines identification, health, pruning, propagation,
 * edibility, optional disease/pest, and a list of suggested tasks in the
 * same shape PlantDoctorChat already produces.
 *
 * The `suggested_tasks` array is consumed verbatim by `TaskActionButtons`
 * so there's no second AI round-trip and no new task-writing code path.
 */
export interface AnalyseResult {
  identification: {
    common_name: string;
    scientific_name: string[];
    confidence: number;
  };
  health: {
    state: "healthy" | "stressed" | "diseased" | "pest_damaged";
    notes: string;
    sunlight_appears_appropriate: boolean | null;
    sunlight_notes: string | null;
  };
  pruning: {
    method: string;
    where_to_cut: string;
    how_to_cut: string;
    tips: string[];
  };
  propagation: {
    method: string;
    when: string;
    steps: string[];
  };
  edibility: {
    is_edible: boolean;
    ripeness: "not_yet" | "near_ripe" | "ripe" | "overripe" | null;
    estimated_days_until_ripe: number | null;
    notes: string | null;
  } | null;
  disease: {
    name: string;
    cure_methods: string[];
    prevention_methods: string[];
  } | null;
  pest: {
    name: string;
    removal_methods: string[];
    prevention_methods: string[];
  } | null;
  suggested_tasks: SuggestedTask[];
}

/**
 * Cached frost-date payload returned by `lookup_frost_dates` (Mobile Quick
 * Access Wave 3). Open to all tiers; cached per-home with a 6-month TTL.
 * Server validates AI output before persisting — invalid responses return
 * a 422 with `{ error: "frost_lookup_validation_failed", reason }`.
 */
export interface FrostDates {
  last_frost_iso: string;
  first_frost_iso: string;
  growing_season_days: number;
  notes: string | null;
  rain_skip_mm: number;
  rain_water_mm: number;
  from_cache: boolean;
}

/**
 * Per-plant planting guidance returned by `plant_when_to_plant`. Threaded
 * with the home's cached frost dates so timing is anchored to the user's
 * climate. Sage+ AI-tier-gated.
 */
export interface PlantingGuidance {
  plant_name: string;
  scientific_name: string | null;
  can_plant_outdoors_now: boolean;
  earliest_outdoor_date: string;
  latest_outdoor_date: string;
  indoor_start_recommended: boolean;
  indoor_start_date: string | null;
  spacing_cm: number | null;
  depth_cm: number | null;
  sun_requirement: string;
  tips: string[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("plant-doctor", {
    body,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const PlantDoctorService = {
  analyzeImage(params: {
    homeId?: string;
    imageBase64: string;
    mimeType: string;
    action: "identify_vision" | "diagnose" | "identify_pest";
    plantSearch?: string;
    targetPlant?: string;
    inventoryItemId?: string;
    areaId?: string;
    deviceLat?: number;
    deviceLng?: number;
  }): Promise<VisionResult> {
    return invoke(params);
  },

  analyseComprehensive(params: {
    homeId?: string;
    imageBase64: string;
    mimeType: string;
    targetPlant?: string;
    inventoryItemId?: string;
    areaId?: string;
    deviceLat?: number;
    deviceLng?: number;
  }): Promise<AnalyseResult> {
    return invoke({ action: "analyse_comprehensive", ...params });
  },

  lookupFrostDates(homeId: string): Promise<FrostDates> {
    return invoke({ action: "lookup_frost_dates", homeId });
  },

  plantWhenToPlant(plantName: string, homeId: string): Promise<PlantingGuidance> {
    return invoke({ action: "plant_when_to_plant", targetPlant: plantName, homeId });
  },

  fetchPestDetails(params: {
    pestName: string;
    notes?: string;
  }): Promise<{ pestInfo?: PestInfo }> {
    return invoke({ action: "get_ai_pest_info", pestName: params.pestName, notes: params.notes });
  },

  fetchDiseaseDetails(params: {
    type: "api" | "ai";
    diseaseName: string;
    notes?: string;
  }): Promise<{ diseaseInfo?: DiseaseInfo; notFound?: boolean }> {
    return invoke({
      action:
        params.type === "api" ? "fetch_perenual_disease" : "get_ai_disease_info",
      diseaseName: params.diseaseName,
      notes: params.notes,
    });
  },

  generateCareGuide(
    targetPlant: string,
    homeId?: string,
  ): Promise<CareGuideResponse> {
    return invoke({ action: "generate_care_guide", targetPlant, homeId });
  },

  generateRemedialPlan(params: {
    homeId?: string;
    diagnosisContext: string;
    targetPlant: string;
  }): Promise<{ remedial_schedules: any[] }> {
    return invoke({ action: "generate_remedial_plan", ...params });
  },

  recommendPlants(params: {
    homeId?: string;
    isOutside: boolean;
    areaData: any;
    currentPlants: string[];
  }): Promise<{ recommendations: any[] }> {
    return invoke({ action: "recommend_plants", ...params });
  },

  searchPlantsText(
    plantSearch: string,
    options?: {
      searchFilters?: {
        cycle?: string[];
        watering?: string[];
        sunlight?: string[];
        edible?: 0 | 1;
        poisonous?: 0 | 1;
        indoor?: 0 | 1;
        hardinessMin?: number;
        hardinessMax?: number;
      };
      offset?: number;
      homeId?: string;
    },
  ): Promise<{ matches: string[]; hasMore: boolean; hits?: Record<string, CatalogueHit> }> {
    return invoke({
      action: "search_plants_text",
      plantSearch,
      searchFilters: options?.searchFilters,
      searchOffset: options?.offset ?? 0,
      homeId: options?.homeId,
    });
  },

  async applyTreatmentPlan(params: {
    homeId: string;
    sickInventoryId: string;
    selectedItem: { location_id: string; area_id: string };
    remedialSchedules: any[];
    selectedDisease: string | null;
    notes?: string;
    imageFile: File | null;
  }): Promise<void> {
    const { homeId, sickInventoryId, selectedItem, remedialSchedules, selectedDisease, notes, imageFile } = params;

    const recurringSchedules = remedialSchedules.filter((s) => s.is_recurring);
    const oneOffTasks = remedialSchedules.filter((s) => !s.is_recurring);
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    if (recurringSchedules.length > 0) {
      const blueprintsToInsert = recurringSchedules.map((schedule) => {
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + (schedule.end_offset_days || 28));
        return {
          home_id: homeId,
          inventory_item_ids: [sickInventoryId],
          location_id: selectedItem.location_id,
          area_id: selectedItem.area_id,
          title: schedule.title,
          description: schedule.description,
          task_type: schedule.task_type,
          frequency_days: schedule.frequency_days,
          is_recurring: true,
          start_date: todayStr,
          end_date: endDate.toISOString().split("T")[0],
          priority: "High",
        };
      });

      const { data: createdBps, error: blueprintError } = await supabase
        .from("task_blueprints")
        .insert(blueprintsToInsert)
        .select();
      if (blueprintError) throw blueprintError;

      if (createdBps) {
        const initialTasks = createdBps.map((bp: any) => ({
          home_id: homeId,
          blueprint_id: bp.id,
          title: bp.title,
          description: bp.description,
          type: bp.task_type,
          location_id: bp.location_id,
          area_id: bp.area_id,
          inventory_item_ids: bp.inventory_item_ids,
          due_date: bp.start_date,
          status: "Pending",
        }));
        await supabase.from("tasks").insert(initialTasks);
      }
    }

    if (oneOffTasks.length > 0) {
      const tasksToInsert = oneOffTasks.map((task: any) => ({
        home_id: homeId,
        inventory_item_ids: [sickInventoryId],
        location_id: selectedItem.location_id,
        area_id: selectedItem.area_id,
        title: `URGENT: ${task.title}`,
        description: task.description,
        type: task.task_type,
        due_date: todayStr,
        status: "Pending",
      }));
      const { error: taskError } = await supabase.from("tasks").insert(tasksToInsert);
      if (taskError) throw taskError;
    }

    if (imageFile) {
      let uploadedImageUrl: string | null = null;
      const fileExt = imageFile.name.split(".").pop() || "jpg";
      const filePath = `plant-photos/diagnosis-${sickInventoryId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("plant-images")
        .upload(filePath, imageFile);

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from("plant-images")
          .getPublicUrl(filePath);
        uploadedImageUrl = publicUrl;
      }

      let journalBody = `🩺 Initial Diagnosis:\n${notes}\n\n`;
      if (selectedDisease) journalBody += `🦠 Suspected Condition: ${selectedDisease}\n\n`;
      journalBody += `💊 Applied Treatment Plan:\n`;
      remedialSchedules.forEach((task: any) => { journalBody += `- ${task.title}\n`; });

      await supabase.from("plant_journals").insert([{
        home_id: homeId,
        inventory_item_id: sickInventoryId,
        subject: `Diagnostic Report: ${selectedDisease || "General Checkup"}`,
        description: journalBody,
        image_url: uploadedImageUrl,
      }]);
    }
  },
};
