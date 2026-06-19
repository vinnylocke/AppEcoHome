import { assert, assertEquals } from "@std/assert";
import {
  buildAreaAnalysisPrompt,
  parseAreaInsight,
  shouldRegenerate,
  AREA_ANALYSIS_SCHEMA,
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
      { name: "Morning Water", isActive: true, triggerKind: "sensor_threshold", moistureThresholdPct: 25, valveDurationSeconds: 600, linkedTaskCount: 0, weatherMode: "defer" },
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
  assert(p.includes("[ideal: pH 6-6.8"));
  assert(p.includes("Morning Water"));
  assert(p.includes("soil moisture < 25%"));
});

Deno.test("prompt uses the condition-tree summary when present", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    automations: [
      { name: "Smart water", isActive: true, triggerKind: "condition", moistureThresholdPct: null, valveDurationSeconds: 30, linkedTaskCount: 2, weatherMode: null, conditionSummary: "moisture < 30% and not rain forecast (≥5mm)" },
    ],
  }));
  assert(p.includes("runs when moisture < 30% and not rain forecast"));
  assert(p.includes("drives 2 care tasks"));
});

Deno.test("prompt describes a time-scheduled automation + linked tasks", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    automations: [
      { name: "Strawberry watering", isActive: true, triggerKind: "time_scheduled", moistureThresholdPct: null, valveDurationSeconds: 30, linkedTaskCount: 4, weatherMode: "skip" },
    ],
  }));
  assert(p.includes("Strawberry watering"));
  assert(p.includes("waters on a fixed schedule"));
  assert(p.includes("for 30 s"));
  assert(p.includes("drives 4 care tasks"));
});

Deno.test("prompt uses stored care ranges as authoritative when present", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    plants: [
      { name: "Tomato", health: null, soilPhMin: 6.0, soilPhMax: 6.8, moistureMin: 35, moistureMax: 60, ecMin: 1200, ecMax: 2000, tempMin: 18, tempMax: 27 },
    ],
  }));
  assert(p.includes("[ideal: pH 6-6.8, moisture 35-60%, EC 1200-2000µS/cm, soil temp 18-27°C]"));
  assert(p.includes("AUTHORITATIVE stored values"));
});

Deno.test("prompt asks the model to estimate when no stored ranges", () => {
  const p = buildAreaAnalysisPrompt(baseInput({
    plants: [{ name: "Basil", health: null, soilPhMin: null, soilPhMax: null }],
  }));
  assert(p.includes("No stored ideal ranges are provided"));
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

Deno.test("prompt asks for per-plant analysis and a compatibility verdict", () => {
  const p = buildAreaAnalysisPrompt(baseInput());
  assert(p.includes("plant_analysis"));
  assert(p.includes("moisture_fit"));
  assert(p.includes("compatibility"));
  assert(p.includes("moisture_only"));
  assert(p.includes("zoned / plant-focused watering"));
});

// ── AREA_ANALYSIS_SCHEMA ────────────────────────────────────────────────────

Deno.test("schema exposes plant_analysis + compatibility fields", () => {
  const props = AREA_ANALYSIS_SCHEMA.properties as Record<string, unknown>;
  assert("plant_analysis" in props);
  assert("compatibility" in props);
  const compat = (props.compatibility as { properties: Record<string, unknown> }).properties;
  assert("verdict" in compat);
  assert("moisture_only" in compat);
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

Deno.test("parseAreaInsight — carries plant_analysis + compatibility when present", () => {
  const obj = parseAreaInsight(JSON.stringify({
    headline: "Hi", summary: "x", metrics: [],
    plant_analysis: [{ name: "Tomato", moisture_fit: "low", temp_fit: "good", ec_fit: "good", notes: "A bit dry." }],
    compatibility: { verdict: "minor_variance", moisture_only: true, note: "Water the lavender less." },
  }));
  assert(obj);
  assertEquals(obj!.plant_analysis?.[0].name, "Tomato");
  assertEquals(obj!.compatibility?.moisture_only, true);
});

Deno.test("parseAreaInsight — tolerates the new fields being absent (legacy cache)", () => {
  const obj = parseAreaInsight(JSON.stringify({ headline: "Hi", summary: "x", metrics: [] }));
  assert(obj);
  assertEquals(obj!.plant_analysis, undefined);
  assertEquals(obj!.compatibility, undefined);
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
