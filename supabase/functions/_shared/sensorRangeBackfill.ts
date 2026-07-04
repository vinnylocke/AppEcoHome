// Pure selection + patch helpers for the sensor-range backfill cron.
//
// The cron sweeps `plant_library` (and the global `plants` catalogue) for rows
// missing any of the six soil-range columns and fills only the NULLs — so a
// verified value is never overwritten, and a row that already has all six is
// skipped entirely. Extracted here so the logic is unit-testable in Deno
// without a live DB (see supabase/tests/sensorRangeBackfill.test.ts).

export const SENSOR_RANGE_FIELDS = [
  "soil_moisture_min", "soil_moisture_max",
  "soil_ec_min", "soil_ec_max",
  "soil_temp_min", "soil_temp_max",
] as const;

export type SensorRangeField = typeof SENSOR_RANGE_FIELDS[number];

const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** True when the row is missing at least one of the six range columns. */
export function needsRangeBackfill(row: Partial<Record<SensorRangeField, unknown>> | null | undefined): boolean {
  if (!row) return false;
  return SENSOR_RANGE_FIELDS.some((f) => fin(row[f]) == null);
}

/**
 * Build the UPDATE patch: fill ONLY the columns that are currently NULL on the
 * row from the freshly-generated values. Never overwrites an existing value
 * (so verified library values stay intact). Returns `{}` when there's nothing
 * to fill (the caller should skip the write).
 */
export function buildRangePatch(
  row: Partial<Record<SensorRangeField, unknown>> | null | undefined,
  generated: Partial<Record<SensorRangeField, unknown>> | null | undefined,
): Partial<Record<SensorRangeField, number>> {
  const patch: Partial<Record<SensorRangeField, number>> = {};
  if (!generated) return patch;
  for (const f of SENSOR_RANGE_FIELDS) {
    const existing = fin(row?.[f]);
    const gen = fin(generated[f]);
    if (existing == null && gen != null) patch[f] = gen;
  }
  return patch;
}

/** Filter to rows still needing a backfill, capped at `batchSize`. */
export function selectBackfillRows<T extends Partial<Record<SensorRangeField, unknown>>>(
  rows: T[],
  batchSize: number,
): T[] {
  return rows.filter(needsRangeBackfill).slice(0, Math.max(0, batchSize));
}
