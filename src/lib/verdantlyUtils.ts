// Verdantly API field conversion helpers and shared types.
// The Verdantly API returns variety objects; field names differ from Perenual.
// All callers should use the normalised PlantDetails shape.

export const VERDANTLY_WATERING_DAYS: Record<string, { min: number; max: number; label: string }> = {
  "low":      { min: 14, max: 21, label: "Minimum" },
  "moderate": { min: 7,  max: 14, label: "Average"  },
  "high":     { min: 2,  max: 7,  label: "Frequent" },
};

export const VERDANTLY_SUNLIGHT_MAP: Record<string, string[]> = {
  "full sun":                  ["full_sun"],
  "partial shade":             ["part_shade"],
  "full shade":                ["deep_shade"],
  "full sun to partial shade": ["full_sun", "part_shade"],
  "partial to full shade":     ["part_shade", "deep_shade"],
};

// Shared result shape used throughout plant search UI.
// Both PerenualService.getPlantDetails and VerdantlyService.getPlantDetails return this.
export interface PlantDetails {
  common_name: string;
  scientific_name: string[];
  other_names: string[];
  family: string | null;
  plant_type: string | null;
  cycle: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  watering: string | null;
  watering_benchmark: any;
  watering_min_days: number | null;
  watering_max_days: number | null;
  sunlight: string[];
  care_level: string | null;
  hardiness_min: number | null;
  hardiness_max: number | null;
  is_edible: boolean;
  is_toxic_pets: boolean;
  is_toxic_humans: boolean;
  attracts: string[];
  description: string | null;
  maintenance: string | null;
  growth_rate: string | null;
  growth_habit: string | null;
  drought_tolerant: boolean;
  salt_tolerant: boolean;
  thorny: boolean;
  invasive: boolean;
  tropical: boolean;
  indoor: boolean;
  pest_susceptibility: string[];
  flowers: boolean;
  cones: boolean;
  fruits: boolean;
  edible_leaf: boolean;
  cuisine: boolean;
  medicinal: boolean;
  leaf: boolean;
  flowering_season: string | null;
  harvest_season: string | null;
  pruning_month: string[];
  propagation: string[];
  // Provider-specific IDs (only the relevant one is populated)
  perenual_id?: number | null;
  verdantly_id?: string | null;
  // Extra Verdantly fields stored in new columns
  days_to_harvest_min?: number | null;
  days_to_harvest_max?: number | null;
  soil_ph_min?: number | null;
  soil_ph_max?: number | null;
  planting_instructions?: any | null;
  source: "api" | "verdantly" | "ai";
}

// Unified search result used in PlantSearchModal and BulkSearchModal.
export interface ProviderSearchResult {
  id: number | string;
  common_name: string;
  scientific_name: string[];
  thumbnail_url: string | null;
  _provider: "perenual" | "verdantly";
  // Extra for pre-filling when the user picks a result
  verdantly_id?: string;
  perenual_id?: number;
}

export function getProviderLabel(source: string): "Perenual" | "Verdantly" | null {
  if (source === "api" || source === "perenual") return "Perenual";
  if (source === "verdantly") return "Verdantly";
  return null;
}
