// Pure date-math helpers extracted from PlantScheduleTab so the
// "Generate Tasks" modal can mock a trigger date without duplicating
// the existing seasonal-window logic.
//
// `buildBlueprintFromSchedule` computes start_date + end_date for a
// task_blueprint from:
//   - A plant_schedules row (start_reference, offsets, frequency).
//   - A mocked trigger date (the date the user wants tasks to start
//     counting from — e.g. today if they've "planted" the plant
//     mentally but not yet placed it in an area).
//   - The plant's cycle (annual/biennial/perennial) for the absolute
//     end-of-life cap.

export interface PlantScheduleRow {
  id?: string;
  start_reference: string | null;
  start_offset_days: number | null;
  end_reference: string | null;
  end_offset_days: number | null;
  frequency_days: number;
}

export type RecurrenceKind = "once" | "annual" | "lifecycle_capped";

export interface BlueprintDates {
  /** ISO yyyy-mm-dd. null when the computed window is entirely in the past for a non-perennial. */
  start_date: string | null;
  /** ISO yyyy-mm-dd. null when end_reference = "Ongoing" and no cycle cap applies. */
  end_date: string | null;
  /** Track B — how the blueprint recurs across years, derived from the plant
   *  lifecycle: perennial → `annual` (repeats every year), biennial →
   *  `lifecycle_capped` (repeats until `recurs_until`), annual / unknown →
   *  `once`. Only actually recurs for windowed / seasonal (end_date) blueprints;
   *  inert on ongoing (no-end_date) routines. */
  recurrence_kind: RecurrenceKind;
  /** ISO yyyy-mm-dd terminal date for `lifecycle_capped`, else null. */
  recurs_until: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseSafeDate(d: string): number {
  return new Date(`${d}T12:00:00Z`).getTime();
}

// Calendar-year addition ("same date next year"), not +365 days — a span
// containing 29 Feb landed the rolled date one day early.
function addYears(ms: number, years: number): number {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.getTime();
}

function formatSafeDate(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

// The user's LOCAL calendar date. Inlined (not imported from taskEngine)
// so this file stays a pure date-math module with no supabase dependency.
// The UTC date it replaced flips at the wrong wall-clock moment: a UTC+10
// user at 8am got a first task dated yesterday; a UTC-5 user at 11pm got
// the first occurrence pushed a full cycle late.
function localTodayStr(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Compute the start + end dates for a task_blueprint generated from
 * a plant_schedules row, mocking the trigger event with `triggerDateStr`.
 *
 * Mirrors the legacy `getDatesForBlueprint` in PlantScheduleTab — kept
 * in lockstep so existing "Apply to existing plants" and "Auto-Generate"
 * flows still produce identical results.
 */
export function buildBlueprintFromSchedule(opts: {
  schedule: PlantScheduleRow;
  /** ISO yyyy-mm-dd — mocked trigger date. Today when the user just wants tasks now. */
  triggerDateStr: string;
  /** Plant lifecycle string ("Annual" / "Biennial" / "Perennial" / etc). */
  plantCycle: string | null;
  /** Year to compute seasonal references against. Usually current year. */
  targetYear: number;
}): BlueprintDates {
  const { schedule, triggerDateStr, plantCycle, targetYear } = opts;
  const startRef = schedule.start_reference;
  const startOffset = schedule.start_offset_days ?? 0;
  const endRef = schedule.end_reference;
  const endOffset = schedule.end_offset_days ?? 0;
  const freqDays = Math.max(1, schedule.frequency_days || 1);

  // ── Compute start date ────────────────────────────────────────────
  let startMs = parseSafeDate(triggerDateStr);
  if (startRef?.startsWith("Seasonal:")) {
    const mmdd = startRef.split(":")[1].trim();
    startMs = parseSafeDate(`${targetYear}-${mmdd}`);
  }
  startMs += startOffset * MS_PER_DAY;

  // ── Compute end date (if any) ─────────────────────────────────────
  let endMs: number | null = null;
  if (endRef && endRef !== "Ongoing") {
    endMs = parseSafeDate(triggerDateStr);
    if (endRef.startsWith("Seasonal:")) {
      const mmdd = endRef.split(":")[1].trim();
      endMs = parseSafeDate(`${targetYear}-${mmdd}`);

      // Roll the end forward a year if it'd otherwise be before start.
      if (startRef?.startsWith("Seasonal:") && endMs < startMs) {
        endMs = addYears(endMs, 1);
      }
    }
    endMs += endOffset * MS_PER_DAY;
  }

  // ── Cycle-based absolute cap ──────────────────────────────────────
  // Annuals get 1 year of tasks; biennials get 2; perennials uncapped
  // (subject to end_date if explicitly set).
  let absoluteMaxEndMs: number | null = null;
  if (plantCycle) {
    const cycleStr = plantCycle.toLowerCase();
    const triggerMs = parseSafeDate(triggerDateStr);
    if (cycleStr.includes("annual") && !cycleStr.includes("perennial")) {
      absoluteMaxEndMs = addYears(triggerMs, 1);
    } else if (cycleStr.includes("biennial")) {
      absoluteMaxEndMs = addYears(triggerMs, 2);
    }
  }

  // Derive recurrence across YEARS from the plant lifecycle (Track B): perennial
  // → repeats every year; biennial → repeats until its 2-year cap; annual /
  // unknown → runs once. Only windowed / seasonal (end_date) blueprints actually
  // recur — this is inert on ongoing (no-end_date) routines.
  let recurrence_kind: RecurrenceKind = "once";
  let recurs_until: string | null = null;
  if (plantCycle) {
    const cycleStr = plantCycle.toLowerCase();
    if (cycleStr.includes("perennial")) {
      recurrence_kind = "annual";
    } else if (cycleStr.includes("biennial")) {
      recurrence_kind = "lifecycle_capped";
      recurs_until = absoluteMaxEndMs !== null ? formatSafeDate(absoluteMaxEndMs) : null;
    }
    // "annual" (non-perennial) and unknown cycles stay 'once'.
  }

  if (absoluteMaxEndMs !== null) {
    if (endMs === null || endMs > absoluteMaxEndMs) {
      endMs = absoluteMaxEndMs;
    }
    if (startMs > absoluteMaxEndMs) {
      // Start is past the lifecycle cap — no tasks would ever fire.
      return { start_date: null, end_date: null, recurrence_kind, recurs_until };
    }
  }

  // ── Floor start to max(trigger date, today) ───────────────────────
  // For a mocked trigger date that's in the past, we still want the
  // first task to land TODAY rather than retroactively. Without this,
  // a "trigger date = last week" would generate tasks in the past.
  const triggerMs = parseSafeDate(triggerDateStr);
  const todayMs = parseSafeDate(localTodayStr());
  const floorMs = Math.max(triggerMs, todayMs);

  if (startMs < floorMs) {
    const freqMs = freqDays * MS_PER_DAY;
    const periods = Math.ceil((floorMs - startMs) / freqMs);
    startMs += periods * freqMs;
  }

  return {
    start_date: formatSafeDate(startMs),
    end_date: endMs !== null ? formatSafeDate(endMs) : null,
    recurrence_kind,
    recurs_until,
  };
}
