import { assertEquals, assertStrictEquals } from "@std/assert";
import { applyEdgeClaimFilter } from "@shared/automationClaim.ts";

function spyQuery() {
  const calls: Array<{ m: string; col: string; v: unknown }> = [];
  const q = {
    is(col: string, v: null) { calls.push({ m: "is", col, v }); return q; },
    eq(col: string, v: string) { calls.push({ m: "eq", col, v }); return q; },
  };
  return { q, calls };
}

Deno.test("claims on IS NULL when the automation never fired", () => {
  const { q, calls } = spyQuery();
  applyEdgeClaimFilter(q, null);
  assertEquals(calls, [{ m: "is", col: "last_fired_at", v: null }]);
});

Deno.test("claims on the EXACT last_fired_at we read (optimistic CAS key)", () => {
  const { q, calls } = spyQuery();
  applyEdgeClaimFilter(q, "2026-06-21T08:00:00+00:00");
  assertEquals(calls, [{ m: "eq", col: "last_fired_at", v: "2026-06-21T08:00:00+00:00" }]);
  // Crucially never an unconditional update — that's what let two concurrent
  // invocations both fire the same rising edge.
  assertEquals(calls.some((c) => c.m === "is"), false);
});

Deno.test("returns the same builder so the caller can chain .select()", () => {
  const { q } = spyQuery();
  assertStrictEquals(applyEdgeClaimFilter(q, null), q);
  assertStrictEquals(applyEdgeClaimFilter(q, "2026-01-01T00:00:00+00:00"), q);
});
