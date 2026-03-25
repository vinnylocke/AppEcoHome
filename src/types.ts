export type UserMode = "Novice" | "Expert";

export interface UserProfile {
  uid: string;
  email: string;
  display_name: string; // Changed from displayName
  mode: "Novice" | "Expert";
  onboarded: boolean;
  aiEnabled: boolean;
  home_id?: string; // Changed from homeId
  notification_interval_hours?: number; // Changed from notificationIntervalHours
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
  name: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
  areas?: Area[];
}

export interface Plant {
  id: string;
  name: string;
  scientificName?: string;
  careGuide: {
    sun: string;
    water: string;
    soil: string;
    minSoilEc?: number; // ✅ Minimum microSiemens per cm
    maxSoilEc?: number; // ✅ Maximum microSiemens per cm
    plantingMonth: string;
    harvestMonth?: string;
    minLightLux?: number;
    maxLightLux?: number;
    waterFrequency?: number;
    waterUnit?: string;
    avgSoilMoisture?: number;
    plantingStart?: string; // ISO Date String
    plantingEnd?: string; // ISO Date String
    harvestStart?: string;
    harvestEnd?: string;
  };
  isGlobal?: boolean;
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
  plantId: string;
  plantName: string;
  plantCode?: string;
  identifier?: string;
  status: "In Shed" | "Planted";
  locationId?: string;
  locationName?: string;
  areaId?: string;
  areaName?: string;
  plantedAt?: string;
  createdAt: string;
  environment?: "Indoors" | "Outdoors";
  isEstablished?: boolean;
  logs?: PlantLog[];
  yieldData?: YieldData;
}

export interface GardenTask {
  id: string;
  title: string;
  description: string;
  status: "Pending" | "Completed" | "Postponed - Rain Expected";
  dueDate: string;
  startDate?: string; // ✅ Add this for the "Start" date
  completedAt?: string;
  type: "Watering" | "Feeding" | "Pruning" | "Harvesting";
  plantId?: string;
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
  rainAmount?: number;      // ✅ Changed to optional
  isFrostWarning?: boolean; // ✅ Changed to optional
  timestamp?: number;
  forecast?: Array<{       // ✅ Changed to optional
    date: string;
    temp: number;
    condition: string;
    rain: number;
  }>;
  humidity: number;
  windSpeed: number;
  dewPoint: number;
  forecast24h: HourlyForecast[];
  uvIndex?: number;         // ✅ Changed to optional
  pressure: number;
  uvMax: number;
  nextDayWarnings?: {
    frost: { active: boolean; timePeriod?: string };
    heat: { active: boolean; timePeriod?: string };
    wind: {
      active: boolean;
      timePeriod?: string;
      maxSpeed?: number;
      severity?: "Low to Moderate" | "Moderate to Strong" | "High" | "Extreme";
      description?: string;
    };
    rain: { active: boolean; timePeriod?: string; amount?: number };
  };
  todayWarnings?: {
    frost: { active: boolean; timePeriod?: string };
    heat: { active: boolean; timePeriod?: string };
    wind: {
      active: boolean;
      timePeriod?: string;
      maxSpeed?: number;
      severity?: "Low to Moderate" | "Moderate to Strong" | "High" | "Extreme";
      description?: string;
    };
    rain: { active: boolean; timePeriod?: string; amount?: number };
  };
  tomorrowWarnings?: {
    frost: { active: boolean; timePeriod?: string };
    heat: { active: boolean; timePeriod?: string };
    wind: {
      active: boolean;
      timePeriod?: string;
      maxSpeed?: number;
      severity?: "Low to Moderate" | "Moderate to Strong" | "High" | "Extreme";
      description?: string;
    };
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
