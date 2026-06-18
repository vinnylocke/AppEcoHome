// Helpers for the automation `date_range` condition leaf — a calendar window
// (month/day) that recurs every year. Pure + tested.

import { getSinglePeriodRange, getHemisphere, type Hemisphere } from "./seasonal";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Full month names for the month/day picker (index 0 = January). */
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type SeasonPreset = "spring" | "summer" | "autumn" | "winter";

/** Days in `month` (1–12). Uses a leap year so February allows 29. */
export function daysInMonth(month: number): number {
  if (month < 1 || month > 12) return 31;
  return new Date(2024, month, 0).getDate();
}

/** `"MM-DD"` → `{ month, day }` (1-based). Defaults to 1 Jan on bad input. */
export function splitMmDd(mmdd: string): { month: number; day: number } {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd ?? "");
  if (!m) return { month: 1, day: 1 };
  return { month: Number(m[1]), day: Number(m[2]) };
}

/** Build `"MM-DD"`, clamping month to 1–12 and day to that month's length. */
export function makeMmDd(month: number, day: number): string {
  const mo = Math.min(12, Math.max(1, Math.trunc(month) || 1));
  const d = Math.min(daysInMonth(mo), Math.max(1, Math.trunc(day) || 1));
  return `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

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
