// Add-Area wizard — pure state + commit-payload logic (2026-07-18).
// Kept out of the component so validation, pending-plant list rules and
// the commit shapes are Vitest-tested without React.

export interface WizardBedState {
  name: string;
  growingMedium: string;
  mediumTexture: string;
  /** Raw input strings — "" = unset. */
  ph: string;
  lux: string;
  waterMovement: string;
  nutrientSource: string;
}

export const EMPTY_BED: WizardBedState = {
  name: "",
  growingMedium: "",
  mediumTexture: "",
  ph: "",
  lux: "",
  waterMovement: "",
  nutrientSource: "",
};

export type BedValidationError = "name_required" | "ph_out_of_range" | "lux_out_of_range";

export function validateBed(bed: WizardBedState): BedValidationError | null {
  if (bed.name.trim() === "") return "name_required";
  if (bed.ph.trim() !== "") {
    const ph = Number(bed.ph);
    if (!Number.isFinite(ph) || ph < 0 || ph > 14) return "ph_out_of_range";
  }
  if (bed.lux.trim() !== "") {
    const lux = Number(bed.lux);
    if (!Number.isFinite(lux) || lux < 0) return "lux_out_of_range";
  }
  return null;
}

export interface PendingPlant {
  plantId: number;
  name: string;
  thumbnailUrl: string | null;
  quantity: number;
}

/** Adding an already-pending plant bumps its quantity instead of duplicating. */
export function addPendingPlant(
  list: PendingPlant[],
  plant: { plantId: number; name: string; thumbnailUrl?: string | null },
): PendingPlant[] {
  const existing = list.find((p) => p.plantId === plant.plantId);
  if (existing) {
    return list.map((p) =>
      p.plantId === plant.plantId ? { ...p, quantity: Math.min(99, p.quantity + 1) } : p,
    );
  }
  return [...list, { plantId: plant.plantId, name: plant.name, thumbnailUrl: plant.thumbnailUrl ?? null, quantity: 1 }];
}

export function removePendingPlant(list: PendingPlant[], plantId: number): PendingPlant[] {
  return list.filter((p) => p.plantId !== plantId);
}

export function setPendingQuantity(
  list: PendingPlant[],
  plantId: number,
  quantity: number,
): PendingPlant[] {
  const q = Math.min(99, Math.max(1, Math.round(quantity)));
  return list.map((p) => (p.plantId === plantId ? { ...p, quantity: q } : p));
}

export interface AreaCommit {
  /** Column patch for the `areas` insert — only fields the user set
   *  (plus name/location added by the caller). */
  areaFields: {
    name: string;
    growing_medium?: string;
    medium_texture?: string;
    medium_ph?: number;
    water_movement?: string;
    nutrient_source?: string;
    light_intensity_lux?: number;
  };
  /** Manual area_lux_readings row value — only when peak light was set. */
  luxReading: number | null;
  /** One entry per INSTANCE (quantity-expanded), ready for the caller to
   *  add home/area/location context. */
  instanceSeeds: Array<{ plant_id: number; plant_name: string }>;
}

/** Caller must run validateBed first — assumes numeric inputs are in range. */
export function buildAreaCommit(bed: WizardBedState, pending: PendingPlant[]): AreaCommit {
  const areaFields: AreaCommit["areaFields"] = { name: bed.name.trim() };
  if (bed.growingMedium) areaFields.growing_medium = bed.growingMedium;
  if (bed.mediumTexture) areaFields.medium_texture = bed.mediumTexture;
  if (bed.ph.trim() !== "") areaFields.medium_ph = Number(bed.ph);
  if (bed.waterMovement) areaFields.water_movement = bed.waterMovement;
  if (bed.nutrientSource) areaFields.nutrient_source = bed.nutrientSource;

  let luxReading: number | null = null;
  if (bed.lux.trim() !== "") {
    luxReading = Number(bed.lux);
    areaFields.light_intensity_lux = luxReading;
  }

  const instanceSeeds = pending.flatMap((p) =>
    Array.from({ length: p.quantity }, () => ({ plant_id: p.plantId, plant_name: p.name })),
  );

  return { areaFields, luxReading, instanceSeeds };
}
