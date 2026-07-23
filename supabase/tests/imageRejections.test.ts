import { assertEquals } from "@std/assert";
import { isRejected, filterRejected } from "@shared/imageRejections.ts";

// Pure filtering behaviour for the image-judge rejection feature. The IO parts
// (resolveMemberHome / loadRejectedUrls) are exercised by the plant-image-judge
// E2E; here we lock the exclusion logic that keeps a rejected URL out of every
// candidate pool.

const img = (thumb: string | null, full: string | null) => ({ thumb_url: thumb, full_url: full });

Deno.test("isRejected — empty set never rejects", () => {
  assertEquals(isRejected(img("a", "b"), new Set()), false);
});

Deno.test("isRejected — matches on thumb OR full url", () => {
  const rejected = new Set(["bad-thumb", "bad-full"]);
  assertEquals(isRejected(img("bad-thumb", "ok"), rejected), true);
  assertEquals(isRejected(img("ok", "bad-full"), rejected), true);
  assertEquals(isRejected(img("ok", "also-ok"), rejected), false);
});

Deno.test("isRejected — null urls are safe", () => {
  const rejected = new Set(["x"]);
  assertEquals(isRejected(img(null, null), rejected), false);
  assertEquals(isRejected(img(null, "x"), rejected), true);
});

Deno.test("filterRejected — empty set returns the pool unchanged", () => {
  const pool = [img("a", "1"), img("b", "2")];
  const out = filterRejected(pool, new Set());
  assertEquals(out.length, 2);
  assertEquals(out, pool);
});

Deno.test("filterRejected — drops rejected, preserves order of survivors", () => {
  const pool = [img("a", "1"), img("b", "2"), img("c", "3")];
  const out = filterRejected(pool, new Set(["b", "3"]));
  // 'b' rejected on thumb, third rejected on full ('3') → only 'a' survives.
  assertEquals(out.map((i) => i.thumb_url), ["a"]);
});

Deno.test("filterRejected — every candidate rejected yields an empty pool", () => {
  const pool = [img("a", "1"), img("b", "2")];
  const out = filterRejected(pool, new Set(["a", "b"]));
  assertEquals(out.length, 0);
});
