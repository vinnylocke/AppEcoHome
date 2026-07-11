import { assertEquals } from "@std/assert";
import {
  evaluateArea,
  targetBand,
  forecastMatchedRate,
  realityStats,
  inCooldown,
  verifyAdjustment,
  type AreaInput,
  type MoistureReading,
  type SoilProfileRow,
} from "@shared/adaptiveCare.ts";

const TODAY = "2026-07-10T03:45:00Z";

function profile(over: Partial<SoilProfileRow> = {}): SoilProfileRow {
  return {
    device_id: "dev-1",
    area_id: "area-1",
    drydown_rate_pct_per_day: 5,
    retention_class: "balanced",
    drydown_by_weather: [],
    watering_response: { rewetCount: 5, avgRewetJump: 25 },
    sample_segments: 5,
    confidence: 0.8,
    ...over,
  };
}

/** Readings over `days` days: sawtooth from peak down at ratePerDay, rewet at
 *  every `waterEvery` days. One reading/day for simplicity. */
function sawtooth(days: number, peak: number, ratePerDay: number, waterEvery: number, endIso = "2026-07-10T00:00:00Z"): MoistureReading[] {
  const out: MoistureReading[] = [];
  const endMs = Date.parse(endIso);
  let level = peak;
  for (let i = days; i >= 0; i--) {
    const dayIndex = days - i;
    if (dayIndex % waterEvery === 0) level = peak;
    out.push({ recorded_at: new Date(endMs - i * 86_400_000).toISOString(), soil_moisture: Math.max(0, Math.round(level * 10) / 10) });
    level -= ratePerDay;
  }
  return out;
}

function baseInput(over: Partial<AreaInput> = {}): AreaInput {
  return {
    areaId: "area-1",
    areaName: "Raised Bed A",
    profile: profile(),
    readings: sawtooth(14, 60, 5, 4),
    plantRanges: [{ soil_moisture_min: 30, soil_moisture_max: 60 }],
    coverage: { blueprint: { id: "bp-1", frequency_days: 4 }, hasWateringAutomation: false },
    recent: [],
    forecastMaxC: [20, 21, 22, 20, 19, 21, 20],
    ...over,
  };
}

// ─── Band + helpers ───────────────────────────────────────────────────────────

Deno.test("AC-001: targetBand medians known ranges; defaults when unknown", () => {
  assertEquals(targetBand([{ soil_moisture_min: 20, soil_moisture_max: 50 }, { soil_moisture_min: 40, soil_moisture_max: 70 }]),
    { floor: 30, ceiling: 60, knownCount: 2 });
  assertEquals(targetBand([{ soil_moisture_min: null, soil_moisture_max: null }]),
    { floor: 30, ceiling: 60, knownCount: 0 });
});

Deno.test("AC-002: forecastMatchedRate picks hot_dry segment on a hot week, else overall", () => {
  const p = profile({ drydown_rate_pct_per_day: 4, drydown_by_weather: [{ key: "hot_dry", ratePerDay: 8, segments: 3 }] });
  assertEquals(forecastMatchedRate(p, [30, 31, 29, 28, 22, 21, 20]).segmentUsed, "hot_dry");
  assertEquals(forecastMatchedRate(p, [30, 31, 29, 28, 22, 21, 20]).rate, 8);
  assertEquals(forecastMatchedRate(p, [20, 21, 22, 20, 19, 21, 20]).segmentUsed, "overall");
  assertEquals(forecastMatchedRate(p, [20, 21, 22, 20, 19, 21, 20]).rate, 4);
});

Deno.test("AC-003: cooldown blocks a kind dismissed within 14 days, not others", () => {
  const recent = [{ kind: "tighten_watering", status: "dismissed", created_at: "2026-07-05T00:00:00Z" }];
  assertEquals(inCooldown(recent, "tighten_watering", TODAY), true);
  assertEquals(inCooldown(recent, "stretch_watering", TODAY), false);
  const old = [{ kind: "tighten_watering", status: "dismissed", created_at: "2026-06-01T00:00:00Z" }];
  assertEquals(inCooldown(old, "tighten_watering", TODAY), false);
});

Deno.test("AC-003b: cooldown keys off dismissed_at, not created_at (bug-audit-2026-07-10 #19)", () => {
  // Created 40 days ago (well past the 14-day window) but dismissed 2 days ago —
  // the old created_at anchor lapsed the cooldown immediately; the fresh
  // dismissal must keep it cooling.
  const dismissedRecently = [{
    kind: "tighten_watering", status: "dismissed",
    created_at: "2026-05-31T00:00:00Z", dismissed_at: "2026-07-08T00:00:00Z",
  }];
  assertEquals(inCooldown(dismissedRecently, "tighten_watering", TODAY), true);

  // Same old creation, but dismissed 20 days ago → cooldown genuinely lapsed.
  const dismissedLongAgo = [{
    kind: "tighten_watering", status: "dismissed",
    created_at: "2026-05-31T00:00:00Z", dismissed_at: "2026-06-20T00:00:00Z",
  }];
  assertEquals(inCooldown(dismissedLongAgo, "tighten_watering", TODAY), false);
});

// ─── Confidence gates ─────────────────────────────────────────────────────────

Deno.test("AC-004: silent below confidence / segment / reading-days gates", () => {
  assertEquals(evaluateArea(baseInput({ profile: profile({ confidence: 0.4 }) }), TODAY), []);
  assertEquals(evaluateArea(baseInput({ profile: profile({ sample_segments: 2 }) }), TODAY), []);
  assertEquals(evaluateArea(baseInput({ readings: sawtooth(5, 60, 5, 4) }), TODAY), []);
});

// ─── Tighten ──────────────────────────────────────────────────────────────────

Deno.test("AC-005: tighten when the schedule outruns the drydown and the bed suffers", () => {
  // Peak 55, floor 30, rate 7 → daysToFloor ≈ 3.6; watering every 7 days →
  // deep sub-floor stretches (suffering).
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 7 }),
    readings: sawtooth(14, 55, 7, 7),
    coverage: { blueprint: { id: "bp-1", frequency_days: 7 }, hasWateringAutomation: false },
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "tighten_watering");
  assertEquals(out[0].suggestedFrequencyDays, 4); // round(3.57) = 4, < 7
  assertEquals(out[0].blueprintId, "bp-1");
});

Deno.test("AC-006: tighten respects the dismissal cooldown", () => {
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 7 }),
    readings: sawtooth(14, 55, 7, 7),
    coverage: { blueprint: { id: "bp-1", frequency_days: 7 }, hasWateringAutomation: false },
    recent: [{ kind: "tighten_watering", status: "dismissed", created_at: "2026-07-03T00:00:00Z" }],
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.filter((p) => p.kind === "tighten_watering").length, 0);
});

// ─── Stretch ──────────────────────────────────────────────────────────────────

Deno.test("AC-007: stretch when the bed never approaches the floor", () => {
  // Peak 60, rate 2 → daysToFloor 15; watering every 3 days → min stays ~54.
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 2 }),
    readings: sawtooth(14, 60, 2, 3),
    coverage: { blueprint: { id: "bp-1", frequency_days: 3 }, hasWateringAutomation: false },
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "stretch_watering");
  // round(15×0.8)=12 clamped to freq+3 = 6.
  assertEquals(out[0].suggestedFrequencyDays, 6);
});

Deno.test("AC-008: NO stretch when the bed occasionally nears the floor (non-adjacent thresholds)", () => {
  // rate 5, peak 60 → daysToFloor 6; freq 4 — between 0.6× (3.6) and 1.25× (7.5):
  // neither tighten nor stretch → in_range record instead.
  const out = evaluateArea(baseInput(), TODAY);
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "in_range");
});

// ─── Stress risk ──────────────────────────────────────────────────────────────

Deno.test("AC-009: stress risk on a hot week when hot-rate drydown outruns the schedule", () => {
  const input = baseInput({
    profile: profile({
      drydown_rate_pct_per_day: 3,
      drydown_by_weather: [{ key: "hot_dry", ratePerDay: 9, segments: 3 }],
    }),
    // healthy readings under mild conditions (freq 4, rate 3 → min ≈ 51)
    readings: sawtooth(14, 60, 3, 4),
    coverage: { blueprint: { id: "bp-1", frequency_days: 4 }, hasWateringAutomation: false },
    forecastMaxC: [30, 31, 32, 29, 28, 27, 26], // hot week
  });
  const out = evaluateArea(input, TODAY);
  const stress = out.find((p) => p.kind === "stress_risk");
  assertEquals(!!stress, true);
  // hot rate 9: daysToFloor = (60-30)/9 ≈ 3.3 < freq 4.
});

// ─── Create routine ───────────────────────────────────────────────────────────

Deno.test("AC-010: proposes creating a routine when nothing covers a suffering bed", () => {
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 6 }),
    readings: sawtooth(14, 55, 6, 8), // long gaps → deep sub-floor time
    coverage: { blueprint: null, hasWateringAutomation: false },
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "create_watering_routine");
  // daysToFloor = (55-30)/6 ≈ 4.2 → round(4.2×0.9)=4
  assertEquals(out[0].suggestedFrequencyDays, 4);
  assertEquals(out[0].blueprintId, null);
});

Deno.test("AC-011: NO create-routine when a watering automation already covers the area", () => {
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 6 }),
    readings: sawtooth(14, 55, 6, 8),
    coverage: { blueprint: null, hasWateringAutomation: true },
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.filter((p) => p.kind === "create_watering_routine").length, 0);
});

Deno.test("AC-012: NO create-routine when the bed shows no need (rain keeps it fine)", () => {
  const input = baseInput({
    profile: profile({ drydown_rate_pct_per_day: 1.5 }),
    readings: sawtooth(14, 60, 1.5, 10), // never drops near 30
    coverage: { blueprint: null, hasWateringAutomation: false },
  });
  const out = evaluateArea(input, TODAY);
  assertEquals(out.filter((p) => p.kind === "create_watering_routine").length, 0);
  assertEquals(out[0]?.kind, "in_range");
});

// ─── Verification ─────────────────────────────────────────────────────────────

Deno.test("AC-013: verification — improved → verified_good; not → verified_mixed; short window → null", () => {
  const band = { floor: 30, ceiling: 60 };
  const good = verifyAdjustment(sawtooth(10, 58, 4, 3), band, 25);
  assertEquals(good?.verdict, "verified_good");
  const mixed = verifyAdjustment(sawtooth(10, 50, 7, 7), band, 25); // still deep sub-floor
  assertEquals(mixed?.verdict, "verified_mixed");
  assertEquals(verifyAdjustment(sawtooth(3, 58, 4, 3), band, 25), null); // <7 days
});

Deno.test("AC-014: multi-plant beds use the median band (evidence carries the count)", () => {
  const input = baseInput({
    plantRanges: [
      { soil_moisture_min: 20, soil_moisture_max: 50 },
      { soil_moisture_min: 30, soil_moisture_max: 60 },
      { soil_moisture_min: 40, soil_moisture_max: 70 },
    ],
  });
  const out = evaluateArea(input, TODAY);
  assertEquals((out[0].evidence.band as { floor: number }).floor, 30);
  assertEquals(out[0].evidence.plantRangeCount, 3);
});
