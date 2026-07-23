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
import { careGuideToPlantDetails } from "./plantProvider";
import { saveToShed, type SaveToShedSkeleton } from "./saveToShed";
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
 * Look up an existing catalogue row by scientific_name (case-insensitive
 * on the first sci name). Returns the matching plant id if found.
 * Used to dedup before cloning from `plant_library`.
 */
async function findCataloguePlantBySciName(sciName: string | null): Promise<number | null> {
  if (!sciName) return null;
  const target = sciName.trim().toLowerCase();
  if (!target) return null;
  const { data } = await supabase
    .from("plants")
    .select("id, scientific_name")
    .is("home_id", null)
    .ilike("scientific_name_key", target)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Map a raw `plant_library` row to a normalised `PlantDetails`. Shared by
 * the catalogue clone path and the bulk Add-to-Shed flow (which forwards it
 * as `preloadedDetails` so the AI branch skips Gemini entirely).
 */
export function libraryRowToPlantDetails(lib: any): PlantDetails {
  const sciNames = Array.isArray(lib.scientific_name) ? lib.scientific_name : [];
  return {
    common_name:        lib.common_name ?? "",
    scientific_name:    sciNames,
    other_names:        Array.isArray(lib.other_names) ? lib.other_names : [],
    family:             lib.family ?? null,
    plant_type:         lib.plant_type ?? null,
    cycle:              lib.cycle ?? null,
    image_url:          lib.image_url ?? lib.thumbnail_url ?? null,
    thumbnail_url:      lib.thumbnail_url ?? null,
    watering:           lib.watering ?? null,
    watering_benchmark: lib.watering_benchmark ?? null,
    watering_min_days:  lib.watering_min_days ?? null,
    watering_max_days:  lib.watering_max_days ?? null,
    sunlight:           Array.isArray(lib.sunlight) ? lib.sunlight : [],
    care_level:         lib.care_level ?? null,
    hardiness_min:      lib.hardiness_min ?? null,
    hardiness_max:      lib.hardiness_max ?? null,
    is_edible:          !!lib.is_edible,
    is_toxic_pets:      !!lib.is_toxic_pets,
    is_toxic_humans:    !!lib.is_toxic_humans,
    attracts:           Array.isArray(lib.attracts) ? lib.attracts : [],
    description:        lib.description ?? null,
    maintenance:        lib.maintenance ?? null,
    growth_rate:        lib.growth_rate ?? null,
    growth_habit:       lib.growth_habit ?? null,
    drought_tolerant:   !!lib.drought_tolerant,
    salt_tolerant:      !!lib.salt_tolerant,
    thorny:             false,
    invasive:           !!lib.invasive,
    tropical:           false,
    indoor:             !!lib.indoor,
    pest_susceptibility: Array.isArray(lib.pest_susceptibility) ? lib.pest_susceptibility : [],
    flowers:            !!lib.flowers,
    cones:              false,
    fruits:             !!lib.fruits,
    edible_leaf:        false,
    cuisine:            false,
    medicinal:          false,
    leaf:               false,
    flowering_season:   Array.isArray(lib.flowering_season) ? lib.flowering_season.join(", ") : null,
    harvest_season:     Array.isArray(lib.harvest_season) ? lib.harvest_season.join(", ") : null,
    pruning_month:      Array.isArray(lib.pruning_month) ? lib.pruning_month : [],
    propagation:        Array.isArray(lib.propagation) ? lib.propagation : [],
    perenual_id:        null,
    verdantly_id:       null,
    source:             "ai",
    db_plant_id:        null,
    freshness_version:  null,
    from_catalogue:     true,
  };
}

/**
 * Clone a `plant_library` row into the home `plants` catalogue table
 * so the preview / care guide UI can use it without invoking Gemini.
 * If a matching catalogue row already exists (same scientific name),
 * returns that instead of creating a duplicate.
 */
async function ensureCataloguePlantFromLibrary(
  libraryId: number,
): Promise<CataloguePlant> {
  const { data: lib, error: libErr } = await supabase
    .from("plant_library")
    .select("*")
    .eq("id", libraryId)
    .maybeSingle();
  if (libErr) throw libErr;
  if (!lib) throw new Error(`plant_library row ${libraryId} not found`);

  // Build a PlantDetails-shaped row from the library data.
  const details = libraryRowToPlantDetails(lib);

  // Dedup — the global AI catalogue holds at most ONE row per species
  // (unique index plants_ai_global_dedup_idx on scientific_name_key). The
  // library, however, has multiple common-name variants per species
  // ("Tomato" vs "Beefsteak Tomato", both Solanum lycopersicum).
  const sciNames = Array.isArray(lib.scientific_name) ? lib.scientific_name : [];
  const sciFirst = sciNames[0] ?? null;
  const existingId = await findCataloguePlantBySciName(sciFirst);
  if (existingId) {
    const existing = await loadCataloguePlant(existingId);
    const sameCommon =
      (existing.details.common_name ?? "").trim().toLowerCase() ===
      (lib.common_name ?? "").trim().toLowerCase();
    // Same species + same common name → the catalogued row IS this plant.
    if (sameCommon) return existing;
    // Same species, DIFFERENT common name (e.g. catalogued "Beefsteak Tomato"
    // vs the selected "Tomato"): we can't insert a second global row for the
    // species, so reuse the catalogue id for the species-level tabs (Grow
    // Guide / Companions / Light) but present the SELECTED library plant's own
    // identity + care data — otherwise the name would flip to the other variant.
    details.db_plant_id = existingId;
    return { plantId: existingId, source: "ai", details, fromCache: true };
  }

  const skeleton: Record<string, unknown> = {
    id: makeCatalogueId(),
    home_id: null,
    source: "ai",
    common_name: details.common_name,
    scientific_name: details.scientific_name,
    other_names: details.other_names,
    family: details.family,
    plant_type: details.plant_type,
    cycle: details.cycle,
    image_url: details.image_url,
    thumbnail_url: details.thumbnail_url,
    watering: details.watering,
    watering_min_days: details.watering_min_days,
    watering_max_days: details.watering_max_days,
    sunlight: details.sunlight,
    care_level: details.care_level,
    hardiness_min: details.hardiness_min,
    hardiness_max: details.hardiness_max,
    is_edible: details.is_edible,
    is_toxic_pets: details.is_toxic_pets,
    is_toxic_humans: details.is_toxic_humans,
    attracts: details.attracts,
    description: details.description,
    maintenance: details.maintenance,
    growth_rate: details.growth_rate,
    growth_habit: details.growth_habit,
    drought_tolerant: details.drought_tolerant,
    salt_tolerant: details.salt_tolerant,
    invasive: details.invasive,
    indoor: details.indoor,
    pest_susceptibility: details.pest_susceptibility,
    flowers: details.flowers,
    fruits: details.fruits,
    // Arrays go into the plants table as proper jsonb arrays so
    // downstream filters / task blueprints can match on individual
    // values (not comma-joined strings).
    flowering_season: Array.isArray(lib.flowering_season) ? lib.flowering_season : [],
    harvest_season: Array.isArray(lib.harvest_season) ? lib.harvest_season : [],
    pruning_month: details.pruning_month,
    propagation: details.propagation,
    soil: Array.isArray(lib.soil) ? lib.soil : [],
    days_to_harvest_min: lib.days_to_harvest_min ?? null,
    days_to_harvest_max: lib.days_to_harvest_max ?? null,
    soil_ph_min: lib.soil_ph_min ?? null,
    soil_ph_max: lib.soil_ph_max ?? null,
    labels: derivePlantLabels(details as any),
  };

  const { data: inserted, error } = await supabase
    .from("plants")
    .insert([skeleton])
    .select("id")
    .single();
  if (error) throw error;

  details.db_plant_id = inserted.id;
  return { plantId: inserted.id, source: "ai", details, fromCache: false };
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
      // catalogue hit, skip Gemini and read the existing row directly.
      // `loadCataloguePlant` handles the AI care_guide_data adapter so
      // the Care Guide tab has every field, not just the flat columns.
      if (result.catalogue_hit?.plant_id) {
        try {
          return await loadCataloguePlant(result.catalogue_hit.plant_id);
        } catch {
          // Catalogue hit went stale (the row was deleted) — fall through
          // to the Gemini path below.
        }
      }
      // Plant Library fast path — when the picks handler already
      // resolved this species to an existing plant_library row, clone
      // it into the home `plants` catalogue instead of paying Gemini.
      if (result.plant_library_id) {
        try {
          return await ensureCataloguePlantFromLibrary(result.plant_library_id);
        } catch (err) {
          // A stale/deleted plant_library_id (e.g. a pick cached before a
          // library cleanup) is an EXPECTED miss — the Gemini fallback below
          // recovers it, so keep it out of Sentry (RHOZLY-41). Only genuinely
          // unexpected failures stay as a (recovered) warning.
          const staleId = err instanceof Error && /not found/i.test(err.message);
          if (staleId) {
            Logger.log("library-clone: stale plant_library_id — falling back to Gemini", {
              plant_library_id: result.plant_library_id,
              common_name: result.common_name,
            });
          } else {
            Logger.warn("library-clone path failed; falling back to Gemini", err, {
              plant_library_id: result.plant_library_id,
              common_name: result.common_name,
            });
          }
          // fall through to the Gemini path below
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
 * Used when the preview screen is opened from the Saved tab — or by The
 * Library after `ensureCataloguePlantFromSearchResult` resolves.
 *
 * AI plants are special-cased: the AI catalogue insert path stores the rich
 * care data inside `care_guide_data` jsonb rather than the flat columns
 * (sunlight / cycle / watering / description / etc.). For those rows we
 * extract that blob via `careGuideToPlantDetails` so the Care Guide form
 * has every field populated. For Perenual/Verdantly rows the flat columns
 * are already set, so `plantRowToPlantDetails` works.
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

  let details: PlantDetails;
  if (source === "ai" && row.care_guide_data) {
    const blob = row.care_guide_data as Record<string, unknown>;
    const plantData = (blob.plantData as Record<string, unknown> | undefined) ?? blob;
    details = careGuideToPlantDetails(plantData, row.common_name ?? "");
    // The flat columns can still hold a stable thumbnail (the edge fn writes
    // it after generation); prefer that over whatever the blob carried.
    if (row.thumbnail_url) {
      details.thumbnail_url = row.thumbnail_url;
      details.image_url = row.image_url ?? row.thumbnail_url;
    }
  } else {
    details = plantRowToPlantDetails(row);
  }

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

// ───────────────────────────────────────────────────────────────────────
// "Is this catalogue plant already in the user's Shed?" + "Save it"
//
// Used by AddToCalendarSheet on the Grow Guide. When the user taps Add
// to calendar on a Library plant they haven't yet added to their Shed,
// we offer to save it alongside the task creation. The catalogue plant
// might be:
//   - a direct home-scoped row (rare; only orphan AI plants),
//   - already forked into the home (AI: `forked_from_plant_id`
//     pointing at the catalogue id; Perenual/Verdantly: same provider
//     id on a home-scoped row),
//   - or genuinely absent.
// ───────────────────────────────────────────────────────────────────────

export interface HomePlantMatch {
  homePlantId: number;
}

/**
 * Returns the home-scoped plant row id that represents this catalogue
 * plant in the user's Shed, or null if none exists yet.
 */
export async function findHomePlantForCatalogue(
  catalogueId: number,
  homeId: string,
): Promise<HomePlantMatch | null> {
  // 1. Read the catalogue plant's identifying fields. Could be a global
  //    row (home_id = null) OR an orphan home row that we're treating
  //    as a catalogue.
  const { data: catalogue, error: catalogueErr } = await supabase
    .from("plants")
    .select("id, home_id, source, perenual_id, verdantly_id")
    .eq("id", catalogueId)
    .maybeSingle();
  if (catalogueErr) {
    Logger.error("findHomePlantForCatalogue lookup failed", catalogueErr, { catalogueId });
    return null;
  }
  if (!catalogue) return null;

  // 1a. Catalogue id IS already a home plant in THIS home — fast exit.
  if (catalogue.home_id === homeId) {
    return { homePlantId: catalogue.id };
  }

  // 2. Look for an existing match in this home. Match key depends on
  //    the catalogue source.
  let query = supabase
    .from("plants")
    .select("id")
    .eq("home_id", homeId);

  if (catalogue.source === "api" && catalogue.perenual_id) {
    query = query.eq("perenual_id", catalogue.perenual_id);
  } else if (catalogue.source === "verdantly" && catalogue.verdantly_id) {
    query = query.eq("verdantly_id", catalogue.verdantly_id);
  } else if (catalogue.source === "ai") {
    query = query.eq("forked_from_plant_id", catalogueId);
  } else {
    // Unknown source — nothing to match against safely.
    return null;
  }

  const { data: match, error: matchErr } = await query.limit(1).maybeSingle();
  if (matchErr) {
    Logger.error("findHomePlantForCatalogue match query failed", matchErr, {
      catalogueId,
      homeId,
    });
    return null;
  }
  return match ? { homePlantId: match.id } : null;
}

/**
 * Save the catalogue plant into the user's Shed (creates a home-scoped
 * `plants` row + auto-seasonal schedules). Idempotent — if a matching
 * row already exists, returns it without writing.
 *
 * Returns the home plant id so callers can attach tasks / inventory
 * items to it.
 */
export async function saveCataloguePlantToShed(
  catalogueId: number,
  homeId: string,
): Promise<HomePlantMatch> {
  // Idempotency — bail early if already in this home's Shed.
  const existing = await findHomePlantForCatalogue(catalogueId, homeId);
  if (existing) return existing;

  // Load full catalogue details (PlantDetails shape) so the new home
  // plant has every flat care field populated for auto-scheduling.
  const catalogue = await loadCataloguePlant(catalogueId);
  const { source, details } = catalogue;

  let skeleton: SaveToShedSkeleton;
  if (source === "api") {
    skeleton = {
      common_name: details.common_name,
      scientific_name: details.scientific_name,
      thumbnail_url: details.thumbnail_url ?? null,
      source: "api",
      perenual_id: details.perenual_id ?? null,
      sunlight: details.sunlight,
      watering_min_days: details.watering_min_days,
      watering_max_days: details.watering_max_days,
      harvest_season: details.harvest_season,
      pruning_month: details.pruning_month,
    };
  } else if (source === "verdantly") {
    skeleton = {
      common_name: details.common_name,
      scientific_name: details.scientific_name,
      thumbnail_url: details.thumbnail_url ?? null,
      source: "verdantly",
      verdantly_id: details.verdantly_id ?? null,
      perenual_id: null,
      sunlight: details.sunlight,
      watering_min_days: details.watering_min_days,
      watering_max_days: details.watering_max_days,
      harvest_season: details.harvest_season,
      pruning_month: details.pruning_month,
    };
  } else {
    // AI catalogue plant — fork to the home with a parent pointer so
    // the existing AI freshness flow works (Wave 3 of AI Plant Overhaul).
    skeleton = {
      common_name: details.common_name,
      scientific_name: details.scientific_name,
      thumbnail_url: details.thumbnail_url ?? null,
      source: "ai",
      perenual_id: null,
      forked_from_plant_id: catalogueId,
      overridden_fields: [],
      sunlight: details.sunlight,
      watering_min_days: details.watering_min_days,
      watering_max_days: details.watering_max_days,
      harvest_season: details.harvest_season,
      pruning_month: details.pruning_month,
    };
  }

  const { plantId: homePlantId } = await saveToShed(skeleton, details as unknown as Record<string, unknown>, homeId);
  return { homePlantId };
}
