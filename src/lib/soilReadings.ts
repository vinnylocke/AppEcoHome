// Area soil-reading chips — turns the denormalised `latest_soil_*` columns on
// an `areas` row into a small, ordered list of display chips for the Location
// Manager area tile (owner request 2026-07-23: surface the current reading on
// the tile instead of making the user open Advanced Metrics). Pure + testable;
// the component only maps over the result.
//
// The `latest_soil_*` columns are maintained by the integrations ingest path
// (Ecowitt soil sensor → device_readings → area rollup); see gardenWalk.ts for
// the other consumer. A reading older than 24h is flagged `stale` so the tile
// can grey it out rather than implying it is live.

export type SoilMetricKey = "moisture" | "temp" | "ec";

export interface SoilReadingChip {
  key: SoilMetricKey;
  icon: string;
  /** Human-readable value, e.g. "45%", "18.5°C", "1240 µS/cm". */
  label: string;
  /** ISO timestamp of the reading, or null if unknown. */
  recordedAt: string | null;
  /** True when the reading is missing a timestamp or is older than 24h. */
  stale: boolean;
}

export interface AreaSoilInput {
  latest_soil_moisture_pct?: number | null;
  latest_soil_moisture_recorded_at?: string | null;
  latest_soil_temp_c?: number | null;
  latest_soil_temp_recorded_at?: string | null;
  latest_soil_ec?: number | null;
  latest_soil_ec_recorded_at?: string | null;
}

/** A reading older than this (or with no timestamp) renders greyed as stale. */
export const SOIL_READING_STALE_MS = 24 * 60 * 60 * 1000;

function isStale(recordedAt: string | null | undefined, now: number): boolean {
  if (!recordedAt) return true;
  const t = new Date(recordedAt).getTime();
  return Number.isNaN(t) || now - t > SOIL_READING_STALE_MS;
}

/**
 * Build the ordered soil-reading chips for an area. Only metrics with a present
 * value produce a chip, so an area with no sensor yields an empty array.
 */
export function buildSoilChips(area: AreaSoilInput, now: number = Date.now()): SoilReadingChip[] {
  const chips: SoilReadingChip[] = [];

  if (area.latest_soil_moisture_pct != null) {
    chips.push({
      key: "moisture",
      icon: "💧",
      label: `${Math.round(area.latest_soil_moisture_pct)}%`,
      recordedAt: area.latest_soil_moisture_recorded_at ?? null,
      stale: isStale(area.latest_soil_moisture_recorded_at, now),
    });
  }

  if (area.latest_soil_temp_c != null) {
    chips.push({
      key: "temp",
      icon: "🌡",
      label: `${area.latest_soil_temp_c.toFixed(1)}°C`,
      recordedAt: area.latest_soil_temp_recorded_at ?? null,
      stale: isStale(area.latest_soil_temp_recorded_at, now),
    });
  }

  if (area.latest_soil_ec != null) {
    chips.push({
      key: "ec",
      icon: "⚡",
      label: `${Math.round(area.latest_soil_ec)} µS/cm`,
      recordedAt: area.latest_soil_ec_recorded_at ?? null,
      stale: isStale(area.latest_soil_ec_recorded_at, now),
    });
  }

  return chips;
}
