import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildReceipt } from "@shared/automationReceipt.ts";

Deno.test("buildReceipt — ran, with valves + tasks", () => {
  const r = buildReceipt("ran", { automationName: "Morning water", valvesFired: 2, tasksCompleted: 1 });
  assertEquals(r.title, "Morning water ran");
  assertStringIncludes(r.body, "watered 2 valves");
  assertStringIncludes(r.body, "completed a task");
});

Deno.test("buildReceipt — ran, no side effects (notify-only automation)", () => {
  const r = buildReceipt("ran", { automationName: "Heads up" });
  assertStringIncludes(r.body, "Conditions were met and it ran");
});

Deno.test("buildReceipt — rate_limited carries the limit, next time, and the nudge", () => {
  const r = buildReceipt("rate_limited", {
    automationName: "Pump", rateLimitCount: 3, rateLimitWindowHours: 24, nextEligibleAt: "2026-06-25T06:00:00Z",
  });
  assertEquals(r.title, "Pump held back");
  assertStringIncludes(r.body, "max 3 per day");
  assertStringIncludes(r.body, "2026-06-25");
  assertStringIncludes(r.body, "easing the limit");
});

Deno.test("buildReceipt — failed", () => {
  const r = buildReceipt("failed", { automationName: "Drip" });
  assertEquals(r.title, "Drip failed to run");
  assertStringIncludes(r.body, "didn't respond");
});

Deno.test("buildReceipt — partial keeps the duration", () => {
  const r = buildReceipt("partial", { automationName: "Beds", durationText: "30 minutes" });
  assertStringIncludes(r.title, "some devices failed");
  assertStringIncludes(r.body, "30 minutes");
});

Deno.test("buildReceipt — skipped_weather mentions rain + mm", () => {
  const r = buildReceipt("skipped_weather", { automationName: "Lawn", rainMm: 8 });
  assertStringIncludes(r.title, "skipped — rain");
  assertStringIncludes(r.body, "8mm");
});

Deno.test("buildReceipt — window labels + fallback name", () => {
  assertStringIncludes(buildReceipt("rate_limited", { automationName: "x", rateLimitCount: 1, rateLimitWindowHours: 1 }).body, "per hour");
  assertStringIncludes(buildReceipt("rate_limited", { automationName: "x", rateLimitCount: 1, rateLimitWindowHours: 168 }).body, "per week");
  assertEquals(buildReceipt("ran", { automationName: "" }).title, "Your automation ran");
});
