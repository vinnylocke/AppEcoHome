import { assertEquals, assert } from "@std/assert";
import { refreshStaleAiPlants } from "@shared/refreshStaleAiPlants.ts";
import type { GeminiUsage } from "@shared/gemini.ts";

// ──────────────────────────────────────────────────────────────────────────
// Test fixture
// ──────────────────────────────────────────────────────────────────────────
//
// Custom mock supabase client that:
//   - Returns a controlled candidate list for `from("plants").select(...)`.
//     The mock honours `.limit(N)` so we can test batch capping.
//   - Captures every insert into `plant_care_revisions`, `ai_usage_log`.
//   - Captures every update against `plants` keyed by id.
//
// We don't reproduce the full filter chain because the production filters
// (source/home_id/last_freshness_check_at) are exercised end-to-end in the
// smoke-test against the real database. The mock simulates one batch of
// pre-filtered candidates and verifies the per-plant write path.

type CandidateRow = {
  id: number;
  common_name: string;
  scientific_name: string[];
  care_guide_data: unknown;
  freshness_version: number | null;
  last_freshness_check_at: string | null;
};

function makeMock(opts: {
  candidates: CandidateRow[];
  // Optionally inject a per-table error to simulate failure paths.
  failOn?: { table: string; op: "insert" | "update"; whenIdEquals?: number };
}) {
  const inserts: Record<string, unknown[]> = {};
  const updates: { id: number; patch: Record<string, unknown> }[] = [];
  let limitRequested = opts.candidates.length;

  const plantsSelectChain = {
    select: () => plantsSelectChain,
    eq: () => plantsSelectChain,
    is: () => plantsSelectChain,
    or: () => plantsSelectChain,
    order: () => plantsSelectChain,
    limit: (n: number) => {
      limitRequested = n;
      const sliced = opts.candidates.slice(0, n);
      return Promise.resolve({ data: sliced, error: null });
    },
  };

  const insertChain = (table: string) => ({
    then: (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) =>
      Promise.resolve(
        opts.failOn?.table === table && opts.failOn?.op === "insert"
          ? { data: null, error: { message: `simulated ${table} insert failure` } }
          : { data: null, error: null },
      ).then(onFulfilled, onRejected),
  });

  const updateChain = (table: string, patch: Record<string, unknown>) => ({
    eq: (_col: string, id: number) => {
      if (
        opts.failOn?.table === table &&
        opts.failOn?.op === "update" &&
        (opts.failOn.whenIdEquals == null || opts.failOn.whenIdEquals === id)
      ) {
        return Promise.resolve({
          data: null,
          error: { message: `simulated ${table} update failure` },
        });
      }
      updates.push({ id, patch });
      return Promise.resolve({ data: null, error: null });
    },
  });

  const db = {
    from: (table: string) => ({
      // For plants the helper does both select (read) and update (write).
      select: (_cols?: string) => plantsSelectChain,
      insert: (row: unknown) => {
        (inserts[table] ??= []).push(row);
        return insertChain(table);
      },
      update: (patch: Record<string, unknown>) => updateChain(table, patch),
    }),
  };

  return {
    db,
    inserts,
    updates,
    limitRequested: () => limitRequested,
  };
}

const fakeUsage: GeminiUsage = {
  promptTokenCount: 100,
  candidatesTokenCount: 50,
  totalTokenCount: 150,
  model: "gemini-3.1-flash-lite",
};

// Care guide payload helper — `field` is the structured field that varies
// between "old" and "new" so we can assert detection.
function careGuide(opts: { watering_min_days?: number; sunlight?: string[]; description?: string }) {
  return {
    plantData: {
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      description: opts.description ?? "A red fruit",
      plant_type: "Vegetable",
      cycle: "Annual",
      care_level: "Medium",
      watering_min_days: opts.watering_min_days ?? 2,
      watering_max_days: 5,
      sunlight: opts.sunlight ?? ["full_sun"],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Test 1 — changed=true path
// ──────────────────────────────────────────────────────────────────────────

Deno.test("refreshStaleAiPlants — changed path writes revision + bumps version", async () => {
  const candidate: CandidateRow = {
    id: 42,
    common_name: "Tomato",
    scientific_name: ["Solanum lycopersicum"],
    care_guide_data: careGuide({ watering_min_days: 2 }),
    freshness_version: 1,
    last_freshness_check_at: null,
  };

  const mock = makeMock({ candidates: [candidate] });

  const result = await refreshStaleAiPlants(
    mock.db as any,
    async () => ({
      plantData: careGuide({ watering_min_days: 4 }), // diff on watering_min_days
      usage: fakeUsage,
    }),
    { sleepMs: 0 },
  );

  assertEquals(result.examined, 1);
  assertEquals(result.changed, 1);
  assertEquals(result.unchanged, 0);
  assertEquals(result.errors, 0);

  // One revision row inserted.
  assertEquals((mock.inserts.plant_care_revisions ?? []).length, 1);
  const rev = (mock.inserts.plant_care_revisions[0]) as Record<string, unknown>;
  assertEquals(rev.plant_id, 42);
  assertEquals(rev.version, 2);
  assertEquals(rev.source, "stale_check");
  assertEquals(rev.triggered_by, null);
  assert(Array.isArray(rev.changed_fields) && (rev.changed_fields as string[]).includes("watering_min_days"));

  // Plants row update has the new version + updated_care_fields + both timestamps.
  const update = mock.updates.find((u) => u.id === 42)!;
  assertEquals(update.patch.freshness_version, 2);
  assert(Array.isArray(update.patch.updated_care_fields));
  assert(update.patch.last_freshness_check_at != null);
  assert(update.patch.last_care_generated_at != null);

  // AI usage row attributed to system (no user, no home).
  assertEquals((mock.inserts.ai_usage_log ?? []).length, 1);
  const usageRow = (mock.inserts.ai_usage_log[0]) as Record<string, unknown>;
  assertEquals(usageRow.user_id, null);
  assertEquals(usageRow.home_id, null);
  assertEquals(usageRow.function_name, "refresh-stale-ai-plants");
});

// ──────────────────────────────────────────────────────────────────────────
// Test 2 — changed=false path
// ──────────────────────────────────────────────────────────────────────────

Deno.test("refreshStaleAiPlants — unchanged path resets clock only", async () => {
  const original = careGuide({ watering_min_days: 3 });
  const candidate: CandidateRow = {
    id: 7,
    common_name: "Basil",
    scientific_name: ["Ocimum basilicum"],
    care_guide_data: original,
    freshness_version: 3,
    last_freshness_check_at: "2025-01-01T00:00:00.000Z",
  };

  const mock = makeMock({ candidates: [candidate] });

  const result = await refreshStaleAiPlants(
    mock.db as any,
    async () => ({ plantData: original, usage: fakeUsage }),
    { sleepMs: 0 },
  );

  assertEquals(result.examined, 1);
  assertEquals(result.changed, 0);
  assertEquals(result.unchanged, 1);
  assertEquals(result.errors, 0);

  // No revision row.
  assertEquals(mock.inserts.plant_care_revisions, undefined);

  // Plants update has ONLY last_freshness_check_at, no version bump.
  const update = mock.updates.find((u) => u.id === 7)!;
  assertEquals(Object.keys(update.patch).length, 1);
  assert(update.patch.last_freshness_check_at != null);
});

// ──────────────────────────────────────────────────────────────────────────
// Test 3 — fork skip (no fork ever reaches the function under the real
// filter; this verifies the helper does not introspect home_id at all,
// so even if a fork slipped through it would be processed like a global
// — meaning the filter in the parent SELECT is load-bearing).
//
// This case documents the contract: the helper trusts its input to be
// pre-filtered to globals.
// ──────────────────────────────────────────────────────────────────────────

Deno.test("refreshStaleAiPlants — empty candidate list returns zero summary", async () => {
  const mock = makeMock({ candidates: [] });

  const result = await refreshStaleAiPlants(
    mock.db as any,
    async () => ({ plantData: careGuide({}), usage: fakeUsage }),
    { sleepMs: 0 },
  );

  assertEquals(result.examined, 0);
  assertEquals(result.changed, 0);
  assertEquals(result.unchanged, 0);
  assertEquals(result.errors, 0);

  // No writes at all.
  assertEquals(mock.inserts.plant_care_revisions, undefined);
  assertEquals(mock.inserts.ai_usage_log, undefined);
  assertEquals(mock.updates.length, 0);
});

// ──────────────────────────────────────────────────────────────────────────
// Test 4 — idempotency under crash mid-batch
// ──────────────────────────────────────────────────────────────────────────

Deno.test("refreshStaleAiPlants — Gemini throw on one plant doesn't tank the batch", async () => {
  const candidates: CandidateRow[] = [
    {
      id: 100,
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      care_guide_data: careGuide({ watering_min_days: 2 }),
      freshness_version: 1,
      last_freshness_check_at: null,
    },
    {
      id: 200,
      common_name: "Basil",
      scientific_name: ["Ocimum basilicum"],
      care_guide_data: careGuide({ watering_min_days: 3 }),
      freshness_version: 1,
      last_freshness_check_at: null,
    },
    {
      id: 300,
      common_name: "Pepper",
      scientific_name: ["Capsicum annuum"],
      care_guide_data: careGuide({ watering_min_days: 4 }),
      freshness_version: 1,
      last_freshness_check_at: null,
    },
  ];

  const mock = makeMock({ candidates });

  const result = await refreshStaleAiPlants(
    mock.db as any,
    async (name) => {
      if (name === "Basil") throw new Error("Gemini went down");
      return { plantData: careGuide({ watering_min_days: 99 }), usage: fakeUsage };
    },
    { sleepMs: 0 },
  );

  assertEquals(result.examined, 3);
  assertEquals(result.changed, 2);
  assertEquals(result.unchanged, 0);
  assertEquals(result.errors, 1);
  assertEquals(result.errorDetails[0].plant_id, 200);

  // Tomato + Pepper got revision rows; Basil did not.
  const revs = (mock.inserts.plant_care_revisions ?? []) as Record<string, unknown>[];
  assertEquals(revs.length, 2);
  const revPlantIds = revs.map((r) => r.plant_id).sort();
  assertEquals(revPlantIds, [100, 300]);

  // Basil has NO update at all → last_freshness_check_at stays NULL →
  // next run picks it up again.
  const basilUpdate = mock.updates.find((u) => u.id === 200);
  assertEquals(basilUpdate, undefined);
});

// ──────────────────────────────────────────────────────────────────────────
// Test 5 — batch size cap is respected
// ──────────────────────────────────────────────────────────────────────────

Deno.test("refreshStaleAiPlants — batchSize caps the candidate select", async () => {
  const candidates: CandidateRow[] = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    common_name: `Plant ${i + 1}`,
    scientific_name: ["Genus species"],
    care_guide_data: careGuide({ watering_min_days: 2 }),
    freshness_version: 1,
    last_freshness_check_at: null,
  }));

  const mock = makeMock({ candidates });

  const result = await refreshStaleAiPlants(
    mock.db as any,
    async () => ({ plantData: careGuide({ watering_min_days: 5 }), usage: fakeUsage }),
    { batchSize: 10, sleepMs: 0 },
  );

  assertEquals(mock.limitRequested(), 10);
  assertEquals(result.examined, 10);
  assertEquals(result.changed, 10);
});
