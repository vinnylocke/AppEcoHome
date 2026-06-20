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
  weatherMode: "off",
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

Deno.test("enable_weather_skip — weather-sensitive with rain-skip off", () => {
  const s = analyseAutomation(
    cfg({ weatherMode: "off" }),
    runs({ fired: 3 }),
    profile({ byWeather: [
      { key: "hot_dry", ratePerDay: 10, segments: 4 },
      { key: "cool_wet", ratePerDay: 3, segments: 3 },
    ] }),
  );
  const w = s.find((d) => d.kind === "enable_weather_skip");
  assert(w, "should suggest rain-skip");
  assertEquals(w!.field, "weather_mode");
  assertEquals(w!.proposedValue, "skip");
});

Deno.test("no suggestions when everything looks healthy", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: 5, weatherMode: "skip" }),
    runs({ total: 2, fired: 2, rateLimited: 0 }),
    profile({ retentionClass: "balanced", drydownRatePerDay: 5 }),
  );
  assertEquals(s.length, 0);
});

Deno.test("weather-skip not suggested when already on", () => {
  const s = analyseAutomation(
    cfg({ weatherMode: "skip" }),
    runs({ fired: 3 }),
    profile({ byWeather: [
      { key: "hot_dry", ratePerDay: 10, segments: 4 },
      { key: "cool_wet", ratePerDay: 3, segments: 3 },
    ] }),
  );
  assertEquals(s.some((d) => d.kind === "enable_weather_skip"), false);
});

Deno.test("raise_run_limit needs a real limit (unlimited → no suggestion)", () => {
  const s = analyseAutomation(
    cfg({ runLimitCount: null }),
    runs({ fired: 8, rateLimited: 5 }),
    profile(),
  );
  assertEquals(s.length, 0);
});
