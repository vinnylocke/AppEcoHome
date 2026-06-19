import { assert, assertEquals } from "@std/assert";
import {
  isRateLimited,
  windowStartIso,
  FIRED_STATUSES,
  shouldCollapseRateLimitSkip,
  nextEligibleAt,
} from "@shared/runLimit.ts";

Deno.test("isRateLimited — unlimited when limit null/0/negative", () => {
  assertEquals(isRateLimited(99, null), false);
  assertEquals(isRateLimited(99, undefined), false);
  assertEquals(isRateLimited(99, 0), false);
  assertEquals(isRateLimited(99, -1), false);
});

Deno.test("isRateLimited — true only once the count reaches the limit", () => {
  assertEquals(isRateLimited(0, 3), false);
  assertEquals(isRateLimited(2, 3), false);
  assertEquals(isRateLimited(3, 3), true);
  assertEquals(isRateLimited(4, 3), true);
});

Deno.test("windowStartIso — subtracts the window; falls back to 24h", () => {
  const now = new Date("2026-06-18T12:00:00.000Z");
  assertEquals(windowStartIso(now, 6), "2026-06-18T06:00:00.000Z");
  assertEquals(windowStartIso(now, 0), "2026-06-17T12:00:00.000Z"); // 0 → 24h fallback
});

Deno.test("FIRED_STATUSES excludes skips/defers", () => {
  assert(FIRED_STATUSES.includes("success"));
  assert(!(FIRED_STATUSES as readonly string[]).includes("skipped_rate_limited"));
  assert(!(FIRED_STATUSES as readonly string[]).includes("deferred_weather"));
});

Deno.test("shouldCollapseRateLimitSkip — only when the latest run is itself a rate-limited skip", () => {
  assertEquals(shouldCollapseRateLimitSkip("skipped_rate_limited"), true);
  // A real (or any non-skip) latest run breaks the chain → insert a fresh row.
  assertEquals(shouldCollapseRateLimitSkip("success"), false);
  assertEquals(shouldCollapseRateLimitSkip("partial"), false);
  assertEquals(shouldCollapseRateLimitSkip("deferred_weather"), false);
  assertEquals(shouldCollapseRateLimitSkip(null), false);
  assertEquals(shouldCollapseRateLimitSkip(undefined), false);
});

Deno.test("nextEligibleAt — limit-th most-recent fire + window", () => {
  // 2/24h fired at 12:35 + 14:05 → eligible when the OLDER (12:35) ages out.
  const fires = ["2026-06-18T14:05:00.000Z", "2026-06-18T12:35:00.000Z"];
  assertEquals(nextEligibleAt(fires, 2, 24), "2026-06-19T12:35:00.000Z");
  // limit 1 → the single most-recent fire + window.
  assertEquals(nextEligibleAt(["2026-06-18T14:05:00.000Z"], 1, 24), "2026-06-19T14:05:00.000Z");
  // windowHours 0 falls back to 24h.
  assertEquals(nextEligibleAt(["2026-06-18T00:00:00.000Z"], 1, 0), "2026-06-19T00:00:00.000Z");
});

Deno.test("nextEligibleAt — null when not actually over the limit / unusable", () => {
  assertEquals(nextEligibleAt(["2026-06-18T14:05:00.000Z"], 2, 24), null); // fewer than limit
  assertEquals(nextEligibleAt([], 2, 24), null);
  assertEquals(nextEligibleAt(["2026-06-18T14:05:00.000Z"], 0, 24), null); // unlimited
  assertEquals(nextEligibleAt(["2026-06-18T14:05:00.000Z"], null, 24), null);
  assertEquals(nextEligibleAt(["not-a-date"], 1, 24), null);
});
