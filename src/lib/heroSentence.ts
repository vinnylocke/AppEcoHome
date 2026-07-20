import type { TodaySummary } from "./todaySummary";

/**
 * The home hero's voice — pure, deterministic composers for both postures
 * (docs/plans/home-redesign-two-postures.md, Stage 1).
 *
 * The Porch speaks ONE composed sentence that IS the status summary — no
 * chip row restating the same numbers. The Workbench speaks a terse tabular
 * console line of tappable segments. Both draw from the same inputs.
 *
 * Clause ladder (highest wins the sentence): frost tonight > severe weather
 * alert > overdue pile-up > rain incoming > today's tasks > praise/quiet.
 * A couple of defined pairings fold a second fact into the same sentence
 * ("3 tasks left before today's rain") — deliberately small and exhaustively
 * unit-tested rather than a general grammar engine.
 */

export interface HeroAlert {
  /** weather_alerts.type — "frost" | "wind" | "rain" | "heat" (open set). */
  type: string;
  severity: "info" | "warning" | "critical";
}

/** Short, sentence-ready labels per alert type (weather_alerts rows carry a
 *  long `message` — banner copy — and no short title). */
const ALERT_LABEL: Record<string, string> = {
  heat: "Hot day ahead",
  frost: "Frost warning",
  wind: "Wind warning",
  rain: "Heavy rain due",
};

function alertLabel(a: HeroAlert): string {
  return ALERT_LABEL[a.type] ?? "Weather warning";
}

export interface HeroInputs {
  todaySummary: TodaySummary;
  overdueCount: number;
  /** Tonight's minimum °C when at/below the frost threshold, else null. */
  frostMinC: number | null;
  /** Today's forecast precipitation sum (mm), else null when unknown. */
  rainTodayMm: number | null;
  /** Active weather alerts (banner-owned; the sentence may LEAD with one). */
  alerts: HeroAlert[];
}

/** Rain worth mentioning — aligned with the climate default (rain_water_mm=1):
 *  at/above this the garden is getting watered for free. */
export const RAIN_MENTION_MM = 1;

export function timeOfDayGreeting(now: Date, firstName: string | null): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return firstName ? `${part}, ${firstName}` : part;
}

function firstSevereAlert(alerts: HeroAlert[]): HeroAlert | null {
  return alerts.find((a) => a.severity === "warning" || a.severity === "critical") ?? null;
}

/** The Porch's one status sentence. */
export function composeHeroSentence(i: HeroInputs): string {
  const { todaySummary: t, overdueCount, frostMinC, rainTodayMm, alerts } = i;
  const severe = firstSevereAlert(alerts);
  const rainy = rainTodayMm !== null && rainTodayMm >= RAIN_MENTION_MM;

  // 1. Frost — the one garden emergency worth interrupting anything for.
  if (frostMinC !== null) {
    return `Frost tonight at ${Math.round(frostMinC)}° — cover anything tender before dark.`;
  }

  // 2. Severe weather alert — lead with it (the banner still owns the detail).
  if (severe) {
    return t.pending > 0
      ? `${alertLabel(severe)} — ${t.pending} ${t.pending === 1 ? "task" : "tasks"} still to do.`
      : `${alertLabel(severe)} — the garden's ready for it.`;
  }

  // 3. Overdue pile-up.
  if (overdueCount > 0) {
    return overdueCount === 1
      ? `1 task needs catching up — a quick win.`
      : `${overdueCount} tasks need catching up — start with the oldest.`;
  }

  // 4. Rain incoming (pairs with remaining tasks when there are any).
  if (rainy) {
    return t.pending > 0
      ? `${t.pending} ${t.pending === 1 ? "task" : "tasks"} left before today's rain.`
      : `Rain due today — the garden waters itself.`;
  }

  // 5. Today's tasks.
  if (t.pending > 0) {
    return `${t.pending} of ${t.total} ${t.total === 1 ? "task" : "tasks"} left today.`;
  }

  // 6. Praise / quiet.
  if (t.total > 0) {
    return `All ${t.total} ${t.total === 1 ? "task" : "tasks"} done — lovely work.`;
  }
  return "Nothing on the list — enjoy the garden.";
}

// ── The Workbench console line ──────────────────────────────────────────────

export interface ConsoleSegment {
  id: "tasks" | "overdue" | "weather" | "frost" | "sun";
  label: string;
  /** Deep-link target; null renders as plain text. */
  to: string | null;
  tone: "default" | "danger";
}

export interface ConsoleInputs extends HeroInputs {
  weatherNow: { tempC: number; description: string } | null;
  /** SunCalc times for the home, else null (no lat/lng). */
  sun: { goldenPM: Date; sunset: Date } | null;
  now: Date;
}

function formatClock(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** The Workbench's tabular segments — "4/12 today · 3 overdue · 24° clear ·
 *  golden hour 19:42". Each segment deep-links; zero-value segments drop. */
export function composeConsoleSegments(i: ConsoleInputs): ConsoleSegment[] {
  const segs: ConsoleSegment[] = [];
  const t = i.todaySummary;

  segs.push({
    id: "tasks",
    label: t.total === 0 ? "clear today" : `${t.done}/${t.total} today`,
    to: "/dashboard?view=calendar",
    tone: "default",
  });

  if (i.overdueCount > 0) {
    segs.push({
      id: "overdue",
      label: `${i.overdueCount} overdue`,
      to: "/dashboard?view=calendar",
      tone: "danger",
    });
  }

  if (i.weatherNow) {
    segs.push({
      id: "weather",
      label: `${Math.round(i.weatherNow.tempC)}° ${i.weatherNow.description.toLowerCase()}`,
      to: "/dashboard?view=weather",
      tone: "default",
    });
  }

  if (i.frostMinC !== null) {
    segs.push({
      id: "frost",
      label: `frost ${Math.round(i.frostMinC)}°`,
      to: "/dashboard?view=weather",
      tone: "danger",
    });
  }

  if (i.sun) {
    if (i.now < i.sun.goldenPM) {
      segs.push({ id: "sun", label: `golden hour ${formatClock(i.sun.goldenPM)}`, to: null, tone: "default" });
    } else if (i.now < i.sun.sunset) {
      segs.push({ id: "sun", label: `sunset ${formatClock(i.sun.sunset)}`, to: null, tone: "default" });
    }
  }

  return segs;
}

// ── Raw-weather extractors (kept here so the component stays declarative) ───

/** Frost threshold in °C — tonight's min at/below this earns the frost clause. */
export const FROST_THRESHOLD_C = 3;

/** Tonight's minimum when at/below the frost threshold. `rawWeather` is the
 *  Open-Meteo snapshot; daily.time entries are local-to-location dates. */
export function extractFrostMin(rawWeather: any, todayLocalDate: string): number | null {
  const times: string[] = rawWeather?.daily?.time ?? [];
  const mins: number[] = rawWeather?.daily?.temperature_2m_min ?? [];
  const idx = times.indexOf(todayLocalDate);
  if (idx === -1) return null;
  const min = mins[idx];
  return Number.isFinite(min) && min <= FROST_THRESHOLD_C ? min : null;
}

/** Today's precipitation sum (mm), else null when the snapshot lacks it. */
export function extractRainToday(rawWeather: any, todayLocalDate: string): number | null {
  const times: string[] = rawWeather?.daily?.time ?? [];
  const rain: number[] = rawWeather?.daily?.precipitation_sum ?? [];
  const idx = times.indexOf(todayLocalDate);
  if (idx === -1) return null;
  const mm = rain[idx];
  return Number.isFinite(mm) ? mm : null;
}

/** The Porch's quiet proof-of-life micro-line: "Golden hour 19:42 · sunset
 *  21:32" while the sun is still up, else null (the line simply hides). */
export function formatSunMicroLine(
  sun: { goldenPM: Date; sunset: Date } | null,
  now: Date,
): string | null {
  if (!sun) return null;
  if (now < sun.goldenPM) {
    return `Golden hour ${formatClock(sun.goldenPM)} · sunset ${formatClock(sun.sunset)}`;
  }
  if (now < sun.sunset) {
    return `Golden hour now · sunset ${formatClock(sun.sunset)}`;
  }
  return null;
}
