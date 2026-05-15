import { supabase } from "../lib/supabase";

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

  generateCareGuide(targetPlant: string, homeId?: string): Promise<{ plantData: any }> {
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
  ): Promise<{ matches: any[]; hasMore: boolean }> {
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
