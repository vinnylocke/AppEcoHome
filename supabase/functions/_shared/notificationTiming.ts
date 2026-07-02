/**
 * Pure timing helpers for `daily-batch-notifications`, which now runs every
 * 15 min and fires each user's task digest at their chosen local `reminderTime`
 * + golden hour near each home's actual sunset (instead of one 08:00 UTC batch).
 * No Deno/DB — unit-tested in isolation.
 */

/** Minutes-of-day (0–1439) for `now` interpreted in IANA `tz`. */
export function localMinutesOfDay(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  let h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (h === 24) h = 0;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** YYYY-MM-DD for `now` interpreted in IANA `tz` (en-CA gives ISO order). */
export function localDateInTz(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
  } catch {
    // Bad tz string — fall back to UTC.
    return now.toISOString().split("T")[0];
  }
}

function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return 8 * 60; // default 08:00 on a malformed value
  return (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
}

/**
 * Is the daily digest due now, for a `reminderTime` ("HH:MM" local) under a
 * cron of `tickMinutes` cadence? True for the first tick at/just-past the
 * reminder time (window `[target, target + tickMinutes)`), so it fires close to
 * the chosen time; the caller's once-per-day dedup prevents repeats. Pure.
 */
export function isReminderDue(localMinutes: number, reminderTime: string, tickMinutes = 15): boolean {
  const target = toMin(reminderTime);
  return localMinutes >= target && localMinutes < target + tickMinutes;
}

/**
 * Is `now` within the pre-sunset window `[sunset − leadMaxMin, sunset − leadMinMin]`
 * (default 30–75 min before sunset)? The ~45-min span guarantees a 15-min cron
 * lands at least one tick inside it. Pure.
 */
export function isNearSunset(now: Date, sunset: Date, leadMinMin = 30, leadMaxMin = 75): boolean {
  const mins = (sunset.getTime() - now.getTime()) / 60_000;
  return mins >= leadMinMin && mins <= leadMaxMin;
}
