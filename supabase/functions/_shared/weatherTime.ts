// Home-local time helpers for the weather snapshot.
//
// sync-weather requests Open-Meteo with `timezone: "auto"` and stores the full
// response in `weather_snapshots.data`, so the snapshot carries the home's
// `utc_offset_seconds`, and the daily/hourly `time` strings are LOCAL-naive
// (no zone suffix). Consumers that derived "today" from UTC (`new
// Date().toISOString()`) evaluated the WRONG calendar day for non-UTC homes —
// e.g. a US-Pacific home whose snapshot refreshed near the UTC-day boundary had
// rules read tomorrow's forecast as today's (bug-audit-2026-07-10 #6). These
// helpers derive the home-local date and convert local-naive stamps to real
// UTC instants, so weather logic lines up with the snapshot's own dates.

interface SnapshotOffset {
  utc_offset_seconds?: number;
}

/** The home's UTC offset in seconds. 0 when absent (old snapshots / UTC homes). */
export function snapshotOffsetSeconds(data: SnapshotOffset | null | undefined): number {
  const v = data?.utc_offset_seconds;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Home-local calendar date (YYYY-MM-DD) at instant `nowMs`, using the
 *  snapshot's offset. This is the date that lines up with the snapshot's own
 *  local-naive `daily.time` / `hourly.time` strings. */
export function localToday(data: SnapshotOffset | null | undefined, nowMs: number): string {
  return new Date(nowMs + snapshotOffsetSeconds(data) * 1000).toISOString().split("T")[0];
}

/** Convert an Open-Meteo local-naive timestamp ("2026-07-11T14:00" or
 *  "...T14:00:00") to the real UTC instant, given the home's offset. Returns
 *  null on unparseable input. Used to compare forecast hours against a real
 *  `now` (e.g. the automation rain-defer look-ahead window). */
export function localNaiveToUtc(localNaive: string, offsetSeconds: number): Date | null {
  let s = (localNaive ?? "").trim();
  if (!s) return null;
  // Add seconds if Open-Meteo omitted them (hourly stamps are "…THH:MM").
  if (/T\d\d:\d\d$/.test(s)) s += ":00";
  // Treat the wall-clock as UTC, then subtract the offset to recover the instant.
  const asIfUtcMs = Date.parse(`${s}Z`);
  if (Number.isNaN(asIfUtcMs)) return null;
  return new Date(asIfUtcMs - offsetSeconds * 1000);
}
