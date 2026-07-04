// ─── Plant sensor requirements (soil moisture / EC / soil temperature) ──────
//
// Pure view-model helpers for the "Soil Requirements" tab. A plant's ideal
// stable soil ranges live on the `plants` row (with a `plant_library` fallback
// resolved server-side): soil_moisture_min/max (%), soil_ec_min/max (µS/cm),
// soil_temp_min/max (°C). These are the same values the AI Area Coach reads as
// authoritative targets — this tab just surfaces them per-plant.

export interface PlantSoilRanges {
  soil_moisture_min?: number | null;
  soil_moisture_max?: number | null;
  soil_ec_min?: number | null;
  soil_ec_max?: number | null;
  soil_temp_min?: number | null;
  soil_temp_max?: number | null;
}

export type SensorRequirementKey = "moisture" | "ec" | "temp";

export interface SensorRequirementRow {
  key: SensorRequirementKey;
  label: string;
  /** Unit suffix appended after the numbers (e.g. "%", " µS/cm", "°C"). */
  unit: string;
  min: number | null;
  max: number | null;
  /** True when both ends of the range are present. */
  hasValue: boolean;
  /** Formatted band, e.g. "30–60%", or "—" when missing. */
  display: string;
}

const n = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Format a min–max band with a unit suffix, or "—" when either end is null. */
export function formatSensorRange(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: string,
): string {
  const lo = n(min);
  const hi = n(max);
  return lo != null && hi != null ? `${lo}–${hi}${unit}` : "—";
}

const ROW_DEFS: { key: SensorRequirementKey; label: string; unit: string; minK: keyof PlantSoilRanges; maxK: keyof PlantSoilRanges }[] = [
  { key: "moisture", label: "Soil moisture", unit: "%", minK: "soil_moisture_min", maxK: "soil_moisture_max" },
  { key: "ec", label: "Soil EC (nutrients)", unit: " µS/cm", minK: "soil_ec_min", maxK: "soil_ec_max" },
  { key: "temp", label: "Soil temperature", unit: "°C", minK: "soil_temp_min", maxK: "soil_temp_max" },
];

/** Build the three requirement rows (moisture / EC / soil temp) from a plant. */
export function buildSensorRequirementRows(plant: PlantSoilRanges | null | undefined): SensorRequirementRow[] {
  return ROW_DEFS.map(({ key, label, unit, minK, maxK }) => {
    const min = n(plant?.[minK] as number | null | undefined);
    const max = n(plant?.[maxK] as number | null | undefined);
    const hasValue = min != null && max != null;
    return { key, label, unit, min, max, hasValue, display: formatSensorRange(min, max, unit) };
  });
}

/** True when the plant has at least one complete range. */
export function hasAnySensorRange(plant: PlantSoilRanges | null | undefined): boolean {
  return buildSensorRequirementRows(plant).some((r) => r.hasValue);
}

/** True when every one of the three ranges is present (nothing left to fill). */
export function hasAllSensorRanges(plant: PlantSoilRanges | null | undefined): boolean {
  return buildSensorRequirementRows(plant).every((r) => r.hasValue);
}
