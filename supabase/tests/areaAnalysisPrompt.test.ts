import { assert, assertEquals } from "@std/assert";
import {
  buildAreaAnalysisPrompt,
  parseAreaInsight,
  shouldRegenerate,
  type AreaAnalysisInput,
} from "@shared/areaAnalysisPrompt.ts";

function baseInput(overrides: Partial<AreaAnalysisInput> = {}): AreaAnalysisInput {
  return {
    persona: null,
    area: { name: "Veg Bed", isOutside: true, growingMedium: "Mineral Soil", mediumPh: 6.5, climateZone: "9a" },
    home: { hardinessZone: 9 },
    summary: { avgMoisture: 28, avgTemp: 18, avgEc: 900, ecSource: "calibrated_us_cm", sensorsWithData: 2 },
    sensors: [
      { name: "Bed Front", provider: "ecowitt", latest: { soil_moisture: 30, soil_temp: 18, soil_ec: 900, ec_source: "calibrated_us_cm", recorded_at: "2026-06-17T10:00:00Z" } },
      { name: "Bed Back", provider: "ecowitt", latest: null },
    ],
    history: { windowDays: 30, readings: 120, moisture: { min: 12, max: 44, avg: 28 }, temp: { min: 10, max: 24, avg: 18 }, ec: { min: 700, max: 1100, avg: 900 } },
    plants: [
      { name: "Tomato", health: "healthy", soilPhMin: 6.0, soilPhMax: 6.8 },
      { name: "Basil", health: null, soilPhMin: null, soilPhMax: null },
    ],
    automations: [
      { name: "Morning Water", isActive: true, triggerKind: "sensor_threshold", moistureThresholdPct: 25, valveDurationSeconds: 600, linkedTaskCount: 0 },
    ],
    ...overrides,
  };
}

// ── buildAreaAnalysisPrompt ─────────────────────────────────────────────────

Deno.test("prompt includes area, current readings, plants and automations", () => {
  const p = buildAreaAnalysisPrompt(baseInput());
  assert(p.includes("Veg Bed"));
  assert(p.includes("Moisture (avg): 28.0%"));
  assert(p.includes("Tomato"));
  assert(p.includes("preferred soil pH 6-6.8"));
  assert(p.includes("Morning Water"));
  assert(p.includes("soil moisture < 25%"));
});

Deno.test("prompt describes a time-scheduled automation + linked tasks", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    automations: [
      { name: "Strawberry watering", isActive: true, triggerKind: "time_scheduled", moistureThresholdPct: null, valveDurationSeconds: 30, linkedTaskCount: 4 },
    ],
  }));
  assert(p.includes("Strawberry watering"));
  assert(p.includes("waters on a fixed schedule"));
  assert(p.includes("for 30 s"));
  assert(p.includes("drives 4 care tasks"));
});

Deno.test("prompt labels raw ADC EC as uncalibrated", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    summary: { avgMoisture: 28, avgTemp: 18, avgEc: 1200, ecSource: "raw_adc", sensorsWithData: 1 },
  }));
  assert(p.includes("raw ADC"));
});

Deno.test("persona branch — rookie is plain, expert is technical", () => {
  const rookie = buildAreaAnalysisPrompt(baseInput({ persona: "new" }));
  const expert = buildAreaAnalysisPrompt(baseInput({ persona: "experienced" }));
  assert(rookie.includes("beginner"));
  assert(rookie.includes("plain language"));
  assert(expert.includes("experienced grower"));
  assert(expert.includes("µS/cm"));
  assert(rookie !== expert);
});

Deno.test("prompt handles empty plants and no automations", () => {
  const p = buildAreaAnalysisPrompt(baseInput({ plants: [], automations: [] }));
  assert(p.includes("(no plants recorded in this area)"));
  assert(p.includes("(none configured)"));
});

// ── parseAreaInsight ────────────────────────────────────────────────────────

Deno.test("parseAreaInsight — accepts valid JSON", () => {
  const obj = parseAreaInsight(JSON.stringify({ headline: "Hi", summary: "x", metrics: [] }));
  assert(obj);
  assertEquals(obj!.headline, "Hi");
});

Deno.test("parseAreaInsight — strips a markdown fence", () => {
  const obj = parseAreaInsight("```json\n{\"headline\":\"H\",\"summary\":\"s\",\"metrics\":[]}\n```");
  assert(obj);
  assertEquals(obj!.headline, "H");
});

Deno.test("parseAreaInsight — rejects garbage / wrong shape", () => {
  assertEquals(parseAreaInsight("not json"), null);
  assertEquals(parseAreaInsight(JSON.stringify({ headline: "h" })), null); // no metrics array
  assertEquals(parseAreaInsight(JSON.stringify({ metrics: [] })), null); // no headline
});

// ── shouldRegenerate ────────────────────────────────────────────────────────

Deno.test("shouldRegenerate — force always true", () => {
  assertEquals(shouldRegenerate("2026-06-17T10:00:00Z", "2026-06-17T10:00:00Z", true), true);
});

Deno.test("shouldRegenerate — no readings at all keeps cache", () => {
  assertEquals(shouldRegenerate(null, null, false), false);
  assertEquals(shouldRegenerate("2026-06-17T10:00:00Z", null, false), false);
});

Deno.test("shouldRegenerate — cache had no readings, now has some", () => {
  assertEquals(shouldRegenerate(null, "2026-06-17T10:00:00Z", false), true);
});

Deno.test("shouldRegenerate — newer reading regenerates, same/older does not", () => {
  assertEquals(shouldRegenerate("2026-06-17T10:00:00Z", "2026-06-17T11:00:00Z", false), true);
  assertEquals(shouldRegenerate("2026-06-17T10:00:00Z", "2026-06-17T10:00:00Z", false), false);
  assertEquals(shouldRegenerate("2026-06-17T10:00:00Z", "2026-06-17T09:00:00Z", false), false);
});
