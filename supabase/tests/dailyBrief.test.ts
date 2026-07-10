import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  assembleBrief,
  buildDeterministicSummary,
  prependBriefToDigest,
  MAX_ITEMS,
  type BriefSignals,
} from "@shared/dailyBrief.ts";

function signals(over: Partial<BriefSignals> = {}): BriefSignals {
  return {
    todayStr: "2026-07-10",
    overdueCount: 0,
    dueTodayCount: 0,
    topTaskTitles: [],
    careProposals: [],
    verifications: [],
    onTrackAreas: [],
    weatherAlerts: [],
    windows: [],
    failedAutomations: [],
    lowBatteryDevices: [],
    insightTitles: [],
    completionStreakDays: 0,
    ...over,
  };
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

Deno.test("DB-001: items rank by the scoring table (overdue > care > weather > window > automation > insight > battery)", () => {
  const { items } = assembleBrief(signals({
    overdueCount: 2,
    lowBatteryDevices: [{ name: "Bed A sensor", battery: 12 }],
    insightTitles: ["You postpone pruning a lot"],
    failedAutomations: [{ name: "Morning water" }],
    windows: [{ taskType: "Harvesting", title: "Tomato harvest", opensInDays: 0 }],
    weatherAlerts: [{ type: "heat", message: "Heatwave ahead — up to 31°C." }],
    careProposals: [{ kind: "tighten_watering", headline: "Bed A dries fast", detail: "…" }],
  }));
  assertEquals(items.map((i) => i.kind), [
    "overdue", "care_proposal", "weather", "window", "automation_failed", "insight", "battery",
  ].slice(0, MAX_ITEMS));
});

Deno.test("DB-002: items are capped at MAX_ITEMS", () => {
  const { items } = assembleBrief(signals({
    overdueCount: 1,
    careProposals: [
      { kind: "a", headline: "1", detail: "" }, { kind: "b", headline: "2", detail: "" },
      { kind: "c", headline: "3", detail: "" },
    ],
    weatherAlerts: [{ type: "heat", message: "hot" }, { type: "wind", message: "windy" }],
    windows: [{ taskType: "Pruning", title: "Spring pruning", opensInDays: 2 }],
    insightTitles: ["i1", "i2"],
  }));
  assertEquals(items.length, MAX_ITEMS);
});

Deno.test("DB-003: every item carries a route (deep link) and a reason", () => {
  const { items } = assembleBrief(signals({
    overdueCount: 1, topTaskTitles: ["Water basil"],
    windows: [{ taskType: "Harvesting", title: "Tomato harvest", opensInDays: 2 }],
  }));
  for (const it of items) {
    assertEquals(typeof it.route, "string");
    assertEquals(it.route.startsWith("/"), true);
    assertEquals(it.reason.length > 0, true);
  }
  assertStringIncludes(items[0].reason, "Water basil");
});

// ─── Good news ───────────────────────────────────────────────────────────────

Deno.test("DB-004: good news assembles from verifications, on-track areas and streaks (max 2)", () => {
  const { goodNews } = assembleBrief(signals({
    verifications: [{ status: "verified_good", inRangePct: 93 }],
    onTrackAreas: ["Raised Bed A"],
    completionStreakDays: 5,
  }));
  assertEquals(goodNews.length, 2);
  assertStringIncludes(goodNews[0], "93%");
  assertStringIncludes(goodNews[1], "Raised Bed A");
});

Deno.test("DB-005: verified_mixed is NOT celebrated as good news", () => {
  const { goodNews } = assembleBrief(signals({
    verifications: [{ status: "verified_mixed", inRangePct: 60 }],
  }));
  assertEquals(goodNews.length, 0);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

Deno.test("DB-006: deterministic summary — calm day vs busy day", () => {
  const calm = assembleBrief(signals());
  assertStringIncludes(calm.summary, "Nothing is due today");

  const busy = assembleBrief(signals({ overdueCount: 2, dueTodayCount: 3 }));
  assertStringIncludes(busy.summary, "3 tasks due today");
  assertStringIncludes(busy.summary, "2 overdue");
});

Deno.test("DB-007: summary surfaces the top non-overdue item and the first good news", () => {
  const s = signals({
    dueTodayCount: 1,
    weatherAlerts: [{ type: "heat", message: "Heatwave ahead — up to 31°C" }],
    onTrackAreas: ["Greenhouse"],
  });
  const brief = assembleBrief(s);
  assertStringIncludes(brief.summary.toLowerCase(), "heatwave");
  assertStringIncludes(brief.summary, "Greenhouse");
});

// ─── Stats ───────────────────────────────────────────────────────────────────

Deno.test("DB-008: stats carry overdue / dueToday / open windows", () => {
  const { stats } = assembleBrief(signals({
    overdueCount: 2, dueTodayCount: 4,
    windows: [
      { taskType: "Harvesting", title: "T", opensInDays: 0 },
      { taskType: "Pruning", title: "P", opensInDays: 2 },
    ],
  }));
  assertEquals(stats, { overdue: 2, dueToday: 4, windowsOpen: 1 });
});

// ─── Digest prepend helper (daily-batch safety) ─────────────────────────────

Deno.test("DB-009: prependBriefToDigest prepends the FIRST sentence only", () => {
  const out = prependBriefToDigest("Your home has 3 tasks.", "You have 3 tasks due today. Worth a look: heatwave.");
  assertEquals(out, "You have 3 tasks due today. Your home has 3 tasks.");
});

Deno.test("DB-010: absent/blank brief leaves the digest body UNCHANGED", () => {
  assertEquals(prependBriefToDigest("Body.", null), "Body.");
  assertEquals(prependBriefToDigest("Body.", undefined), "Body.");
  assertEquals(prependBriefToDigest("Body.", "   "), "Body.");
});

// ─── Windows copy ────────────────────────────────────────────────────────────

Deno.test("DB-011: window items distinguish open-now vs opens-in-N-days", () => {
  const { items } = assembleBrief(signals({
    windows: [
      { taskType: "Harvesting", title: "Tomato harvest", opensInDays: 0 },
      { taskType: "Pruning", title: "Spring pruning", opensInDays: 3 },
    ],
  }));
  assertStringIncludes(items[0].title, "window is open");
  assertStringIncludes(items[1].title, "opens in 3 days");
});
