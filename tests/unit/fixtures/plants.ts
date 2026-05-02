let _seq = 0;
const uid = (prefix: string) => `${prefix}-${++_seq}`;

// Matches the shape returned by Supabase `plants` table rows used in task queries:
// .select("id, plant_name, identifier, location_name, area_name, plants(thumbnail_url, cycle)")
export interface InventoryItem {
  id: string;
  plant_name: string;
  identifier: string | null;
  location_name: string | null;
  area_name: string | null;
  plant_id: string | number | null;
  home_id: string;
  location_id: string | null;
  area_id: string | null;
  status: "Unplanted" | "Planted" | "Archived";
  plants?: { thumbnail_url: string | null; cycle: string | null } | null;
}

export interface PlantSpecies {
  id: string | number;
  common_name: string;
  scientific_name: string;
  thumbnail_url: string | null;
  cycle: string | null;
  watering: string | null;
  sunlight: string | null;
  care_level: string | null;
  is_indoor: boolean;
}

export function makePlantSpecies(overrides: Partial<PlantSpecies> = {}): PlantSpecies {
  return {
    id: uid("plant"),
    common_name: "Tomato",
    scientific_name: "Solanum lycopersicum",
    thumbnail_url: null,
    cycle: "Annual",
    watering: "Average",
    sunlight: "Full sun",
    care_level: "Medium",
    is_indoor: false,
    ...overrides,
  };
}

export function makeInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: uid("inv"),
    plant_name: "Tomato",
    identifier: null,
    location_name: "Back Garden",
    area_name: "Raised Bed A",
    plant_id: uid("plant"),
    home_id: uid("home"),
    location_id: uid("loc"),
    area_id: uid("area"),
    status: "Planted",
    plants: { thumbnail_url: null, cycle: "Annual" },
    ...overrides,
  };
}
