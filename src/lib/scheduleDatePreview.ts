// Pure helper for the "next N occurrences" preview shown under the
// recurrence picker in AddTaskModal. Decoupled from the modal so it
// can be unit-tested without React.
//
// All maths is done in UTC to avoid DST gotchas — the consumer
// formats the resulting ISO strings via toLocaleDateString in the
// user's locale.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PreviewOptions {
  /** ISO yyyy-mm-dd — required. */
  startDate: string;
  /** Days between occurrences. Clamped to ≥1. */
  frequencyDays: number;
  /** How many occurrences to return. Defaults to 3. */
  count?: number;
  /** Optional ISO yyyy-mm-dd cap — occurrences past this are dropped. */
  endDate?: string | null;
}

export interface OccurrencePreview {
  /** ISO yyyy-mm-dd strings, in chronological order. */
  dates: string[];
  /** True when the end_date cap truncated the list before `count`. */
  truncatedByEndDate: boolean;
}

function isoToMs(iso: string): number | null {
  // Parse `yyyy-mm-dd` as a UTC midnight so we don't get tz-shifted dates.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.UTC(
    parseInt(iso.slice(0, 4), 10),
    parseInt(iso.slice(5, 7), 10) - 1,
    parseInt(iso.slice(8, 10), 10),
  );
  return Number.isFinite(ms) ? ms : null;
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

/**
 * Compute the next N occurrences of a recurring task. Returns dates
 * in ISO format starting from `startDate`. Always advances forward by
 * `frequencyDays` (clamped to at least 1).
 */
export function getNextOccurrences(opts: PreviewOptions): OccurrencePreview {
  const count = Math.max(1, opts.count ?? 3);
  const freq = Math.max(1, Math.floor(opts.frequencyDays || 1));
  const startMs = isoToMs(opts.startDate);
  if (startMs == null) return { dates: [], truncatedByEndDate: false };

  const endMs = opts.endDate ? isoToMs(opts.endDate) : null;

  const out: string[] = [];
  let cur = startMs;
  let truncatedByEndDate = false;
  for (let i = 0; i < count; i++) {
    if (endMs != null && cur > endMs) {
      truncatedByEndDate = true;
      break;
    }
    out.push(msToIso(cur));
    cur += freq * MS_PER_DAY;
  }
  return { dates: out, truncatedByEndDate };
}

/**
 * Helper to format the preview dates as a short, friendly string in
 * the user's locale. Falls back to bare ISO if Intl isn't available.
 */
export function formatPreviewLine(
  iso: string[],
  locale: string | undefined = undefined,
): string {
  try {
    return iso
      .map((d) => {
        const ms = isoToMs(d);
        if (ms == null) return d;
        return new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(new Date(ms));
      })
      .join(" · ");
  } catch {
    return iso.join(" · ");
  }
}
