// 2026-06-16 — Area ↔ Sensor linkage Phase 2.
//
// Manual area-metric entry — write rows into area_moisture_readings /
// area_temp_readings / area_ec_readings with `source = 'manual'`. The
// fan-out / bump triggers in the migration keep areas.latest_* in sync
// so AI prompts and Care guide queries read the canonical state from a
// single column without joining the time-series tables.

import { supabase } from "../lib/supabase";
import type { EcSource } from "./areaSensorsService";

export interface ManualReadingInput {
  homeId: string;
  areaId: string;
  /** ISO timestamp. Defaults to "now" when omitted by the caller. */
  recordedAt?: string;
  /** Optional — leave undefined for metrics the user didn't enter. */
  moisturePct?: number;
  /** Soil temperature in Celsius — storage canonical unit. */
  tempC?: number;
  /** EC value. Unit depends on `ecSource`. Default ec_source is
   *  calibrated_us_cm (matches the WH52 case + most manual probes). */
  ec?: number;
  ecSource?: EcSource;
}

export type ValidationError =
  | "nothing_entered"
  | "moisture_out_of_range"
  | "temp_out_of_range"
  | "ec_out_of_range"
  | "ec_source_invalid";

/**
 * Pure validation step — checked separately from the network write so
 * the UI can flag errors without a round-trip. Mirrors the CHECK
 * constraints in the migration.
 */
export function validateManualReading(input: ManualReadingInput): ValidationError | null {
  const hasAny =
    input.moisturePct !== undefined ||
    input.tempC !== undefined ||
    input.ec !== undefined;
  if (!hasAny) return "nothing_entered";

  if (input.moisturePct !== undefined) {
    if (!Number.isFinite(input.moisturePct)) return "moisture_out_of_range";
    if (input.moisturePct < 0 || input.moisturePct > 100) return "moisture_out_of_range";
  }
  if (input.tempC !== undefined) {
    if (!Number.isFinite(input.tempC)) return "temp_out_of_range";
    if (input.tempC < -50 || input.tempC > 80) return "temp_out_of_range";
  }
  if (input.ec !== undefined) {
    if (!Number.isFinite(input.ec)) return "ec_out_of_range";
    if (input.ec < 0 || input.ec > 100000) return "ec_out_of_range";
    if (
      input.ecSource !== undefined &&
      input.ecSource !== "calibrated_us_cm" &&
      input.ecSource !== "raw_adc"
    ) {
      return "ec_source_invalid";
    }
  }
  return null;
}

export interface LogReadingResult {
  inserted_metrics: Array<"moisture" | "temp" | "ec">;
}

/**
 * Write one row per supplied metric. Triggers on each table keep
 * areas.latest_* in sync — no second round-trip needed.
 *
 * Throws on validation failure (string error code from
 * {@link ValidationError}) or supabase error.
 */
export async function logManualReading(input: ManualReadingInput): Promise<LogReadingResult> {
  const validation = validateManualReading(input);
  if (validation !== null) {
    throw new Error(validation);
  }

  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const inserted: LogReadingResult["inserted_metrics"] = [];

  if (input.moisturePct !== undefined) {
    const { error } = await supabase.from("area_moisture_readings").insert({
      home_id: input.homeId,
      area_id: input.areaId,
      value_pct: input.moisturePct,
      recorded_at: recordedAt,
      source: "manual",
    });
    if (error) throw error;
    inserted.push("moisture");
  }
  if (input.tempC !== undefined) {
    const { error } = await supabase.from("area_temp_readings").insert({
      home_id: input.homeId,
      area_id: input.areaId,
      value_c: input.tempC,
      recorded_at: recordedAt,
      source: "manual",
    });
    if (error) throw error;
    inserted.push("temp");
  }
  if (input.ec !== undefined) {
    const { error } = await supabase.from("area_ec_readings").insert({
      home_id: input.homeId,
      area_id: input.areaId,
      value: input.ec,
      ec_source: input.ecSource ?? "calibrated_us_cm",
      recorded_at: recordedAt,
      source: "manual",
    });
    if (error) throw error;
    inserted.push("ec");
  }

  return { inserted_metrics: inserted };
}
