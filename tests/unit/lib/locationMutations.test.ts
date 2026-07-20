// locationMutations (stats+locations redesign Stage 4b) — the one place the
// home garden grid and LocationManager both call for location CRUD. These
// tests assert each function hits the right table / method / payload; the
// permission gating + orchestration is the caller's job (tested at the UI).
import { describe, test, expect, vi, beforeEach } from "vitest";

// vi.hoisted so the mock exists before the hoisted vi.mock factory runs.
const { calls, supabaseMock } = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; payload?: unknown; eqCol?: string; eqVal?: unknown }> = [];
  const supabaseMock = {
    from: vi.fn((table: string) => ({
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return Promise.resolve({ data: null, error: null });
      },
      update: (payload: unknown) => ({
        eq: (eqCol: string, eqVal: unknown) => {
          calls.push({ table, op: "update", payload, eqCol, eqVal });
          return Promise.resolve({ data: null, error: null });
        },
      }),
      delete: () => ({
        eq: (eqCol: string, eqVal: unknown) => {
          calls.push({ table, op: "delete", eqCol, eqVal });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    })),
  };
  return { calls, supabaseMock };
});

vi.mock("../../../src/lib/supabase", () => ({ supabase: supabaseMock }));

import {
  createLocation,
  renameLocation,
  setLocationEnvironment,
  deleteLocation,
} from "../../../src/lib/locationMutations";

beforeEach(() => {
  calls.length = 0;
  supabaseMock.from.mockClear();
});

describe("locationMutations", () => {
  test("createLocation inserts into locations with a trimmed name + is_outside + home_id", async () => {
    await createLocation({ name: "  Back Garden  ", isOutside: true, homeId: "home-1" });
    expect(calls).toEqual([
      { table: "locations", op: "insert", payload: [{ name: "Back Garden", is_outside: true, home_id: "home-1" }] },
    ]);
  });

  test("renameLocation updates name (trimmed) for the given id", async () => {
    await renameLocation("loc-1", "  Greenhouse  ");
    expect(calls).toEqual([
      { table: "locations", op: "update", payload: { name: "Greenhouse" }, eqCol: "id", eqVal: "loc-1" },
    ]);
  });

  test("setLocationEnvironment flips is_outside for the given id", async () => {
    await setLocationEnvironment("loc-2", false);
    expect(calls).toEqual([
      { table: "locations", op: "update", payload: { is_outside: false }, eqCol: "id", eqVal: "loc-2" },
    ]);
  });

  test("deleteLocation deletes the given id from locations", async () => {
    await deleteLocation("loc-3");
    expect(calls).toEqual([
      { table: "locations", op: "delete", eqCol: "id", eqVal: "loc-3" },
    ]);
  });
});
