import { assert, assertEquals } from "@std/assert";
import {
  AREA_SETUP_REVIEW_SCHEMA,
  buildAreaSetupReviewPrompt,
  parseAreaSetupReview,
  type AreaSetupReviewInput,
} from "@shared/areaSetupReview.ts";

// Add-Area wizard AI review contract (2026-07-18). The parser feeds
// TaskActionButtons' blueprint/task creation directly, so the coercion
// rules here are load-bearing, not cosmetic.

function baseInput(overrides: Partial<AreaSetupReviewInput> = {}): AreaSetupReviewInput {
  return {
    area: {
      name: "Raised Bed A",
      areaType: "bed",
      isOutside: true,
      growingMedium: "Mineral Soil",
      mediumTexture: "Medium",
      mediumPh: 6.2,
      waterMovement: "Well-Drained",
      nutrientSource: "Organic Breakdown",
      peakLightLux: 35000,
    },
    home: { hardinessZone: 9, climateZone: "9a" },
    plants: [
      {
        name: "Tomato",
        scientificName: "Solanum lycopersicum",
        quantity: 3,
        soilPhMin: 6.0,
        soilPhMax: 6.8,
        sunlight: ["full sun"],
        wateringMinDays: 2,
        wateringMaxDays: 4,
        soilMoistureMin: 40,
        soilMoistureMax: 60,
        cycle: "Annual",
      },
      { name: "Mystery Fern", quantity: 1 },
    ],
    ...overrides,
  };
}

// ── prompt ──────────────────────────────────────────────────────────────

Deno.test("prompt includes the bed's set fields with the lux band, omitting unset ones", () => {
  const p = buildAreaSetupReviewPrompt(baseInput());
  assert(p.includes("Growing medium: Mineral Soil"));
  assert(p.includes("Soil pH: 6.2"));
  assert(p.includes("Water movement: Well-Drained"));
  assert(p.includes("Peak light: bright (35000 lux measured)"));
  assert(p.includes("Hardiness zone: 9"));

  const sparse = buildAreaSetupReviewPrompt(baseInput({
    area: { name: "Pot", isOutside: false },
    home: {},
  }));
  assert(!sparse.includes("Growing medium:"));
  assert(!sparse.includes("Peak light:"));
  assert(sparse.includes("Setting: indoor"));
});

Deno.test("prompt renders per-plant care lines, quantity, and a no-data marker", () => {
  const p = buildAreaSetupReviewPrompt(baseInput());
  assert(p.includes("Tomato (Solanum lycopersicum) ×3: pH 6–6.8"));
  assert(p.includes("water every 2–4d"));
  assert(p.includes("Mystery Fern: (no care data on file)"));
});

Deno.test("prompt handles zero plants with the recommend-focused instruction", () => {
  const p = buildAreaSetupReviewPrompt(baseInput({ plants: [] }));
  assert(p.includes("no plants chosen yet"));
});

// ── schema pinning ──────────────────────────────────────────────────────

Deno.test("schema requires the core fields and pins the verdict enums", () => {
  assertEquals(AREA_SETUP_REVIEW_SCHEMA.required, [
    "score", "headline", "summary", "plant_fit", "compatibility", "recommendations",
  ]);
  const fitEnum = AREA_SETUP_REVIEW_SCHEMA.properties.plant_fit.items.properties.verdict.enum;
  assertEquals([...fitEnum], ["great", "ok", "poor", "unknown"]);
  const taskType = AREA_SETUP_REVIEW_SCHEMA.properties.recommendations.properties.tasks.items.properties.task_type.enum;
  assertEquals([...taskType], ["Planting", "Watering", "Harvesting", "Maintenance"]);
});

// ── parser ──────────────────────────────────────────────────────────────

const VALID = {
  score: 82,
  headline: "A strong sun-lover's bed.",
  summary: "The pH and light suit the tomatoes well.",
  plant_fit: [
    { name: "Tomato", verdict: "great", note: "pH 6.2 sits inside 6.0–6.8" },
    { name: "Mystery Fern", verdict: "unknown", note: "No care data" },
  ],
  compatibility: { verdict: "well", note: "No antagonists" },
  recommendations: {
    plants: [{ name: "Basil", reason: "Classic tomato companion", search_query: "Ocimum basilicum" }],
    tasks: [
      { title: "Feed the soil", description: "Compost top-dress", task_type: "Maintenance", due_in_days: 0, is_recurring: true, frequency_days: 28 },
    ],
    automations: [{ title: "Moisture-triggered watering", description: "Water when the bed drops below 35%" }],
  },
};

Deno.test("parser accepts a valid review (plain and fenced)", () => {
  const parsed = parseAreaSetupReview(JSON.stringify(VALID));
  assert(parsed);
  assertEquals(parsed!.score, 82);
  assertEquals(parsed!.plant_fit.length, 2);
  assertEquals(parsed!.recommendations.tasks[0].frequency_days, 28);

  const fenced = parseAreaSetupReview("```json\n" + JSON.stringify(VALID) + "\n```");
  assert(fenced);
  assertEquals(fenced!.headline, VALID.headline);
});

Deno.test("parser clamps the score and defaults garbage scores to 50", () => {
  assertEquals(parseAreaSetupReview(JSON.stringify({ ...VALID, score: 250 }))!.score, 100);
  assertEquals(parseAreaSetupReview(JSON.stringify({ ...VALID, score: -5 }))!.score, 0);
  assertEquals(parseAreaSetupReview(JSON.stringify({ ...VALID, score: "loads" }))!.score, 50);
});

Deno.test("parser coerces or drops malformed recommendations without killing the review", () => {
  const messy = {
    ...VALID,
    plant_fit: [
      { name: "Tomato", verdict: "amazing", note: "bad verdict → dropped" },
      { name: "", verdict: "great", note: "no name → dropped" },
      { name: "Kept", verdict: "ok", note: "" },
    ],
    recommendations: {
      plants: [{ name: "", reason: "nameless → dropped", search_query: "x" }, { name: "Chives", reason: "", search_query: "" }],
      tasks: [
        { title: "Weird type", description: "", task_type: "Singing", due_in_days: 9999, is_recurring: true, frequency_days: 0 },
        { title: "", description: "untitled → dropped", task_type: "Watering", due_in_days: 1, is_recurring: false },
      ],
      automations: [{ title: "", description: "untitled → dropped" }],
    },
  };
  const parsed = parseAreaSetupReview(JSON.stringify(messy))!;
  assertEquals(parsed.plant_fit, [{ name: "Kept", verdict: "ok", note: "" }]);
  // search_query falls back to the name when blank.
  assertEquals(parsed.recommendations.plants, [{ name: "Chives", reason: "", search_query: "Chives" }]);
  const task = parsed.recommendations.tasks[0];
  assertEquals(task.task_type, "Maintenance"); // unknown type coerced
  assertEquals(task.due_in_days, 365);         // clamped
  assertEquals(task.frequency_days, 1);        // clamped up from 0
  assertEquals(parsed.recommendations.automations, []);
});

Deno.test("parser nulls non-recurring frequency and enforces the caps", () => {
  const oneOff = { title: "Lime the bed", description: "", task_type: "Maintenance", due_in_days: 3, is_recurring: false, frequency_days: 14 };
  const many = {
    ...VALID,
    recommendations: {
      plants: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, reason: "", search_query: `P${i}` })),
      tasks: [oneOff, ...Array.from({ length: 9 }, (_, i) => ({ title: `T${i}`, description: "", task_type: "Watering", due_in_days: 0, is_recurring: false }))],
      automations: Array.from({ length: 5 }, (_, i) => ({ title: `A${i}`, description: "" })),
    },
  };
  const parsed = parseAreaSetupReview(JSON.stringify(many))!;
  assertEquals(parsed.recommendations.tasks[0].frequency_days, null);
  assertEquals(parsed.recommendations.plants.length, 5);
  assertEquals(parsed.recommendations.tasks.length, 6);
  assertEquals(parsed.recommendations.automations.length, 3);
});

Deno.test("parser returns null for unusable cores", () => {
  assertEquals(parseAreaSetupReview("not json"), null);
  assertEquals(parseAreaSetupReview(JSON.stringify({ score: 80 })), null); // no headline/summary
  assertEquals(parseAreaSetupReview(JSON.stringify({ ...VALID, headline: "" })), null);
});
