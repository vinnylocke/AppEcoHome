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

export interface BriefSignals {
  todayStr: string; // YYYY-MM-DD (home-local enough for a 04:30 UTC cron)
  overdueCount: number;
  dueTodayCount: number;
  /** Top overdue/today task titles for flavour (max 3 used). */
  topTaskTitles: string[];
  /** Open Phase-1 care proposals. */
  careProposals: Array<{ kind: string; headline: string; detail: string }>;
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

export interface BriefItem {
  kind:
    | "overdue"
    | "care_proposal"
    | "weather"
    | "window"
    | "automation_failed"
    | "insight"
    | "battery";
  title: string;
  reason: string;
  route: string;
  score: number;
}

export interface BriefPayload {
  summary: string;
  items: BriefItem[];
  goodNews: string[];
  stats: { overdue: number; dueToday: number; windowsOpen: number };
}

export const MAX_ITEMS = 6;

/** Deterministic scoring table — the ranking IS the product decision. */
const SCORE = {
  overdue: 100,
  care_proposal: 90,
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
      route: "/dashboard?view=calendar",
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
    });
  }

  for (const w of s.weatherAlerts) {
    items.push({
      kind: "weather",
      title: w.message,
      reason: "Active weather alert for today.",
      route: "/dashboard?view=weather",
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
      route: "/dashboard?view=calendar",
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
