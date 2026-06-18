import { assert, assertEquals } from "@std/assert";
import { isWithinDateRange, summariseTree, type ConditionNode } from "@shared/conditionTree.ts";

const UTC = "UTC";

Deno.test("isWithinDateRange — inside / outside a normal (summer) window", () => {
  assert(isWithinDateRange(new Date("2026-07-15T12:00:00Z"), "06-01", "08-31", UTC));
  assertEquals(isWithinDateRange(new Date("2026-09-15T12:00:00Z"), "06-01", "08-31", UTC), false);
});

Deno.test("isWithinDateRange — boundaries are inclusive", () => {
  assert(isWithinDateRange(new Date("2026-06-01T00:30:00Z"), "06-01", "08-31", UTC));
  assert(isWithinDateRange(new Date("2026-08-31T23:30:00Z"), "06-01", "08-31", UTC));
});

Deno.test("isWithinDateRange — wraps the year end (southern summer 12-01→02-28)", () => {
  assert(isWithinDateRange(new Date("2026-01-10T12:00:00Z"), "12-01", "02-28", UTC));   // Jan in
  assert(isWithinDateRange(new Date("2026-12-15T12:00:00Z"), "12-01", "02-28", UTC));   // Dec in
  assertEquals(isWithinDateRange(new Date("2026-06-15T12:00:00Z"), "12-01", "02-28", UTC), false); // Jun out
});

Deno.test("isWithinDateRange — malformed input → false", () => {
  assertEquals(isWithinDateRange(new Date(), "bad", "08-31", UTC), false);
  assertEquals(isWithinDateRange(new Date(), "06-01", "", UTC), false);
});

Deno.test("summariseTree renders a date_range leaf", () => {
  const tree: ConditionNode = { kind: "date_range", from: "01-01", to: "01-09" };
  assertEquals(summariseTree(tree), "date is between 1 Jan and 9 Jan");
});
