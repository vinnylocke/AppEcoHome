import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// In-memory state for the Supabase mock.
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Array<{
      id: string;
      home_id: string;
      inventory_item_id: string | null;
      subject: string;
      description: string | null;
      image_url: string | null;
      created_at: string;
    }>,
    lastUpdate: null as { id: string; patch: Record<string, unknown> } | null,
    lastDelete: null as string | null,
    forceError: false as boolean | string,
  },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plant_journals") {
        throw new Error(`unexpected table ${table}`);
      }
      // SELECT chain
      const selectBuilder = () => ({
        eq: (_col: string, _val: unknown) => selectBuilder(),
        is: (_col: string, _val: unknown) => selectBuilder(),
        order: (_col: string, _opts: unknown) => selectBuilder(),
        limit: (_n: number) => {
          if (state.forceError) {
            return Promise.resolve({
              data: null,
              error: { message: typeof state.forceError === "string" ? state.forceError : "boom" },
            });
          }
          // Return rows with home_id matching the filter applied (we just return all unassigned in test fixtures).
          const data = state.rows
            .filter((r) => r.inventory_item_id === null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((r) => ({
              id: r.id,
              subject: r.subject,
              description: r.description,
              image_url: r.image_url,
              created_at: r.created_at,
            }));
          return Promise.resolve({ data, error: null });
        },
      });

      return {
        select: () => selectBuilder(),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            const row = state.rows.find((r) => r.id === id);
            if (row) Object.assign(row, patch);
            state.lastUpdate = { id, patch };
            return Promise.resolve({ data: null, error: null });
          },
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            state.rows = state.rows.filter((r) => r.id !== id);
            state.lastDelete = id;
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    },
  },
}));

vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn() },
}));

import { useUnassignedJournals } from "../../../src/hooks/useUnassignedJournals";

beforeEach(() => {
  state.rows = [
    {
      id: "j1",
      home_id: "home-1",
      inventory_item_id: null,
      subject: "Capture · 18 May, 09:00",
      description: "Yellow spots on tomato",
      image_url: "https://example.com/a.jpg",
      created_at: "2026-05-18T09:00:00Z",
    },
    {
      id: "j2",
      home_id: "home-1",
      inventory_item_id: null,
      subject: "Capture · 19 May, 10:30",
      description: null,
      image_url: "https://example.com/b.jpg",
      created_at: "2026-05-19T10:30:00Z",
    },
    {
      id: "j3-assigned",
      home_id: "home-1",
      inventory_item_id: "inv-1",
      subject: "Already assigned",
      description: "Not in the unassigned list",
      image_url: null,
      created_at: "2026-05-17T08:00:00Z",
    },
  ];
  state.lastUpdate = null;
  state.lastDelete = null;
  state.forceError = false;
});

describe("useUnassignedJournals", () => {
  test("returns unassigned entries newest-first", async () => {
    const { result } = renderHook(() => useUnassignedJournals("home-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.id)).toEqual(["j2", "j1"]);
    expect(result.current.entries.find((e) => e.id === "j3-assigned")).toBeUndefined();
  });

  test("returns empty list + not loading when homeId is null", async () => {
    const { result } = renderHook(() => useUnassignedJournals(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  test("assign updates inventory_item_id and removes from local state", async () => {
    const { result } = renderHook(() => useUnassignedJournals("home-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.assign("j1", "inv-99");
    });

    expect(state.lastUpdate).toEqual({ id: "j1", patch: { inventory_item_id: "inv-99" } });
    expect(result.current.entries.map((e) => e.id)).toEqual(["j2"]);
  });

  test("remove deletes the row and removes from local state", async () => {
    const { result } = renderHook(() => useUnassignedJournals("home-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("j2");
    });

    expect(state.lastDelete).toBe("j2");
    expect(result.current.entries.map((e) => e.id)).toEqual(["j1"]);
  });

  test("refresh re-fetches and reflects new rows", async () => {
    const { result } = renderHook(() => useUnassignedJournals("home-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    state.rows.push({
      id: "j4",
      home_id: "home-1",
      inventory_item_id: null,
      subject: "Capture · 20 May, 11:00",
      description: null,
      image_url: null,
      created_at: "2026-05-20T11:00:00Z",
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.entries.map((e) => e.id)).toEqual(["j4", "j2", "j1"]);
  });

  test("surfaces error message when fetch fails", async () => {
    state.forceError = "RLS denied";
    const { result } = renderHook(() => useUnassignedJournals("home-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("RLS denied");
    expect(result.current.entries).toEqual([]);
  });
});
