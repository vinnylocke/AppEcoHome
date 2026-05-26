import { assertEquals } from "@std/assert";
import { splitJoinedStringArray } from "@shared/plantSeedPrompt.ts";

Deno.test("splitJoinedStringArray returns [] for non-array input", () => {
  assertEquals(splitJoinedStringArray(null), []);
  assertEquals(splitJoinedStringArray(undefined), []);
  assertEquals(splitJoinedStringArray("autumn,summer"), []);
  assertEquals(splitJoinedStringArray(42), []);
});

Deno.test("splitJoinedStringArray returns [] for empty array", () => {
  assertEquals(splitJoinedStringArray([]), []);
});

Deno.test("splitJoinedStringArray passes clean arrays through unchanged", () => {
  assertEquals(
    splitJoinedStringArray(["autumn", "summer"]),
    ["autumn", "summer"],
  );
  assertEquals(
    splitJoinedStringArray(["full sun", "part shade"]),
    ["full sun", "part shade"],
  );
});

Deno.test("splitJoinedStringArray splits comma-joined single-element arrays", () => {
  assertEquals(
    splitJoinedStringArray(["autumn,summer"]),
    ["autumn", "summer"],
  );
  assertEquals(
    splitJoinedStringArray(["full sun, part shade"]),
    ["full sun", "part shade"],
  );
});

Deno.test("splitJoinedStringArray handles mixed clean + joined elements", () => {
  assertEquals(
    splitJoinedStringArray(["seed", "cutting,division"]),
    ["seed", "cutting", "division"],
  );
});

Deno.test("splitJoinedStringArray trims whitespace + drops empties", () => {
  assertEquals(
    splitJoinedStringArray(["  autumn  ", " summer ,, , winter "]),
    ["autumn", "summer", "winter"],
  );
});

Deno.test("splitJoinedStringArray is idempotent", () => {
  const once = splitJoinedStringArray(["autumn,summer", "winter"]);
  const twice = splitJoinedStringArray(once);
  assertEquals(twice, once);
});

Deno.test("splitJoinedStringArray drops non-string entries", () => {
  assertEquals(
    splitJoinedStringArray(["autumn", 42 as unknown as string, null as unknown as string, "summer"]),
    ["autumn", "summer"],
  );
});
