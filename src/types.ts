export type UserMode = "Novice" | "Expert";

export interface UserProfile {
  uid: string;
  email: string;
  display_name: string;
  mode: "Novice" | "Expert";
  onboarded: boolean;
  aiEnabled: boolean;
  home_id?: string;
  notification_interval_hours?: number;
}

export interface Home {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Area {
  id: string;
  name: string;
  type: "inside" | "outside";
}

export interface Location {
  id: string;
  home_id: string; // ✅ Added to match App.tsx mapping
  name: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
  areas?: Area[];
}

export interface Plant {
  // ✅ FIX: Change number to string to support Universal ID strategy
  id: string; 
  common_name: string;
  scientific_name: string[]; 
  other_names?: string[];
  family?: string;
  type?: string; 
  cycle: "Perennial" | "Annual" | "Biennial" | "Unknown" | string;
  
  image_url?: string;
  thumbnail_url?: string;

  watering: "Frequent" | "Average" | "Minimum" | "None" | string;
  watering_benchmark?: {
    value: string;
    unit: string;
  };
  sunlight: string[]; 
  care_level: "Beginner" | "Intermediate" | "Advanced" | string;
  hardiness_zone?: { min: string; max: string };
  
  is_edible: boolean;
  is_toxic_pets: boolean;
  is_toxic_humans: boolean;
  attracts?: string[]; 
  propagation?: string[];
  
  description?: string;
  maintenance_notes?: string;
}

export interface PlantLog {
  id: string;
  type: "comment" | "picture";
  content: string;
  createdAt: string;
}

export interface HarvestRecord {
  id: string;
  date: string;
  amount: number;
  unit: string;
}

export interface YieldData {
  predictedYield?: number;
  predictedUnit?: string;
  lastPredictionDate?: string;
  predictionReasoning?: string;
  harvests?: HarvestRecord[];
}

export interface InventoryItem {
  id: string;
  // ✅ FIX: Change number to string to support both API IDs and Library UUIDs
  plant_id: string; 
  plant_name: string;
  plant_code?: string; // snake_case to match DB
  identifier?: string;
  status: string;
  home_id: string;
  locationId?: string;
  locationName?: string;
  areaId?: string;
  areaName?: string;
  plantedAt?: string | null;
  created_at: string;
  environment?: "Indoors" | "Outdoors" | string;
  isEstablished?: boolean;
  logs?: PlantLog[];
  yieldData?: YieldData;
}

export interface GardenTask {
  id: string;
  home_id: string; // ✅ Added to match App.tsx mapping
  title: string;
  description: string;
  status: "Pending" | "Completed" | "Postponed - Rain Expected" | string;
  dueDate: string;
  startDate?: string;
  completedAt?: string | null;
  type: "Watering" | "Feeding" | "Pruning" | "Harvesting" | string;
  plantId?: string; // Already string
  inventoryItemId?: string;
  isVirtual?: boolean;
}

export interface HourlyForecast {
  time: string;
  temp: number;
  code: number;
  uv: number;
}

export interface WeatherData {
  temp: number;
  condition: string;
  rainExpected: boolean;
  rainAmount?: number;
  isFrostWarning?: boolean;
  timestamp?: number;
  humidity: number;
  windSpeed: number;
  dewPoint: number;
  forecast24h: HourlyForecast[];
  pressure: number;
  uvMax: number;

  // ✅ ONLY the two warning windows your app actually uses
  todayWarnings?: {
    frost: { active: boolean; timePeriod?: string };
    heat: { active: boolean; timePeriod?: string };
    wind: { active: boolean; timePeriod?: string; maxSpeed?: number };
    rain: { active: boolean; timePeriod?: string; amount?: number };
  };
  tomorrowWarnings?: {
    frost: { active: boolean; timePeriod?: string };
    heat: { active: boolean; timePeriod?: string };
    wind: { active: boolean; timePeriod?: string; maxSpeed?: number };
    rain: { active: boolean; timePeriod?: string; amount?: number };
  };
}

export interface WeatherAlert {
  id: string;
  type: "wind" | "frost" | "rain" | "heat";
  locationName: string;
  message: string;
  date?: string;
  locationId: string;
}

export interface Guide {
  id: string;
  title: string;
  description: string;
  content: string;
  videoUrl?: string;
  category: "Propagation" | "Pruning" | "Planting" | "Harvesting" | "General";
  tags: string[];
  imageUrl?: string;
}