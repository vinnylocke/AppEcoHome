// `saveToShed` — the single point of truth for inserting a `plants` row
// scoped to a user's home. Extracted from TheShed.tsx so The Library can
// reuse it without copy-pasting the auto-schedule logic.
//
// The function is intentionally identical in behaviour to the original
// `savePlantToDB` closure — same id generation, same label derivation,
// same auto-seasonal-schedules block. Anything that touches Shed-side
// invariants should live here so the two surfaces never drift.

import { supabase } from "./supabase";
import { getHemisphere, normalizePeriods } from "./seasonal";
import { buildAutoSeasonalSchedules } from "./plantScheduleFactory";
import { derivePlantLabels } from "./plantLabels";

export interface SaveToShedSkeleton {
  common_name: string;
  scientific_name?: string[] | null;
  thumbnail_url?: string | null;
  source: "manual" | "api" | "ai" | "verdantly";
  perenual_id?: string | number | null;
  verdantly_id?: string | null;
  plant_metadata?: Record<string, unknown> | null;
  forked_from_plant_id?: number | null;
  overridden_fields?: string[];
  labels?: string[] | null;
  sunlight?: unknown;
  watering_min_days?: number | null;
  watering_max_days?: number | null;
  harvest_season?: unknown;
  pruning_month?: unknown;
  /** Caller may pre-set the id (helpful for tests); otherwise generated. */
  id?: number;
  [key: string]: unknown;
}

export interface SaveToShedResult {
  plantId: number;
  /** Raw row as returned from supabase, for callers that need it. */
  row: Record<string, unknown>;
}

function generatePlantId(): number {
  return Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
}

/**
 * Insert a plant into the user's shed and auto-create the seasonal
 * schedules + Verdantly harvest-check schedule when applicable.
 *
 * @param skeleton  partial `plants` row to insert. `id` and `home_id` are
 *                  filled in automatically.
 * @param fullCareData  optional richer source for label derivation /
 *                      schedule windows (e.g. the full Perenual/Verdantly
 *                      details object, or the AI care guide).
 * @param homeId   home to attach the plant to.
 */
export async function saveToShed(
  skeleton: SaveToShedSkeleton,
  fullCareData: Record<string, unknown> | undefined,
  homeId: string,
): Promise<SaveToShedResult> {
  const row: Record<string, unknown> = { ...skeleton };
  if (row.id == null) row.id = generatePlantId();
  row.home_id = homeId;

  // Auto-derive labels for non-manual plants from the care data. Manual
  // plants carry their user-supplied labels from the form already.
  if (
    skeleton.source === "api" ||
    skeleton.source === "ai" ||
    skeleton.source === "verdantly"
  ) {
    row.labels = derivePlantLabels((fullCareData ?? {}) as any);
    if (!row.sunlight && (fullCareData as any)?.sunlight?.length) {
      row.sunlight = (fullCareData as any).sunlight;
    }
  }

  const { data: savedPlant, error } = await supabase
    .from("plants")
    .insert([row])
    .select()
    .single();
  if (error) throw error;

  // Pull the home's hemisphere so the auto-seasonal-schedules windows
  // land in the right months (Southern users need flipped seasonality).
  const { data: homeData } = await supabase
    .from("homes")
    .select("country, timezone")
    .eq("id", homeId)
    .single();
  const hemisphere = getHemisphere(homeData?.country, homeData?.timezone);

  const newSchedules = buildAutoSeasonalSchedules({
    plantId: savedPlant.id,
    homeId,
    hemisphere,
    harvestPeriods: normalizePeriods(
      (fullCareData as any)?.harvest_season || (skeleton as any).harvest_season,
    ),
    pruningPeriods: normalizePeriods(
      (fullCareData as any)?.pruning_month || (skeleton as any).pruning_month,
    ),
    wateringMinDays:
      (fullCareData as any)?.watering_min_days ||
      (skeleton as any)?.watering_min_days ||
      3,
    wateringMaxDays:
      (fullCareData as any)?.watering_max_days ||
      (skeleton as any)?.watering_max_days ||
      14,
  });

  if (newSchedules.length > 0) {
    await supabase.from("plant_schedules").insert(newSchedules);
  }

  // Verdantly edible plants get a per-instance harvest-check schedule on
  // top of the seasonal ones, since their care guide carries explicit
  // days-to-harvest windows the seasonal scheduler can't infer.
  const harvestMeta =
    (fullCareData as any)?.plant_metadata ??
    (skeleton as any).plant_metadata;
  if (harvestMeta?.harvest_days_min && skeleton.source === "verdantly") {
    await supabase.from("plant_schedules").insert({
      plant_id: savedPlant.id,
      home_id: homeId,
      title: "Check for harvest",
      task_type: "Harvest",
      trigger_event: "Planted",
      start_reference: "Trigger Date",
      start_offset_days: harvestMeta.harvest_days_min,
      end_reference: "Trigger Date",
      end_offset_days:
        harvestMeta.harvest_days_max ?? harvestMeta.harvest_days_min,
      frequency_days: 1,
      is_recurring: true,
      is_auto_generated: true,
    });
  }

  return { plantId: savedPlant.id, row: savedPlant };
}
