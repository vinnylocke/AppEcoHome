/**
 * Pure helpers for rendering the day(s) a weather alert spans.
 * "Today", "Tomorrow", "Mon–Wed", "Fri & Sat", "Tue, Thu" or "23 Jun".
 * No React, no side effects (unit-tested in tests/unit/lib/weatherDates.test.ts).
 */

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1); // local midnight → stable weekday regardless of tz
}

function dayDiff(a: Date, b: Date): number {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(ms / 86_400_000);
}

/** Relative label for a single date: Today / Tomorrow / weekday (this week) / "23 Jun". */
function relLabel(date: Date, now: Date): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Weekday/short-date label used for range endpoints (no Today/Tomorrow, for clean "Mon–Wed"). */
function endpointLabel(date: Date, now: Date): string {
  const diff = dayDiff(date, now);
  if (diff >= 0 && diff < 7) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Format a list of YYYY-MM-DD dates into a compact human label:
 * single → "Today"/"Tomorrow"/"Mon"/"23 Jun"; consecutive run → "Mon–Wed" (or "Mon & Tue");
 * disjoint → "Mon, Wed, Fri" (capped, "+N").
 */
export function formatDateRange(dates: string[], now: Date = new Date()): string {
  const valid = [...new Set((dates ?? []).filter(Boolean))].sort();
  if (valid.length === 0) return "";
  const parsed = valid.map(parseDate);
  if (parsed.length === 1) return relLabel(parsed[0], now);

  let consecutive = true;
  for (let i = 1; i < parsed.length; i++) {
    if (dayDiff(parsed[i], parsed[i - 1]) !== 1) { consecutive = false; break; }
  }
  if (consecutive) {
    const first = endpointLabel(parsed[0], now);
    const last = endpointLabel(parsed[parsed.length - 1], now);
    return parsed.length === 2 ? `${first} & ${last}` : `${first}–${last}`;
  }

  const labels = parsed.slice(0, 4).map((d) => endpointLabel(d, now));
  const extra = parsed.length - labels.length;
  return extra > 0 ? `${labels.join(", ")} +${extra}` : labels.join(", ");
}
