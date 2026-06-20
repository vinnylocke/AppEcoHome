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
  durationSeconds: 1800,
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

Deno.test("raise_run_limit — rate-limited repeatedly", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 2 }),
    runs({ total: 11, fired: 8, rateLimited: 3 }),
    profile({ retentionClass: "fast_draining", drydownRatePerDay: 9 }),
  );
  const raise = s.find((d) => d.kind === "raise_run_limit");
  assert(raise, "should suggest raising the run limit");
  assertEquals(raise!.field, "run_limit_count");
  assertEquals(raise!.currentValue, 2);
  assertEquals(raise!.proposedValue, 3); // extra = 1 (rateLimited 3 < max(3,fired 8))
  assert(raise!.confidence > 0.6, "fast-draining should boost confidence");
});

Deno.test("raise_run_limit rationale cites concrete moisture evidence", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 2 }),
    runs({ total: 11, fired: 8, rateLimited: 3 }),
    profile({ retentionClass: "fast_draining", drydownRatePerDay: 9 }),
    { thresholdPct: 30, totalReadings: 21, lowReadings: 18, minMoisture: 14, avgMoisture: 23 },
  );
  const raise = s.find((d) => d.kind === "raise_run_limit");
  assert(raise);
  assert(raise!.rationale.includes("below the 30% watering mark on 18 of the last 21 readings"),
    `rationale should cite the evidence: ${raise!.rationale}`);
  assert(raise!.rationale.includes("low of 14%"));
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
  // No raise suggestion when not rate-limited.
  assertEquals(s.some((d) => d.kind === "raise_run_limit"), false);
});

Deno.test("no suggestions when everything looks healthy", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 5 }),
    runs({ total: 2, fired: 2, rateLimited: 0 }),
    profile({ retentionClass: "balanced", drydownRatePerDay: 5 }),
  );
  assertEquals(s.length, 0);
});

Deno.test("raise_run_limit needs a real limit (unlimited → no suggestion)", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: null }),
    runs({ fired: 8, rateLimited: 5 }),
    profile(),
  );
  assertEquals(s.length, 0);
});
