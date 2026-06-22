/**
 * Climate-aware heat threshold (°C) for the Garden Intelligence weather panel.
 *
 * MIRROR of the server source of truth in
 * `supabase/functions/_shared/climateZones.ts` (`heatThresholdForClimate`) —
 * keep the two in sync. A flat threshold over-alerts cool climates, so it scales
 * with the local climate; any UK home uses the Met Office heatwave baseline of
 * 25°C regardless of zone (the latitude bands split the UK across cool_temperate
 * and continental).
 */
const HEAT_THRESHOLDS: Record<string, number> = {
  tropical: 36,
  subtropical: 34,
  mediterranean: 32,
  warm_temperate: 30,
  cool_temperate: 28,
  continental: 28,
  subarctic: 26,
  arctic: 25,
};

const UK_COUNTRY_NAMES = new Set([
  "united kingdom", "uk", "gb", "gbr", "great britain",
  "england", "scotland", "wales", "northern ireland",
]);
const UK_HEAT_THRESHOLD = 25;

export function heatThresholdForClimate(
  zone: string | null | undefined,
  country?: string | null,
): number {
  if (country && UK_COUNTRY_NAMES.has(country.trim().toLowerCase())) return UK_HEAT_THRESHOLD;
  return HEAT_THRESHOLDS[(zone ?? "").trim().toLowerCase()] ?? 28;
}
