// Garden Brain Phase 2 — the Head Gardener briefing, pure core.
//
// Assembles every signal the app already produces into ONE ranked morning
// brief: items (capped, each with a reason + deep-link route), good news, and
// a deterministic template summary. The AI tier (Sage/Evergreen) REWRITES the
// summary/reasons in the head-gardener voice but can never add items — the
// deterministic assembly is the source of truth, which is what makes the
// brief hallucination-proof by construction.
//
// Pure: no network, no Date.now(); fully unit-testable in Deno.

import { personaInstruction, type Persona } from "./persona.ts";
import { projectAnnualWindows } from "./annualWindows.ts";

export interface BriefSignals {
  todayStr: string; // YYYY-MM-DD (home-local enough for a 04:30 UTC cron)
  overdueCount: number;
  dueTodayCount: number;
  /** Top overdue/today task titles for flavour (max 3 used). */
  topTaskTitles: string[];
  /** Open Phase-1 care proposals (id → one-tap apply from the brief). */
  careProposals: Array<{ id?: string; kind: string; headline: string; detail: string }>;
  /** Phase-3 photo `concern` observations from the last 24h. */
  photoFlags?: Array<{ observationId: string; plantName: string; findings: string }>;
  /** Fresh verifications (last 7 days). */
  verifications: Array<{ status: "verified_good" | "verified_mixed"; inRangePct?: number }>;
  /** in_range good-news records (area names). */
  onTrackAreas: string[];
  /** Active weather alerts whose window covers today. */
  weatherAlerts: Array<{ type: string; message: string }>;
  /** Harvest/pruning windows opening within 3 days or open now. */
  windows: Array<{ taskType: string; title: string; opensInDays: number }>;
  /** Automations that failed in the last 24h. */
  failedAutomations: Array<{ name: string }>;
  /** Devices under 20% battery. */
  lowBatteryDevices: Array<{ name: string; battery: number }>;
  /** New unread pattern insights (titles). */
  insightTitles: string[];
  /** Consecutive days (incl. yesterday) with ≥1 completion. */
  completionStreakDays: number;
}

/**
 * One-tap actions on brief items (user requirement 2026-07-10). Set ONLY by
 * this deterministic assembler — the AI rewrite reconstructs items from the
 * deterministic array, so `action` survives verbatim by construction and the
 * model can never author or alter one.
 */
export type BriefItemAction =
  | { type: "apply_care_adjustment"; adjustmentId: string; label: string }
  | { type: "open_photo_actions"; observationId: string; label: string };

export interface BriefItem {
  kind:
    | "overdue"
    | "care_proposal"
    | "photo_flag"
    | "weather"
    | "window"
    | "automation_failed"
    | "insight"
    | "battery";
  title: string;
  reason: string;
  route: string;
  score: number;
  action?: BriefItemAction;
}

export interface BriefPayload {
  summary: string;
  items: BriefItem[];
  goodNews: string[];
  stats: { overdue: number; dueToday: number; windowsOpen: number };
}

export const MAX_ITEMS = 6;

/**
 * Drop harvest/pruning window blueprints whose current-season window task is
 * already Completed or Skipped — so the brief stops nagging "{title} window is
 * open" once the user has finished (or missed) it. Pure + generic (keys only on
 * `id`) so the Deno tests can assert the filter without a DB.
 *
 * Year-scoping is the CALLER's job: `gatherSignals` builds `resolvedBlueprintIds`
 * from a query gated on `window_end_date >= today` (and `due_date <= today`), so
 * only THIS season's resolved window suppresses — last year's completed cycle
 * (window_end_date < today) never lands in the set, leaving next year's window
 * free to re-open. Mirrors the dashboard's Completed/Skipped ("DONE") suppression
 * in `_shared/dashboardStats.ts`.
 */
export function dropResolvedWindows<T extends { id: string }>(
  windows: T[],
  resolvedBlueprintIds: ReadonlySet<string>,
): T[] {
  if (resolvedBlueprintIds.size === 0) return windows;
  return windows.filter((w) => !resolvedBlueprintIds.has(w.id));
}

export interface WindowBlueprintInput {
  id: string;
  title: string;
  task_type: string;
  start_date: string;
  end_date: string;
  recurrence_kind?: string | null;
  recurs_until?: string | null;
}

/**
 * Build the brief's `windows` signal from a home's recurring window blueprints
 * (Track B, B3). Each blueprint is rolled into its CURRENT occurrence —
 * 'annual' / 'lifecycle_capped' via `projectAnnualWindows` (this year's window,
 * fixed boundaries); 'once' (default / legacy) uses the literal frozen window —
 * then kept only when that occurrence is open now or opening within the horizon
 * (`horizonStr`, = today + 3 days). Already-resolved windows are dropped first
 * (`dropResolvedWindows`), so a finished window stays gone THIS year while next
 * year's re-opens (its resolving task's window_end_date has aged out of the
 * resolved set). `opensInDays` is measured from the ROLLED start.
 *
 * Pure — strings in, objects out, no Date.now().
 */
export function buildWindowSignals(
  blueprints: WindowBlueprintInput[],
  resolvedBlueprintIds: ReadonlySet<string>,
  todayStr: string,
  horizonStr: string,
): Array<{ taskType: string; title: string; opensInDays: number }> {
  const dayMs = 86_400_000;
  return dropResolvedWindows(blueprints, resolvedBlueprintIds).flatMap((b) => {
    const start = String(b.start_date).slice(0, 10);
    const end = String(b.end_date).slice(0, 10);
    const recursAnnually = b.recurrence_kind === "annual" || b.recurrence_kind === "lifecycle_capped";
    const occStart: string | undefined = recursAnnually
      ? projectAnnualWindows(start, end, todayStr, horizonStr, todayStr, { recursUntil: b.recurs_until })[0]?.start
      : start <= horizonStr && end >= todayStr
        ? start
        : undefined;
    if (!occStart) return [];
    return [{
      taskType: b.task_type,
      title: b.title,
      opensInDays: Math.max(0, Math.ceil((Date.parse(`${occStart}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / dayMs)),
    }];
  });
}

/** Deterministic scoring table — the ranking IS the product decision. */
const SCORE = {
  overdue: 100,
  care_proposal: 90,
  photo_flag: 85, // a plant visibly struggling sits between care + weather
  weather: 80,
  window: 70,
  automation_failed: 65,
  insight: 50,
  battery: 40,
} as const;

export function assembleBrief(s: BriefSignals): BriefPayload {
  const items: BriefItem[] = [];

  if (s.overdueCount > 0) {
    items.push({
      kind: "overdue",
      title: s.overdueCount === 1 ? "1 task is overdue" : `${s.overdueCount} tasks are overdue`,
      reason: s.topTaskTitles.length
        ? `Oldest first: ${s.topTaskTitles.slice(0, 3).join(", ")}.`
        : "Clearing these first keeps the schedule honest.",
      route: "/calendar",
      score: SCORE.overdue,
    });
  }

  for (const p of s.careProposals) {
    items.push({
      kind: "care_proposal",
      title: p.headline,
      reason: p.detail,
      route: "/dashboard?view=home",
      score: SCORE.care_proposal,
      // One-tap apply straight from the brief (shared careAdjustments lib).
      ...(p.id ? { action: { type: "apply_care_adjustment" as const, adjustmentId: p.id, label: "Apply" } } : {}),
    });
  }

  for (const f of s.photoFlags ?? []) {
    items.push({
      kind: "photo_flag",
      title: `${f.plantName} looks like it needs attention`,
      reason: f.findings || "Spotted in your latest photo.",
      route: "/shed",
      score: SCORE.photo_flag,
      action: { type: "open_photo_actions", observationId: f.observationId, label: "See photo" },
    });
  }

  // weather_alerts rows are stored per (location, type) — a home with several
  // outdoor locations carries the same rule once per location. One item per type.
  const seenWeatherTypes = new Set<string>();
  for (const w of s.weatherAlerts) {
    if (seenWeatherTypes.has(w.type)) continue;
    seenWeatherTypes.add(w.type);
    items.push({
      kind: "weather",
      title: w.message,
      reason: "Active weather alert for today.",
      route: "/calendar?tab=weather",
      score: SCORE.weather,
    });
  }

  for (const win of s.windows) {
    items.push({
      kind: "window",
      title: win.opensInDays <= 0
        ? `${win.title} window is open`
        : `${win.title} window opens in ${win.opensInDays} day${win.opensInDays === 1 ? "" : "s"}`,
      reason: win.taskType === "Harvesting"
        ? "Pick across the window — log a partial harvest any time."
        : "One window task covers the whole period.",
      route: "/calendar",
      score: SCORE.window,
    });
  }

  for (const a of s.failedAutomations) {
    items.push({
      kind: "automation_failed",
      title: `Automation "${a.name}" failed in the last 24h`,
      reason: "Its actions may not have run — check the device and re-run if needed.",
      route: "/integrations",
      score: SCORE.automation_failed,
    });
  }

  for (const t of s.insightTitles) {
    items.push({
      kind: "insight",
      title: t,
      reason: "Spotted by the pattern engine.",
      route: "/insights",
      score: SCORE.insight,
    });
  }

  for (const d of s.lowBatteryDevices) {
    items.push({
      kind: "battery",
      title: `${d.name} battery at ${d.battery}%`,
      reason: "A dead sensor is a blind bed — swap it soon.",
      route: "/integrations",
      score: SCORE.battery,
    });
  }

  items.sort((a, b) => b.score - a.score);
  const capped = items.slice(0, MAX_ITEMS);

  // ── Good news (0–2 lines; calm, real, earned). ─────────────────────────────
  const goodNews: string[] = [];
  const good = s.verifications.filter((v) => v.status === "verified_good");
  if (good.length > 0) {
    const pct = good[0].inRangePct;
    goodNews.push(
      `A schedule change you applied is working${typeof pct === "number" ? ` — soil in range ${Math.round(pct)}% of the time since` : ""}.`,
    );
  }
  if (s.onTrackAreas.length > 0 && goodNews.length < 2) {
    goodNews.push(
      s.onTrackAreas.length === 1
        ? `${s.onTrackAreas[0]} is on track — soil stayed in its comfort range.`
        : `${s.onTrackAreas.slice(0, 2).join(" and ")} are on track.`,
    );
  }
  if (s.completionStreakDays >= 3 && goodNews.length < 2) {
    goodNews.push(`${s.completionStreakDays}-day completion streak — keep it rolling.`);
  }

  const windowsOpen = s.windows.filter((w) => w.opensInDays <= 0).length;
  return {
    summary: buildDeterministicSummary(s, capped, goodNews),
    items: capped,
    goodNews: goodNews.slice(0, 2),
    stats: { overdue: s.overdueCount, dueToday: s.dueTodayCount, windowsOpen },
  };
}

/** Template voice for the non-AI tiers — plain, specific, no fluff. */
export function buildDeterministicSummary(
  s: BriefSignals,
  items: BriefItem[],
  goodNews: string[],
): string {
  const parts: string[] = [];
  if (s.dueTodayCount === 0 && s.overdueCount === 0) {
    parts.push("Nothing is due today.");
  } else {
    const bits: string[] = [];
    if (s.dueTodayCount > 0) bits.push(`${s.dueTodayCount} task${s.dueTodayCount === 1 ? "" : "s"} due today`);
    if (s.overdueCount > 0) bits.push(`${s.overdueCount} overdue`);
    parts.push(`You have ${bits.join(" and ")}.`);
  }
  const top = items.find((i) => i.kind !== "overdue");
  if (top) parts.push(`Worth a look: ${top.title.toLowerCase().replace(/\.$/, "")}.`);
  if (goodNews.length > 0) parts.push(goodNews[0]);
  return parts.slice(0, 3).join(" ");
}

// ─── AI-voice system prompt (Sage/Evergreen rewrite) ─────────────────────────

/**
 * System prompt for generate-daily-brief's AI-voice rewrite. Pure and exported
 * so the Deno tests can assert the prompt contract without a live Gemini call.
 *
 * Summary contract (home-redesign Stage 3): the homepage hero owns the raw
 * numbers (today count, overdue count, weather), so the brief's narrative must
 * lead with insight/advice/priorities and never recite those counts back.
 *
 * Persona: two-way collapse — docs/plans/home-redesign-two-postures.md §6
 * decision (b): the server adopts the client's `effectivePersona()` semantics,
 * so a null persona (never asked) reads as "new" (the friendly, guided tone)
 * and only an explicit "experienced" gets the terser voice. The collapse is
 * applied HERE, at the daily brief's own call site — `_shared/persona.ts`
 * keeps its three-way (null ⇒ balanced) behaviour for every other function.
 */
export function buildBriefVoicePrompt(opts: {
  persona: Persona;
  goalsLine?: string;
  feedback?: string | null;
}): string {
  const collapsed: Persona = opts.persona === "experienced" ? "experienced" : "new";
  return [
    "You are Rhozly's head gardener writing the morning Daily Brief.",
    personaInstruction(collapsed),
    "Rewrite the provided brief in your head-gardener voice.",
    "Rules: never invent, add, remove or reorder items; keep every number in item titles and reasons exactly; 2–3 sentence summary; each reason ≤ 160 chars.",
    "SUMMARY rules — the homepage hero beside this brief already shows today's task count, the overdue count and the weather:",
    '- Do NOT restate those raw counts or weather readings. Never recite "you have N tasks today", "N overdue" or "the weather is X°" — those numbers are already on screen.',
    "- Lead with insight, advice and priorities: what to do first and why, what changed, what deserves a look.",
    '- Mention a number ONLY when it carries the advice itself (e.g. "water the 3 thirstiest beds before the heat").',
    "- Recompose the summary from the items and good news rather than parroting the deterministic count sentence; never state a fact that is not in the brief.",
    opts.goalsLine || "",
    opts.feedback ? `The gardener's feedback on previous briefs (honour it): ${opts.feedback}` : "",
    'Return STRICT JSON: {"summary": string, "items": [{"title": string, "reason": string}]} with items in the SAME order and count as given.',
  ].filter(Boolean).join("\n");
}

/**
 * Prepend the brief's first sentence to the daily digest body.
 * Absent/blank brief → the body is returned UNCHANGED (the digest must never
 * regress because the brief didn't generate).
 */
export function prependBriefToDigest(digestBody: string, briefSummary: string | null | undefined): string {
  const first = (briefSummary ?? "").split(/(?<=\.)\s+/)[0]?.trim();
  if (!first) return digestBody;
  return `${first} ${digestBody}`;
}
