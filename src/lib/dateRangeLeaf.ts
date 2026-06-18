// Helpers for the automation `date_range` condition leaf — a calendar window
// (month/day) that recurs every year. Pure + tested.

import { getSinglePeriodRange, getHemisphere, type Hemisphere } from "./seasonal";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type SeasonPreset = "spring" | "summer" | "autumn" | "winter";

/** `"MM-DD"` for a Date (local fields). */
export function mmddOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** `"MM-DD"` → `"9 Jan"`. Empty string for malformed input. */
export function formatMmDd(mmdd: string): string {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd ?? "");
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${day} ${MONTHS[month - 1]}`;
}

/** `"MM-DD"` → a `<input type="date">` value using a fixed leap year (so 29 Feb
 *  is selectable). The year is cosmetic — only the month/day are stored. */
export function mmddToInput(mmdd: string, year = 2024): string {
  return /^\d{2}-\d{2}$/.test(mmdd ?? "") ? `${year}-${mmdd}` : "";
}

/** `<input type="date">` value (`YYYY-MM-DD`) → `"MM-DD"`. Empty if malformed. */
export function inputToMmdd(value: string): string {
  const m = /^\d{4}-(\d{2}-\d{2})$/.exec(value ?? "");
  return m ? m[1] : "";
}

/** Season → `{ from, to }` MM-DD, hemisphere-aware (reuses the seasonal lib). */
export function seasonPreset(season: SeasonPreset, hemisphere: Hemisphere): { from: string; to: string } {
  const { start, end } = getSinglePeriodRange(season, hemisphere);
  return { from: start, to: end };
}

/** Best-effort hemisphere for a home — latitude sign first, else timezone. */
export function hemisphereForHome(home: { lat?: number | null; timezone?: string | null } | null | undefined): Hemisphere {
  if (home && typeof home.lat === "number") return home.lat < 0 ? "southern" : "northern";
  return getHemisphere(undefined, home?.timezone ?? undefined);
}
