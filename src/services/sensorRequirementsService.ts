import { supabase } from "../lib/supabase";
import type { PlantSoilRanges } from "../lib/sensorRequirements";

// ─── Sensor requirements service ────────────────────────────────────────────
//
// On-demand AI generation of a plant's ideal soil ranges (moisture / EC /
// soil-temperature). Delegates to the `generate-plant-sensor-ranges` edge
// function, which reuses the shared plant-care-range prompt (the same one the
// library seeder + Area Coach use) so values stay consistent, and persists the
// result to the `plants` catalogue (and the matching `plant_library` row when
// it's missing values). AI-gated — callers should only offer this when the
// home has AI enabled.

export async function generatePlantSensorRanges(
  plantId: number,
  homeId: string | null,
): Promise<PlantSoilRanges> {
  const { data, error } = await supabase.functions.invoke("generate-plant-sensor-ranges", {
    body: { plantId, homeId },
  });
  if (error) throw new Error(error.message ?? "Couldn't generate soil requirements — try again.");
  return (data?.ranges ?? {}) as PlantSoilRanges;
}
