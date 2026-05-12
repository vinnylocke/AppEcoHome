// ── USDA Plant Hardiness Zone ────────────────────────────────────────────────

/**
 * Zones are defined by average annual minimum winter temperature (°C).
 * Source: USDA 2023 Plant Hardiness Zone Map.
 */
const USDA_BANDS: Array<{ maxC: number; zone: number }> = [
  { maxC: -51.1, zone: 1  },
  { maxC: -45.6, zone: 2  },
  { maxC: -40.0, zone: 3  },
  { maxC: -34.4, zone: 4  },
  { maxC: -28.9, zone: 5  },
  { maxC: -23.3, zone: 6  },
  { maxC: -17.8, zone: 7  },
  { maxC: -12.2, zone: 8  },
  { maxC:  -6.7, zone: 9  },
  { maxC:  -1.1, zone: 10 },
  { maxC:   4.4, zone: 11 },
  { maxC:  10.0, zone: 12 },
];

/** Map an average annual minimum temperature (°C) to a USDA zone integer 1–13. */
export function tempCelsiusToUsdaZone(minTempC: number): number {
  for (const band of USDA_BANDS) {
    if (minTempC <= band.maxC) return band.zone;
  }
  return 13;
}

/**
 * Fetch the USDA hardiness zone for a lat/lng using 10 years of
 * Open-Meteo ERA5 daily minimum temperatures.
 * Returns the zone integer 1–13.
 * Throws on network error or empty response.
 */
export async function fetchUsdaHardinessZone(lat: number, lng: number): Promise<number> {
  const endYear = new Date().getFullYear() - 1; // last complete year
  const startYear = endYear - 9;                // 10-year window

  const params = new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lng.toFixed(4),
    start_date: `${startYear}-01-01`,
    end_date:   `${endYear}-12-31`,
    daily:      "temperature_2m_min",
    timezone:   "UTC",
  });

  const res = await fetch(`https://climate-api.open-meteo.com/v1/climate?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo Climate API error: ${res.status}`);
  const data = await res.json();

  const temps: (number | null)[] = data.daily?.temperature_2m_min ?? [];
  const times: string[]          = data.daily?.time ?? [];
  if (!temps.length) throw new Error("No climate data returned");

  // Average the coldest recorded day of each year (USDA methodology)
  const yearMins: Record<string, number> = {};
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i];
    if (t == null) continue;
    const yr = times[i].slice(0, 4);
    if (yearMins[yr] === undefined || t < yearMins[yr]) yearMins[yr] = t;
  }

  const mins = Object.values(yearMins);
  if (!mins.length) throw new Error("Could not derive annual minimums");

  const avgMin = mins.reduce((a, b) => a + b, 0) / mins.length;
  return tempCelsiusToUsdaZone(avgMin);
}

// ── Latitude-band → gardening climate zone lookup ────────────────────────────

/**
 * Latitude-band → gardening climate zone lookup.
 *
 * Returns approximate frost dates as MM-DD strings (null for frost-free zones).
 * Dates are for the Northern Hemisphere; swap 6 months for Southern.
 *
 * This is intentionally coarse — it gives the AI enough signal to give
 * hemisphere/season-appropriate advice without requiring a paid geocoding API.
 */

export type ClimateZone =
  | "tropical"
  | "subtropical"
  | "mediterranean"
  | "warm_temperate"
  | "cool_temperate"
  | "continental"
  | "subarctic"
  | "arctic";

export interface ClimateInfo {
  zone: ClimateZone;
  label: string;
  /** Northern Hemisphere first-frost month-day, e.g. "11-15". Null = frost-free. */
  frostFirstMD: string | null;
  /** Northern Hemisphere last-frost month-day, e.g. "03-15". Null = frost-free. */
  frostLastMD: string | null;
}

const BANDS: Array<{ maxAbs: number; info: ClimateInfo }> = [
  {
    maxAbs: 23.5,
    info: { zone: "tropical",       label: "Tropical",        frostFirstMD: null,    frostLastMD: null },
  },
  {
    maxAbs: 30,
    info: { zone: "subtropical",    label: "Subtropical",     frostFirstMD: null,    frostLastMD: null },
  },
  {
    maxAbs: 37,
    info: { zone: "mediterranean",  label: "Mediterranean",   frostFirstMD: "12-01", frostLastMD: "02-28" },
  },
  {
    maxAbs: 44,
    info: { zone: "warm_temperate", label: "Warm Temperate",  frostFirstMD: "11-01", frostLastMD: "04-01" },
  },
  {
    maxAbs: 52,
    info: { zone: "cool_temperate", label: "Cool Temperate",  frostFirstMD: "10-15", frostLastMD: "04-30" },
  },
  {
    maxAbs: 60,
    info: { zone: "continental",    label: "Continental",     frostFirstMD: "09-30", frostLastMD: "05-15" },
  },
  {
    maxAbs: 67,
    info: { zone: "subarctic",      label: "Subarctic",       frostFirstMD: "09-01", frostLastMD: "06-15" },
  },
  {
    maxAbs: 90,
    info: { zone: "arctic",         label: "Arctic",          frostFirstMD: "08-01", frostLastMD: "07-15" },
  },
];

/** Derive climate zone and approximate frost dates from a latitude value. */
export function deriveClimate(lat: number): ClimateInfo {
  const absLat = Math.abs(lat);
  for (const band of BANDS) {
    if (absLat <= band.maxAbs) return band.info;
  }
  return BANDS[BANDS.length - 1].info; // fallback: arctic
}

/**
 * Convert a Northern-Hemisphere MM-DD frost date to a Southern-Hemisphere equivalent
 * by adding 6 months and wrapping.
 */
export function southernFrostDate(nhMD: string): string {
  const [mm, dd] = nhMD.split("-").map(Number);
  const shMM = ((mm + 5) % 12) + 1; // +6 months, 1-based
  return `${String(shMM).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Return the frost first/last dates adjusted for hemisphere,
 * as full ISO date strings for the upcoming 12-month window.
 */
export function frostDatesForHome(
  lat: number,
  referenceYear: number = new Date().getFullYear(),
): { frostFirstDate: string | null; frostLastDate: string | null } {
  const info = deriveClimate(lat);
  if (!info.frostFirstMD || !info.frostLastMD) {
    return { frostFirstDate: null, frostLastDate: null };
  }

  const isSouthern = lat < 0;
  const firstMD  = isSouthern ? southernFrostDate(info.frostFirstMD) : info.frostFirstMD;
  const lastMD   = isSouthern ? southernFrostDate(info.frostLastMD)  : info.frostLastMD;

  return {
    frostFirstDate: `${referenceYear}-${firstMD}`,
    frostLastDate:  `${referenceYear}-${lastMD}`,
  };
}
