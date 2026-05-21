// Ensures a plant exists in the GLOBAL catalogue (a `plants` row with
// `home_id = NULL`) and returns its id.
//
// Used by The Library: when a user taps a search result we persist the
// underlying species to the catalogue before navigating to the preview
// screen. This means:
//
//   - The preview's Grow Guide tab can use the catalogue id straight away
//     and write its generated guide against the global plants.id, which
//     benefits the next user searching the same plant.
//   - The Companion Plants tab and the Light tab work identically to how
//     they do in the Shed, because they only need a plant_id.
//   - Saving to the Shed later just clones the catalogue row into a home-
//     scoped row (the existing TheShed flow), inheriting all the data.
//
// AI plants are routed through `generate_care_guide`, which already
// catalogues them and returns the global `plant_id` via `db_plant_id`.
//
// Perenual + Verdantly results don't currently have a catalogue layer in
// production — this helper introduces a tiny one, keyed on `(source,
// perenual_id|verdantly_id)`. No new migrations needed: we reuse the
// existing `plants` table with `home_id = null`.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import { PerenualService } from "./perenualService";
import { VerdantlyService } from "./verdantlyService";
import { PlantDoctorService } from "../services/plantDoctorService";
import { derivePlantLabels } from "./plantLabels";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

/** What the helper hands back to the caller. */
export interface CataloguePlant {
  /** Catalogue plant id — usable as a foreign key for grow_guide / companions / light. */
  plantId: number;
  /** Source as stored on the row. */
  source: "ai" | "api" | "verdantly";
  /** Normalised plant details, suitable for PlantInfoPanel rendering. */
  details: PlantDetails;
  /** True when the row already existed (read-only fast path); false when we just inserted. */
  fromCache: boolean;
}

function makeCatalogueId(): number {
  return Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
}

/**
 * Look up (or create) the global catalogue row for a Perenual hit.
 * Idempotent — repeated calls return the same row.
 */
async function ensurePerenualCataloguePlant(
  perenualId: number | string,
): Promise<CataloguePlant> {
  const pidString = String(perenualId);

  const { data: existing } = await supabase
    .from("plants")
    .select("id")
    .is("home_id", null)
    .eq("perenual_id", pidString)
    .maybeSingle();

  const details = (await PerenualService.getPlantDetails(
    Number(perenualId),
  )) as unknown as PlantDetails;

  if (existing) {
    return { plantId: existing.id, source: "api", details, fromCache: true };
  }

  const skeleton: Record<string, unknown> = {
    id: makeCatalogueId(),
    home_id: null,
    source: "api",
    perenual_id: pidString,
    common_name: details.common_name,
    scientific_name: details.scientific_name,
    thumbnail_url: details.thumbnail_url ?? details.image_url ?? null,
    sunlight: details.sunlight,
    cycle: details.cycle,
    watering: details.watering,
    watering_min_days: details.watering_min_days,
    watering_max_days: details.watering_max_days,
    is_edible: details.is_edible,
    is_toxic_pets: details.is_toxic_pets,
    is_toxic_humans: details.is_toxic_humans,
    description: details.description,
    flowering_season: details.flowering_season,
    harvest_season: details.harvest_season,
    pruning_month: details.pruning_month,
    propagation: details.propagation,
    labels: derivePlantLabels(details as any),
  };

  const { data: inserted, error } = await supabase
    .from("plants")
    .insert([skeleton])
    .select("id")
    .single();
  if (error) throw error;
  return { plantId: inserted.id, source: "api", details, fromCache: false };
}

/**
 * Look up (or create) the global catalogue row for a Verdantly hit.
 */
async function ensureVerdantlyCataloguePlant(
  verdantlyId: string,
): Promise<CataloguePlant> {
  const { data: existing } = await supabase
    .from("plants")
    .select("id")
    .is("home_id", null)
    .eq("verdantly_id", verdantlyId)
    .maybeSingle();

  const details = await VerdantlyService.getPlantDetails(verdantlyId);

  if (existing) {
    return { plantId: existing.id, source: "verdantly", details, fromCache: true };
  }

  const skeleton: Record<string, unknown> = {
    id: makeCatalogueId(),
    home_id: null,
    source: "verdantly",
    verdantly_id: verdantlyId,
    perenual_id: null,
    common_name: details.common_name,
    scientific_name: details.scientific_name,
    thumbnail_url: details.thumbnail_url ?? details.image_url ?? null,
    sunlight: details.sunlight,
    cycle: details.cycle,
    watering: details.watering,
    watering_min_days: details.watering_min_days,
    watering_max_days: details.watering_max_days,
    is_edible: details.is_edible,
    is_toxic_pets: details.is_toxic_pets,
    is_toxic_humans: details.is_toxic_humans,
    description: details.description,
    flowering_season: details.flowering_season,
    harvest_season: details.harvest_season,
    pruning_month: details.pruning_month,
    propagation: details.propagation,
    plant_metadata: (details as any).plant_metadata ?? null,
    labels: derivePlantLabels(details as any),
  };

  const { data: inserted, error } = await supabase
    .from("plants")
    .insert([skeleton])
    .select("id")
    .single();
  if (error) throw error;
  return { plantId: inserted.id, source: "verdantly", details, fromCache: false };
}

/**
 * Look up (or create) the global catalogue row for an AI hit. Defers to
 * `generate_care_guide`, which already maintains the AI catalogue and
 * returns `db_plant_id` on the response.
 */
async function ensureAiCataloguePlant(
  commonName: string,
  homeId: string | undefined,
): Promise<CataloguePlant> {
  const cleanName = commonName.split("(")[0].trim();

  const guide = await PlantDoctorService.generateCareGuide(cleanName, homeId);
  const data = (guide as any).plantData ?? guide;

  const plantId = (guide as any).db_plant_id as number | null | undefined;
  if (!plantId || typeof plantId !== "number") {
    throw new Error(
      "AI catalogue lookup returned without a db_plant_id — cannot open preview.",
    );
  }

  // Adapt the AI care-guide shape into our PlantDetails contract for the
  // preview UI. The Care Guide tab uses these fields directly.
  const details: PlantDetails = {
    common_name:        data.common_name ?? cleanName,
    scientific_name:    Array.isArray(data.scientific_name)
                          ? data.scientific_name
                          : data.scientific_name ? [data.scientific_name] : [],
    other_names:        [],
    family:             data.family ?? null,
    plant_type:         data.plant_type ?? null,
    cycle:              data.cycle ?? null,
    image_url:          data.thumbnail_url ?? null,
    thumbnail_url:      data.thumbnail_url ?? null,
    watering:           data.watering ?? null,
    watering_benchmark: null,
    watering_min_days:  data.watering_min_days ?? null,
    watering_max_days:  data.watering_max_days ?? null,
    sunlight:           data.sunlight ?? [],
    care_level:         data.care_level ?? null,
    hardiness_min:      null,
    hardiness_max:      null,
    is_edible:          data.is_edible ?? false,
    is_toxic_pets:      data.is_toxic_pets ?? false,
    is_toxic_humans:    data.is_toxic_humans ?? false,
    attracts:           data.attracts ?? [],
    description:        data.description ?? null,
    maintenance:        data.maintenance ?? null,
    growth_rate:        data.growth_rate ?? null,
    growth_habit:       null,
    drought_tolerant:   data.drought_tolerant ?? false,
    salt_tolerant:      false,
    thorny:             false,
    invasive:           false,
    tropical:           data.tropical ?? false,
    indoor:             data.indoor ?? false,
    pest_susceptibility: [],
    flowers:            false,
    cones:              false,
    fruits:             false,
    edible_leaf:        false,
    cuisine:            data.cuisine ?? false,
    medicinal:          data.medicinal ?? false,
    leaf:               false,
    flowering_season:   Array.isArray(data.flowering_season)
                          ? data.flowering_season.join(", ")
                          : data.flowering_season ?? null,
    harvest_season:     Array.isArray(data.harvest_season)
                          ? data.harvest_season.join(", ")
                          : data.harvest_season ?? null,
    pruning_month:      data.pruning_month ?? [],
    propagation:        data.propagation ?? [],
    perenual_id:        null,
    verdantly_id:       null,
    source:             "ai",
    db_plant_id:        plantId,
    freshness_version:  (guide as any).freshness_version ?? null,
    from_catalogue:     (guide as any).fromCatalogue ?? false,
  };

  return {
    plantId,
    source: "ai",
    details,
    fromCache: !!(guide as any).fromCatalogue,
  };
}

/**
 * Top-level entry — pass a search result row in, get a catalogue plant out.
 * Caller is expected to handle errors with a toast / inline banner.
 */
export async function ensureCataloguePlantFromSearchResult(
  result: ProviderSearchResult,
  options?: { homeId?: string },
): Promise<CataloguePlant> {
  try {
    if (result._provider === "ai") {
      // Wave 3 fast path — when the search result already carries a
      // catalogue hit, skip Gemini and read the existing row.
      if (result.catalogue_hit?.plant_id) {
        const { data: existing, error } = await supabase
          .from("plants")
          .select("*")
          .eq("id", result.catalogue_hit.plant_id)
          .maybeSingle();
        if (error) throw error;
        if (existing) {
          const details = plantRowToPlantDetails(existing);
          return {
            plantId: existing.id,
            source: "ai",
            details,
            fromCache: true,
          };
        }
      }
      return ensureAiCataloguePlant(result.common_name, options?.homeId);
    }
    if (result._provider === "perenual" && result.perenual_id != null) {
      return ensurePerenualCataloguePlant(result.perenual_id);
    }
    if (result._provider === "verdantly" && result.verdantly_id) {
      return ensureVerdantlyCataloguePlant(result.verdantly_id);
    }
    throw new Error(`Unsupported provider on search result: ${result._provider}`);
  } catch (err) {
    Logger.error("ensureCataloguePlantFromSearchResult failed", err, {
      provider: result._provider,
      common_name: result.common_name,
    });
    throw err;
  }
}

/**
 * Load a catalogue (or home-scoped) plant row by id and adapt to PlantDetails.
 * Used when the preview screen is opened from the Saved tab.
 */
export async function loadCataloguePlant(plantId: number): Promise<CataloguePlant> {
  const { data: row, error } = await supabase
    .from("plants")
    .select("*")
    .eq("id", plantId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Plant ${plantId} not found.`);

  const source = (row.source as "ai" | "api" | "verdantly" | "manual") || "ai";
  // Manual plants don't have a provider-side details fetch — render whatever
  // the row carries.
  const details = plantRowToPlantDetails(row);
  return {
    plantId: row.id,
    source: source === "manual" ? "ai" : source,
    details,
    fromCache: true,
  };
}

/** Convert a raw `plants` row to the PlantDetails shape used by the preview UI. */
export function plantRowToPlantDetails(row: Record<string, any>): PlantDetails {
  return {
    common_name:        row.common_name ?? "",
    scientific_name:    Array.isArray(row.scientific_name) ? row.scientific_name : [],
    other_names:        Array.isArray(row.other_names) ? row.other_names : [],
    family:             row.family ?? null,
    plant_type:         row.plant_type ?? null,
    cycle:              row.cycle ?? null,
    image_url:          row.image_url ?? row.thumbnail_url ?? null,
    thumbnail_url:      row.thumbnail_url ?? null,
    watering:           row.watering ?? null,
    watering_benchmark: row.watering_benchmark ?? null,
    watering_min_days:  row.watering_min_days ?? null,
    watering_max_days:  row.watering_max_days ?? null,
    sunlight:           Array.isArray(row.sunlight) ? row.sunlight : [],
    care_level:         row.care_level ?? null,
    hardiness_min:      row.hardiness_min ?? null,
    hardiness_max:      row.hardiness_max ?? null,
    is_edible:          !!row.is_edible,
    is_toxic_pets:      !!row.is_toxic_pets,
    is_toxic_humans:    !!row.is_toxic_humans,
    attracts:           Array.isArray(row.attracts) ? row.attracts : [],
    description:        row.description ?? null,
    maintenance:        row.maintenance_notes ?? row.maintenance ?? null,
    growth_rate:        row.growth_rate ?? null,
    growth_habit:       row.growth_habit ?? null,
    drought_tolerant:   !!row.drought_tolerant,
    salt_tolerant:      !!row.salt_tolerant,
    thorny:             !!row.thorny,
    invasive:           !!row.invasive,
    tropical:           !!row.tropical,
    indoor:             !!row.indoor,
    pest_susceptibility: Array.isArray(row.pest_susceptibility) ? row.pest_susceptibility : [],
    flowers:            !!row.flowers,
    cones:              !!row.cones,
    fruits:             !!row.fruits,
    edible_leaf:        !!row.edible_leaf,
    cuisine:            !!row.cuisine,
    medicinal:          !!row.medicinal,
    leaf:               !!row.leaf,
    flowering_season:   Array.isArray(row.flowering_season)
                          ? row.flowering_season.join(", ")
                          : row.flowering_season ?? null,
    harvest_season:     Array.isArray(row.harvest_season)
                          ? row.harvest_season.join(", ")
                          : row.harvest_season ?? null,
    pruning_month:      Array.isArray(row.pruning_month) ? row.pruning_month : [],
    propagation:        Array.isArray(row.propagation) ? row.propagation : [],
    perenual_id:        row.perenual_id ?? null,
    verdantly_id:       row.verdantly_id ?? null,
    source:             (row.source as any) ?? "ai",
  };
}
