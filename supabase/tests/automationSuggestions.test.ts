import { assert, assertEquals } from "@std/assert";
import {
  analyseAutomation,
  type AutomationConfig,
  type ProfileLite,
  type RunsSummary,
} from "../functions/_shared/automationSuggestions/analyse.ts";

const cfg = (over: Partial<AutomationConfig> = {}): AutomationConfig => ({
  runLimitCount: 2,
  runLimitWindowHours: 24,
  durationSeconds: 1800, // 30 min
  sensorCooldownMinutes: 60,
  ...over,
});
const runs = (over: Partial<RunsSummary> = {}): RunsSummary => ({
  windowDays: 7,
  total: 0,
  fired: 0,
  rateLimited: 0,
  ...over,
});
const profile = (over: Partial<ProfileLite> = {}): ProfileLite => ({
  retentionClass: "balanced",
  drydownRatePerDay: 5,
  byWeather: [],
  ...over,
});

Deno.test("increase_watering — rate-limited + decent waterings → more runs (alt: longer)", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 2, durationSeconds: 1800 }),
    runs({ total: 11, fired: 8, rateLimited: 3 }),
    profile({ retentionClass: "fast_draining", drydownRatePerDay: 9, avgRewetJump: 25 }),
  );
  const inc = s.find((d) => d.kind === "increase_watering");
  assert(inc, "should suggest watering more");
  assertEquals(inc!.field, "run_limit_count");
  assertEquals(inc!.currentValue, 2);
  assertEquals(inc!.proposedValue, 3);
  assert(inc!.confidence > 0.6, "fast-draining should boost confidence");
  // The other lever is offered as the alternative.
  assertEquals(inc!.alternative?.field, "duration_seconds");
  assert(inc!.diagnosis.length > 0);
});

Deno.test("increase_watering — shallow waterings → longer runs (alt: more runs)", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 2, durationSeconds: 600 }), // 10 min
    runs({ total: 11, fired: 8, rateLimited: 3 }),
    profile({ retentionClass: "fast_draining", drydownRatePerDay: 9, avgRewetJump: 8 }),
  );
  const inc = s.find((d) => d.kind === "increase_watering");
  assert(inc, "should suggest watering more");
  assertEquals(inc!.field, "duration_seconds");
  assertEquals(inc!.proposedValue, 900); // 10 min → 15 min
  assertEquals(inc!.alternative?.field, "run_limit_count");
  assert(inc!.rationale.includes("run it longer"));
  assert(inc!.diagnosis.some((d) => d.includes("isn't soaking in deeply")));
});

Deno.test("diagnosis cites concrete moisture evidence + hot weather", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 2 }),
    runs({ total: 11, fired: 8, rateLimited: 3 }),
    profile({
      retentionClass: "fast_draining", drydownRatePerDay: 9, avgRewetJump: 25,
      byWeather: [
        { key: "hot_dry", ratePerDay: 12, segments: 4 },
        { key: "mild", ratePerDay: 5, segments: 3 },
      ],
    }),
    { thresholdPct: 30, totalReadings: 21, lowReadings: 18, minMoisture: 14, avgMoisture: 23 },
  );
  const inc = s.find((d) => d.kind === "increase_watering");
  assert(inc);
  assert(inc!.diagnosis.some((d) => d.includes("below the 30% target on 18 of the last 21 readings")),
    `diagnosis should cite the readings: ${JSON.stringify(inc!.diagnosis)}`);
  assert(inc!.diagnosis.some((d) => d.includes("hot, dry weather")),
    `diagnosis should mention hot weather: ${JSON.stringify(inc!.diagnosis)}`);
});

Deno.test("reduce_watering — frequent fires in a retentive area", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 3 }),
    runs({ total: 8, fired: 8, rateLimited: 0 }),
    profile({ retentionClass: "moisture_retentive", drydownRatePerDay: 2 }),
  );
  const reduce = s.find((d) => d.kind === "reduce_watering");
  assert(reduce, "should suggest easing off");
  assertEquals(reduce!.proposedValue, 2);
  assert(reduce!.diagnosis.length > 0);
  assertEquals(s.some((d) => d.kind === "increase_watering"), false);
});

Deno.test("no suggestions when everything looks healthy", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 5 }),
    runs({ total: 2, fired: 2, rateLimited: 0 }),
    profile({ retentionClass: "balanced", drydownRatePerDay: 5 }),
  );
  assertEquals(s.length, 0);
});

Deno.test("no levers (no run limit + no duration) → no suggestion", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: null, durationSeconds: null }),
    runs({ fired: 8, rateLimited: 5 }),
    profile(),
  );
  assertEquals(s.length, 0);
});

Deno.test("no run limit but a duration → falls back to longer runs (no alternative)", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: null, durationSeconds: 600 }),
    runs({ fired: 8, rateLimited: 5 }),
    profile({ retentionClass: "fast_draining", drydownRatePerDay: 9 }),
  );
  const inc = s.find((d) => d.kind === "increase_watering");
  assert(inc);
  assertEquals(inc!.field, "duration_seconds");
  assertEquals(inc!.alternative, null);
});
