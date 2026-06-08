// ─── sunsetTime ────────────────────────────────────────────────────────────
//
// Tiny self-contained sunset calculator used by the daily-batch-
// notifications cron to compute "golden hour begins at X" lines per
// home. Uses NOAA's solar-position equations (good to a few minutes,
// which is fine for a human-readable "approx 7:42pm" notification).
//
// We deliberately don't pull in the heavier SunCalc / suncalc-ts
// libraries — Deno imports them at runtime cost and this cron must
// finish in <60s across the whole fleet.

const DEG = Math.PI / 180;

/** Returns local sunset time for a given date + lat/lng (signed degrees)
 *  as an ISO-8601 timestamp in UTC, or null when the sun never sets
 *  (polar circles in summer). */
export function sunsetUtc(date: Date, lat: number, lng: number): Date | null {
  const day = Math.floor(
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000,
  );

  // Approximate solar declination + equation of time (NOAA).
  const gamma = (2 * Math.PI / 365) * (day - 1);
  const decl =
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148  * Math.sin(3 * gamma);
  const eqtime =
    229.18 * (
      0.000075
      + 0.001868 * Math.cos(gamma)
      - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma)
      - 0.040849 * Math.sin(2 * gamma)
    );

  // ω = hour angle of sunset (radians). cos ω = (cos 90.833° − sin φ · sin δ) / (cos φ · cos δ)
  const cosHa =
    (Math.cos(90.833 * DEG) - Math.sin(lat * DEG) * Math.sin(decl))
    / (Math.cos(lat * DEG) * Math.cos(decl));
  if (cosHa < -1 || cosHa > 1) return null; // sun never sets / never rises today

  const ha = Math.acos(cosHa);
  // NOAA: sunset_utc = solar_noon + 4*ha, where solar_noon = 720 - 4*lng - eqtime.
  // Expands to 720 - 4*lng + 4*ha - eqtime, factored as 720 - 4*(lng - ha) - eqtime.
  // (Previously had `lng + ha` here, which computed sunrise and meant the
  // Golden Hour notification cron silently skipped every day for months.)
  const sunsetMinUtc = 720 - 4 * (lng - (ha / DEG)) - eqtime;
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCMinutes(Math.round(sunsetMinUtc));
  return result;
}

/** Friendly "7:42pm" formatted to the home's IANA timezone (best-effort).
 *  Falls back to "7:42 PM UTC" when the tz string is bad. */
export function formatSunsetLocal(sunset: Date, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz ?? "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(sunset).toLowerCase();
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(sunset).toLowerCase() + " utc";
  }
}
