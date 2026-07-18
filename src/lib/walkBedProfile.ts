// Pure logic for the Garden Walk's Bed profile section (WalkReadingSheet).
// The sheet prefills the current area values; on save only *changed*
// fields go into the areas.update patch, so a walk-save can never
// clobber a concurrent Advanced-settings edit to a different field.

export interface BedProfileCurrent {
  medium_ph: number | null;
  light_intensity_lux: number | null;
  water_movement: string | null;
  nutrient_source: string | null;
}

/** Raw field values straight from the sheet inputs ("" = unset/cleared). */
export interface BedProfileInputs {
  ph: string;
  lux: string;
  waterMovement: string;
  nutrientSource: string;
}

export type BedProfileError = "ph_out_of_range" | "lux_out_of_range";

export interface BedProfileDiff {
  /** Column patch for `areas.update` — changed fields only. */
  patch: Partial<{
    medium_ph: number | null;
    light_intensity_lux: number | null;
    water_movement: string | null;
    nutrient_source: string | null;
  }>;
  /** When the user entered a NEW peak-light value, the number to also log
   *  as a manual `area_lux_readings` row (mirrors AreaLuxReadings, so the
   *  Light Sensor history stays coherent). Null when lux is unchanged or
   *  cleared — clearing nulls the column but logs nothing. Known quirk:
   *  a clear is not durable — the old lux readings survive, and the next
   *  add/edit/delete in Area Advanced settings re-derives the column from
   *  the surviving latest row (`AreaLuxReadings.syncLatest`), resurrecting
   *  the cleared value. Deliberate: deleting history rows from a quick
   *  walk sheet would be worse. */
  luxReading: number | null;
}

export function validateBedProfile(inputs: BedProfileInputs): BedProfileError | null {
  if (inputs.ph.trim() !== "") {
    const ph = Number(inputs.ph);
    if (!Number.isFinite(ph) || ph < 0 || ph > 14) return "ph_out_of_range";
  }
  if (inputs.lux.trim() !== "") {
    const lux = Number(inputs.lux);
    if (!Number.isFinite(lux) || lux < 0) return "lux_out_of_range";
  }
  return null;
}

/** Numeric field diff: "" clears (→ null) only when a value existed;
 *  otherwise include only when the parsed number actually differs. */
function diffNumber(input: string, current: number | null): { changed: boolean; value: number | null } {
  if (input.trim() === "") {
    return { changed: current !== null, value: null };
  }
  const parsed = Number(input);
  return { changed: parsed !== current, value: parsed };
}

function diffSelect(input: string, current: string | null): { changed: boolean; value: string | null } {
  const value = input === "" ? null : input;
  return { changed: value !== (current ?? null), value };
}

/**
 * Build the areas.update patch from the sheet inputs vs the prefetched
 * current values. Caller must run validateBedProfile first — this
 * function assumes numeric inputs are in range.
 */
export function buildBedProfilePatch(
  current: BedProfileCurrent,
  inputs: BedProfileInputs,
): BedProfileDiff {
  const patch: BedProfileDiff["patch"] = {};
  let luxReading: number | null = null;

  const ph = diffNumber(inputs.ph, current.medium_ph);
  if (ph.changed) patch.medium_ph = ph.value;

  const lux = diffNumber(inputs.lux, current.light_intensity_lux);
  if (lux.changed) {
    patch.light_intensity_lux = lux.value;
    if (lux.value !== null) luxReading = lux.value;
  }

  const water = diffSelect(inputs.waterMovement, current.water_movement);
  if (water.changed) patch.water_movement = water.value;

  const nutrient = diffSelect(inputs.nutrientSource, current.nutrient_source);
  if (nutrient.changed) patch.nutrient_source = nutrient.value;

  return { patch, luxReading };
}

export function bedProfileHasChanges(diff: BedProfileDiff): boolean {
  return Object.keys(diff.patch).length > 0;
}
