import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ────────────────────────────────────────────────────────────────────────
// Supabase mock — supports the exact chain shape the hook uses:
//   .from(table).select(cols).in(col, values)
//   .from("user_plant_ack").upsert(row, opts)
//   supabase.auth.getUser()
// ────────────────────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

const supabaseState: {
  plants: AnyRow[];
  user_plant_ack: AnyRow[];
  userId: string | null;
  upserts: { row: AnyRow; opts: Record<string, unknown> }[];
} = {
  plants: [],
  user_plant_ack: [],
  userId: "user-1",
  upserts: [],
};

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols: string) => ({
        in: (col: string, values: unknown[]) => {
          if (table === "plants") {
            const data = supabaseState.plants.filter((r) =>
              values.includes(r[col] as never),
            );
            return Promise.resolve({ data, error: null });
          }
          if (table === "user_plant_ack") {
            const data = supabaseState.user_plant_ack.filter((r) =>
              values.includes(r[col] as never),
            );
            return Promise.resolve({ data, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      }),
      upsert: (row: AnyRow, opts: Record<string, unknown>) => {
        if (table === "user_plant_ack") {
          supabaseState.upserts.push({ row, opts });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: supabaseState.userId ? { id: supabaseState.userId } : null },
          error: null,
        }),
    },
  },
}));

// Logger mock — silence error output during tests.
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: {
    error: vi.fn(),
  },
}));

import { useAiPlantFreshness } from "../../../src/hooks/useAiPlantFreshness";

beforeEach(() => {
  supabaseState.plants = [];
  supabaseState.user_plant_ack = [];
  supabaseState.userId = "user-1";
  supabaseState.upserts = [];
});

// ────────────────────────────────────────────────────────────────────────

describe("useAiPlantFreshness", () => {
  test("global AI plant with newer freshness than ack → has_update=true", async () => {
    supabaseState.plants = [
      {
        id: 100,
        freshness_version: 3,
        updated_care_fields: ["watering_min_days", "sunlight"],
        last_care_generated_at: "2026-05-01T00:00:00Z",
      },
    ];
    supabaseState.user_plant_ack = [
      { plant_id: 100, seen_freshness_version: 1 },
    ];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        { id: 100, source: "ai", forked_from_plant_id: null, overridden_fields: [] },
      ]),
    );

    await waitFor(() => expect(result.current.byPlantId[100]).not.toBeUndefined());

    const entry = result.current.byPlantId[100]!;
    expect(entry.global_plant_id).toBe(100);
    expect(entry.has_update).toBe(true);
    expect(entry.freshness_version).toBe(3);
    expect(entry.seen_version).toBe(1);
    expect(entry.updated_care_fields).toEqual(["watering_min_days", "sunlight"]);
  });

  test("shallow fork resolves via forked_from_plant_id to the global", async () => {
    // home-scoped row 7 → global 100
    supabaseState.plants = [
      {
        id: 100,
        freshness_version: 2,
        updated_care_fields: ["cycle"],
        last_care_generated_at: "2026-04-01T00:00:00Z",
      },
    ];
    supabaseState.user_plant_ack = [];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        { id: 7, source: "ai", forked_from_plant_id: 100, overridden_fields: [] },
      ]),
    );

    await waitFor(() => expect(result.current.byPlantId[7]).not.toBeUndefined());

    const entry = result.current.byPlantId[7]!;
    // Resolves to the GLOBAL, not the input row id.
    expect(entry.global_plant_id).toBe(100);
    expect(entry.has_update).toBe(true);
    expect(entry.seen_version).toBe(0); // No ack row → 0
  });

  test("deep fork (overridden_fields non-empty) returns null", async () => {
    supabaseState.plants = [
      { id: 100, freshness_version: 9, updated_care_fields: [], last_care_generated_at: null },
    ];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        { id: 8, source: "ai", forked_from_plant_id: 100, overridden_fields: ["watering_min_days"] },
      ]),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byPlantId[8]).toBeNull();
  });

  test("non-AI plant returns null", async () => {
    const { result } = renderHook(() =>
      useAiPlantFreshness([
        { id: 50, source: "verdantly", forked_from_plant_id: null, overridden_fields: [] },
        { id: 51, source: "api", forked_from_plant_id: null, overridden_fields: [] },
        { id: 52, source: "manual", forked_from_plant_id: null, overridden_fields: null },
      ]),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byPlantId[50]).toBeNull();
    expect(result.current.byPlantId[51]).toBeNull();
    expect(result.current.byPlantId[52]).toBeNull();
  });

  test("acknowledge() upserts user_plant_ack keyed by the GLOBAL plant_id", async () => {
    supabaseState.plants = [
      { id: 100, freshness_version: 4, updated_care_fields: ["sunlight"], last_care_generated_at: null },
    ];
    supabaseState.user_plant_ack = [{ plant_id: 100, seen_freshness_version: 2 }];
    supabaseState.userId = "user-7";

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        // home-scoped shallow fork: input id is 9, global is 100
        { id: 9, source: "ai", forked_from_plant_id: 100, overridden_fields: [] },
      ]),
    );

    await waitFor(() => expect(result.current.byPlantId[9]?.has_update).toBe(true));

    await act(async () => {
      await result.current.byPlantId[9]!.acknowledge();
    });

    expect(supabaseState.upserts).toHaveLength(1);
    const upserted = supabaseState.upserts[0].row;
    expect(upserted.user_id).toBe("user-7");
    // The upsert targets the GLOBAL plant_id (100), NOT the input row id (9).
    expect(upserted.plant_id).toBe(100);
    expect(upserted.seen_freshness_version).toBe(4);
    expect(supabaseState.upserts[0].opts.onConflict).toBe("user_id,plant_id");

    // Optimistic local clear.
    expect(result.current.byPlantId[9]?.has_update).toBe(false);
    expect(result.current.byPlantId[9]?.seen_version).toBe(4);
  });

  test("empty input returns empty map and loading false", async () => {
    const { result } = renderHook(() => useAiPlantFreshness([]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byPlantId).toEqual({});
  });

  test("global parent row missing (deleted / RLS blocked) → null entry", async () => {
    // Plant 9 claims to fork from 100, but 100 doesn't exist in supabaseState.plants.
    supabaseState.plants = [];
    supabaseState.user_plant_ack = [];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        { id: 9, source: "ai", forked_from_plant_id: 100, overridden_fields: [] },
      ]),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byPlantId[9]).toBeNull();
  });

  test("orphan home-scoped AI (home_id set, no forked_from) returns null", async () => {
    // Simulates a plant added before Wave 2's catalogue-write was active, or
    // when the catalogue-insert race-recovery failed. The row is AI + lives
    // in a home but has no global parent link → no chip, no refresh button.
    supabaseState.plants = [];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        {
          id: 42,
          source: "ai",
          home_id: "home-abc",
          forked_from_plant_id: null,
          overridden_fields: [],
        },
      ]),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byPlantId[42]).toBeNull();
  });

  test("true global AI (home_id null, no forked_from) resolves to itself", async () => {
    // Defensive — confirms the pure-global case still works after the
    // home_id-aware resolveGlobalId change.
    supabaseState.plants = [
      {
        id: 200,
        freshness_version: 2,
        updated_care_fields: ["cycle"],
        last_care_generated_at: null,
      },
    ];
    supabaseState.user_plant_ack = [{ plant_id: 200, seen_freshness_version: 1 }];

    const { result } = renderHook(() =>
      useAiPlantFreshness([
        {
          id: 200,
          source: "ai",
          home_id: null,
          forked_from_plant_id: null,
          overridden_fields: [],
        },
      ]),
    );

    await waitFor(() => expect(result.current.byPlantId[200]?.has_update).toBe(true));

    expect(result.current.byPlantId[200]?.global_plant_id).toBe(200);
  });
});
