import { supabase } from "../lib/supabase";

export interface DiseaseInfo {
  description: string;
  solution: string;
  source: string;
}

export interface VisionResult {
  notes?: string;
  possible_names?: string[];
  possible_diseases?: string[] | null;
  diseaseInfo?: DiseaseInfo;
  plantData?: any;
  remedial_schedules?: any[];
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
    imageBase64: string;
    mimeType: string;
    action: "identify_vision" | "diagnose";
    plantSearch?: string;
  }): Promise<VisionResult> {
    return invoke(params);
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

  generateCareGuide(targetPlant: string): Promise<{ plantData: any }> {
    return invoke({ action: "generate_care_guide", targetPlant });
  },

  generateRemedialPlan(params: {
    diagnosisContext: string;
    targetPlant: string;
  }): Promise<{ remedial_schedules: any[] }> {
    return invoke({ action: "generate_remedial_plan", ...params });
  },

  recommendPlants(params: {
    isOutside: boolean;
    areaData: any;
    currentPlants: string[];
  }): Promise<{ recommendations: any[] }> {
    return invoke({ action: "recommend_plants", ...params });
  },

  searchPlantsText(plantSearch: string): Promise<{ matches: any[] }> {
    return invoke({ action: "search_plants_text", plantSearch });
  },
};
