import { assert, assertEquals } from "@std/assert";
import { isRateLimited, windowStartIso, FIRED_STATUSES } from "@shared/runLimit.ts";

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
