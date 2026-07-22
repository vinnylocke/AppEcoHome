import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  assembleBrief,
  buildBriefVoicePrompt,
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

Deno.test("DB-002b: weather items dedupe by alert type (per-location rows collapse to one)", () => {
  const { items } = assembleBrief(signals({
    weatherAlerts: [
      { type: "heat", message: "Hot days ahead — up to 29°C." },
      { type: "heat", message: "Hot days ahead — up to 29°C." },
      { type: "wind", message: "Strong wind tomorrow." },
    ],
  }));
  const weather = items.filter((i) => i.kind === "weather");
  assertEquals(weather.length, 2);
  assertEquals(weather.map((w) => w.title), [
    "Hot days ahead — up to 29°C.",
    "Strong wind tomorrow.",
  ]);
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

// ─── Phase 3 — photo flags + one-tap actions ─────────────────────────────────

Deno.test("DB-012: photo_flag ranks between care_proposal and weather", () => {
  const { items } = assembleBrief(signals({
    careProposals: [{ kind: "tighten_watering", headline: "Bed A dries fast", detail: "…" }],
    photoFlags: [{ observationId: "obs-1", plantName: "Sungold Tomato", findings: "Lower leaves yellowing." }],
    weatherAlerts: [{ type: "heat", message: "Heatwave ahead." }],
  }));
  assertEquals(items.map((i) => i.kind), ["care_proposal", "photo_flag", "weather"]);
});

Deno.test("DB-013: photo_flag carries the plant name, findings, and an open_photo_actions action", () => {
  const { items } = assembleBrief(signals({
    photoFlags: [{ observationId: "obs-9", plantName: "Rosemary", findings: "White dust on leaves." }],
  }));
  const flag = items.find((i) => i.kind === "photo_flag")!;
  assertStringIncludes(flag.title, "Rosemary");
  assertEquals(flag.reason, "White dust on leaves.");
  assertEquals(flag.action, { type: "open_photo_actions", observationId: "obs-9", label: "See photo" });
});

Deno.test("DB-014: care proposals with an id carry apply_care_adjustment; without an id, no action", () => {
  const { items } = assembleBrief(signals({
    careProposals: [
      { id: "adj-1", kind: "tighten_watering", headline: "Bed A dries fast", detail: "d" },
      { kind: "stress_risk", headline: "Heat risk", detail: "d" },
    ],
  }));
  const [withId, withoutId] = items.filter((i) => i.kind === "care_proposal");
  assertEquals(withId.action, { type: "apply_care_adjustment", adjustmentId: "adj-1", label: "Apply" });
  assertEquals(withoutId.action, undefined);
});

Deno.test("DB-015: photoFlags absent (undefined) is safe — no items, no crash", () => {
  const { items } = assembleBrief(signals({ overdueCount: 1 }));
  assertEquals(items.some((i) => i.kind === "photo_flag"), false);
});

// ─── AI-voice prompt contract (home redesign Stage 3 — The Brief) ────────────

Deno.test("DB-016: AI-voice prompt forbids restating the hero's raw counts and leads with advice", () => {
  const prompt = buildBriefVoicePrompt({ persona: null });
  // The hero owns the raw numbers — the narrative must not recite them.
  assertStringIncludes(prompt, "already shows today's task count, the overdue count and the weather");
  assertStringIncludes(prompt, 'Never recite "you have N tasks today", "N overdue" or "the weather is X°"');
  assertStringIncludes(prompt, "already on screen");
  assertStringIncludes(prompt, "Lead with insight, advice and priorities");
  // Numbers are allowed only when they carry the advice itself.
  assertStringIncludes(prompt, 'Mention a number ONLY when it carries the advice itself (e.g. "water the 3 thirstiest beds before the heat")');
});

Deno.test("DB-017: AI-voice prompt keeps the strict JSON output shape unchanged", () => {
  const prompt = buildBriefVoicePrompt({ persona: "experienced" });
  assertStringIncludes(prompt, 'Return STRICT JSON: {"summary": string, "items": [{"title": string, "reason": string}]}');
  assertStringIncludes(prompt, "SAME order and count as given");
  // Anti-hallucination guard survives the re-prompt.
  assertStringIncludes(prompt, "never invent, add, remove or reorder items");
});

Deno.test("DB-018: null persona collapses to the same guided tone as 'new' (two-way collapse, plan §6b)", () => {
  const nullPrompt = buildBriefVoicePrompt({ persona: null });
  const newPrompt = buildBriefVoicePrompt({ persona: "new" });
  assertEquals(nullPrompt, newPrompt);
  // Guided/beginner audience — NOT the legacy three-way "balanced" middle ground.
  assertStringIncludes(nullPrompt, "beginner gardener");
  assertEquals(nullPrompt.includes("general gardener"), false);
  // Explicit "experienced" still gets the terser voice.
  const expPrompt = buildBriefVoicePrompt({ persona: "experienced" });
  assertStringIncludes(expPrompt, "experienced gardener");
  assertEquals(expPrompt === newPrompt, false);
});

Deno.test("DB-019: goals line and regenerate feedback still thread into the prompt", () => {
  const prompt = buildBriefVoicePrompt({
    persona: null,
    goalsLine: "The home's stated goals: grow_your_own, attract_wildlife.",
    feedback: "Shorter, punchier briefs please",
  });
  assertStringIncludes(prompt, "The home's stated goals: grow_your_own, attract_wildlife.");
  assertStringIncludes(prompt, "The gardener's feedback on previous briefs (honour it): Shorter, punchier briefs please");
  // Absent goals/feedback leave no dangling lines behind.
  const bare = buildBriefVoicePrompt({ persona: null });
  assertEquals(bare.includes("stated goals"), false);
  assertEquals(bare.includes("feedback on previous briefs"), false);
});
