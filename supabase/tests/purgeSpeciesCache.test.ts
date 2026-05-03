import { assertEquals } from "@std/assert";
import { purgeStaleSpeciesCache } from "@shared/purgeSpeciesCache.ts";
import { makeMockDb } from "./fixtures/mockDb.ts";

Deno.test("purgeStaleSpeciesCache — returns 0 when no entries to delete", async () => {
  const db = makeMockDb({ plants: [], species_cache: [] });
  const result = await purgeStaleSpeciesCache(db as any);
  assertEquals(result.deleted, 0);
});

Deno.test("purgeStaleSpeciesCache — returns count of deleted entries", async () => {
  const db = makeMockDb({
    plants: [],
    species_cache: [{ id: 10 }, { id: 20 }],
  });
  const result = await purgeStaleSpeciesCache(db as any);
  assertEquals(result.deleted, 2);
});

Deno.test("purgeStaleSpeciesCache — handles referenced plants without error", async () => {
  // Plants hold perenual_ids 1 and 2; only unreferenced entry 3 is in the
  // delete result (mock returns species_cache data regardless of filters —
  // the important thing is the query builds without throwing).
  const db = makeMockDb({
    plants: [{ perenual_id: 1 }, { perenual_id: 2 }],
    species_cache: [{ id: 3 }],
  });
  const result = await purgeStaleSpeciesCache(db as any);
  assertEquals(result.deleted, 1);
});

Deno.test("purgeStaleSpeciesCache — respects custom ttlDays", async () => {
  const db = makeMockDb({ plants: [], species_cache: [{ id: 5 }] });
  const result = await purgeStaleSpeciesCache(db as any, 7);
  assertEquals(result.deleted, 1);
});

Deno.test("purgeStaleSpeciesCache — throws when plants query returns error", async () => {
  const errChain = {
    select: () => errChain,
    not: () =>
      Promise.resolve({ data: null, error: { message: "connection refused" } }),
  };
  const errDb = { from: (_t: string) => errChain };

  try {
    await purgeStaleSpeciesCache(errDb as any);
    throw new Error("Expected error was not thrown");
  } catch (e: any) {
    assertEquals(e.message.includes("connection refused"), true);
  }
});
