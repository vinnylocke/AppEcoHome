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
