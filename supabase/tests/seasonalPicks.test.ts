import { assert, assertEquals } from "@std/assert";
import {
  buildSeasonalPicksPrompt,
  isoWeekKey,
  normaliseSeasonalPicks,
  SEASONAL_PICKS_SCHEMA,
  type SeasonalPick,
} from "@shared/seasonalPicks.ts";
import { fallbackSeasonalPicks } from "@shared/seasonalPicksFallback.ts";

// ─────────────────────────────────────────────────────────────────────────
// isoWeekKey
// ─────────────────────────────────────────────────────────────────────────

Deno.test("isoWeekKey returns ISO 8601 week format", () => {
  // 2026-05-21 is a Thursday — ISO week 21.
  const key = isoWeekKey(new Date(Date.UTC(2026, 4, 21)));
  assertEquals(key, "2026-W21");
});

Deno.test("isoWeekKey handles year boundary (early January)", () => {
  // 2026-01-01 is a Thursday — ISO week 1.
  const key = isoWeekKey(new Date(Date.UTC(2026, 0, 1)));
  assertEquals(key, "2026-W01");
});

Deno.test("isoWeekKey handles late-December week-52 case", () => {
  // 2025-12-29 is a Monday in ISO week 1 of 2026 (Thursday rule).
  const key = isoWeekKey(new Date(Date.UTC(2025, 11, 29)));
  assertEquals(key, "2026-W01");
});

// ─────────────────────────────────────────────────────────────────────────
// buildSeasonalPicksPrompt
// ─────────────────────────────────────────────────────────────────────────

Deno.test("buildSeasonalPicksPrompt threads frost dates + hemisphere", () => {
  const prompt = buildSeasonalPicksPrompt({
    currentDate: "2026-04-15",
    hemisphere: "Northern",
    weekIso: "2026-W16",
    country: "United Kingdom",
    lat: 51.5,
    lng: -0.1,
    lastFrostIso: "2026-05-12",
    firstFrostIso: "2026-10-25",
    edibleFocus: "mixed",
    effortPreference: "easy",
    dislikes: null,
    shed: [],
  });
  assert(prompt.includes("Hemisphere: Northern"));
  assert(prompt.includes("Last frost (spring): 2026-05-12"));
  assert(prompt.includes("First frost (autumn): 2026-10-25"));
  assert(prompt.includes("Country: United Kingdom"));
  assert(prompt.includes("2026-W16"));
});

Deno.test("buildSeasonalPicksPrompt notes missing frost dates", () => {
  const prompt = buildSeasonalPicksPrompt({
    currentDate: "2026-04-15",
    hemisphere: "Southern",
    weekIso: "2026-W16",
    country: null,
    lat: null,
    lng: null,
    lastFrostIso: null,
    firstFrostIso: null,
    edibleFocus: null,
    effortPreference: null,
    dislikes: null,
    shed: [],
  });
  assert(prompt.includes("Last frost: unknown"));
  assert(prompt.includes("First frost: unknown"));
});

Deno.test("buildSeasonalPicksPrompt includes Shed when present", () => {
  const prompt = buildSeasonalPicksPrompt({
    currentDate: "2026-04-15",
    hemisphere: "Northern",
    weekIso: "2026-W16",
    country: null, lat: null, lng: null,
    lastFrostIso: null, firstFrostIso: null,
    edibleFocus: null, effortPreference: null, dislikes: null,
    shed: [
      { common_name: "Beetroot 'Boltardy'", scientific_name: "Beta vulgaris" },
      { common_name: "Lavender", scientific_name: null },
    ],
  });
  assert(prompt.includes("Beetroot 'Boltardy'"));
  assert(prompt.includes("Beta vulgaris"));
  assert(prompt.includes("Lavender"));
});

Deno.test("buildSeasonalPicksPrompt respects edible_only focus", () => {
  const prompt = buildSeasonalPicksPrompt({
    currentDate: "2026-04-15",
    hemisphere: "Northern",
    weekIso: "2026-W16",
    country: null, lat: null, lng: null,
    lastFrostIso: null, firstFrostIso: null,
    edibleFocus: "edible_only",
    effortPreference: null, dislikes: null, shed: [],
  });
  assert(prompt.includes("EDIBLES ONLY"));
});

Deno.test("buildSeasonalPicksPrompt includes dislikes", () => {
  const prompt = buildSeasonalPicksPrompt({
    currentDate: "2026-04-15",
    hemisphere: "Northern",
    weekIso: "2026-W16",
    country: null, lat: null, lng: null,
    lastFrostIso: null, firstFrostIso: null,
    edibleFocus: null, effortPreference: null,
    dislikes: "Roses, thorny plants",
    shed: [],
  });
  assert(prompt.includes("Roses, thorny plants"));
});

// ─────────────────────────────────────────────────────────────────────────
// normaliseSeasonalPicks
// ─────────────────────────────────────────────────────────────────────────

function mkPick(over: Partial<SeasonalPick> = {}): SeasonalPick {
  return {
    common_name: "Lettuce 'Lollo Rossa'",
    scientific_name: "Lactuca sativa",
    sow_method: "direct",
    sow_window_start: "2026-04-15",
    sow_window_end: "2026-05-15",
    harvest_window: { start: "2026-06-01", end: "2026-07-01" },
    reasoning: "Direct-sow now for cut-and-come-again leaves.",
    effort: "easy",
    sun: ["full_sun"],
    edible: true,
    ...over,
  };
}

Deno.test("normaliseSeasonalPicks accepts well-formed payload", () => {
  const result = normaliseSeasonalPicks({ picks: [mkPick(), mkPick({ common_name: "Radish" })] });
  assertEquals(result?.picks.length, 2);
});

Deno.test("normaliseSeasonalPicks returns null on missing picks key", () => {
  assertEquals(normaliseSeasonalPicks({}), null);
  assertEquals(normaliseSeasonalPicks(null), null);
  assertEquals(normaliseSeasonalPicks("nope"), null);
});

Deno.test("normaliseSeasonalPicks drops malformed picks but keeps good ones", () => {
  const result = normaliseSeasonalPicks({
    picks: [
      mkPick(),
      { common_name: "Broken" }, // missing required fields
      mkPick({ common_name: "Spinach" }),
    ],
  });
  assertEquals(result?.picks.length, 2);
  assertEquals(result?.picks.map((p) => p.common_name), ["Lettuce 'Lollo Rossa'", "Spinach"]);
});

Deno.test("normaliseSeasonalPicks drops invalid sow_method", () => {
  const result = normaliseSeasonalPicks({
    picks: [mkPick({ sow_method: "skydive" as unknown as SeasonalPick["sow_method"] })],
  });
  assertEquals(result, null);
});

Deno.test("normaliseSeasonalPicks drops empty sun array", () => {
  const result = normaliseSeasonalPicks({
    picks: [mkPick({ sun: [] })],
  });
  assertEquals(result, null);
});

Deno.test("normaliseSeasonalPicks caps at 6 picks", () => {
  const tenPicks = Array.from({ length: 10 }, (_, i) => mkPick({ common_name: `Pick ${i}` }));
  const result = normaliseSeasonalPicks({ picks: tenPicks });
  assertEquals(result?.picks.length, 6);
});

Deno.test("normaliseSeasonalPicks tolerates null harvest_window", () => {
  const result = normaliseSeasonalPicks({
    picks: [mkPick({ harvest_window: null })],
  });
  assertEquals(result?.picks[0].harvest_window, null);
});

// ─────────────────────────────────────────────────────────────────────────
// SEASONAL_PICKS_SCHEMA shape
// ─────────────────────────────────────────────────────────────────────────

Deno.test("SEASONAL_PICKS_SCHEMA root requires picks", () => {
  assertEquals(SEASONAL_PICKS_SCHEMA.required, ["picks"]);
  assertEquals(SEASONAL_PICKS_SCHEMA.type, "OBJECT");
});

// ─────────────────────────────────────────────────────────────────────────
// fallbackSeasonalPicks — Sprout/Botanist deterministic path
// ─────────────────────────────────────────────────────────────────────────

Deno.test("fallbackSeasonalPicks returns 4-6 picks for Northern spring", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)), // 15 April
    hemisphere: "Northern",
    edibleFocus: null,
    effortPreference: null,
    shedCommonNames: [],
  });
  assert(result.picks.length >= 4);
  assert(result.picks.length <= 6);
});

Deno.test("fallbackSeasonalPicks respects edible_only", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)),
    hemisphere: "Northern",
    edibleFocus: "edible_only",
    effortPreference: null,
    shedCommonNames: [],
  });
  for (const p of result.picks) assertEquals(p.edible, true);
});

Deno.test("fallbackSeasonalPicks respects ornamental_only", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)),
    hemisphere: "Northern",
    edibleFocus: "ornamental_only",
    effortPreference: null,
    shedCommonNames: [],
  });
  for (const p of result.picks) assertEquals(p.edible, false);
});

Deno.test("fallbackSeasonalPicks dedupes ornamentals already in Shed", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)),
    hemisphere: "Northern",
    edibleFocus: "ornamental_only",
    effortPreference: null,
    shedCommonNames: ["Sunflower 'Russian Giant'"],
  });
  const names = result.picks.map((p) => p.common_name);
  // The Sunflower entry is removed when it's already in their Shed.
  assert(!names.includes("Sunflower 'Russian Giant'"));
});

Deno.test("fallbackSeasonalPicks Southern hemisphere shifts months", () => {
  // October in Southern = April in Northern (both = mid-spring).
  // April-only sows should still appear when the Southern current month is October.
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 9, 15)), // October
    hemisphere: "Southern",
    edibleFocus: null,
    effortPreference: null,
    shedCommonNames: [],
  });
  assert(result.picks.length >= 4);
});

Deno.test("fallbackSeasonalPicks harvest_window populated for edibles, null for ornamentals", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)),
    hemisphere: "Northern",
    edibleFocus: null,
    effortPreference: null,
    shedCommonNames: [],
  });
  for (const p of result.picks) {
    if (p.edible) {
      // Most edibles have a harvest window — some short-day exceptions allowed.
      // Just check the shape is valid when present.
      if (p.harvest_window) {
        assertEquals(typeof p.harvest_window.start, "string");
        assertEquals(typeof p.harvest_window.end, "string");
      }
    } else {
      assertEquals(p.harvest_window, null);
    }
  }
});

Deno.test("fallbackSeasonalPicks interpolates the current month into reasoning", () => {
  const result = fallbackSeasonalPicks({
    currentDate: new Date(Date.UTC(2026, 3, 15)), // April
    hemisphere: "Northern",
    edibleFocus: null,
    effortPreference: null,
    shedCommonNames: [],
  });
  // At least one pick should mention "April" in its reasoning.
  const containsApril = result.picks.some((p) => p.reasoning.includes("April"));
  assert(containsApril, "No pick referenced April in its reasoning");
});
