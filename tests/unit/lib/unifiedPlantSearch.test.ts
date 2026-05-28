import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the module under test.
const rpcMock = vi.fn();
vi.mock("../../../src/lib/supabase", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));
vi.mock("../../../src/lib/plantProvider", () => ({
  searchAllProviders: vi.fn(),
}));
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  libraryRowToSelection,
  providerResultToSelection,
  searchLibrary,
  didYouMean,
  countActiveFilters,
} from "../../../src/lib/unifiedPlantSearch";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("countActiveFilters", () => {
  it("counts set filter dimensions", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ cycle: ["annual"] })).toBe(1);
    expect(countActiveFilters({ cycle: [], sunlight: ["full_sun"], edible: true })).toBe(2);
    expect(countActiveFilters({ edible: false, indoor: true, poisonous: false })).toBe(3);
  });
});

describe("searchLibrary with filters", () => {
  it("routes to the filtered RPC and passes only set filter keys", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await searchLibrary("", { filters: { edible: true, cycle: ["annual"], watering: [] } });
    expect(rpcMock).toHaveBeenCalledWith(
      "search_plant_library_relevance_filtered",
      expect.objectContaining({ p_query: "", p_filters: { edible: true, cycle: ["annual"] } }),
    );
  });

  it("returns empty without hitting the RPC when no query and no filters", async () => {
    const res = await searchLibrary("", { filters: {} });
    expect(res).toEqual({ rows: [], total: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("libraryRowToSelection", () => {
  it("maps a library row to a normalised selection", () => {
    const sel = libraryRowToSelection({
      id: 42,
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      thumbnail_url: "t.jpg",
    } as any);
    expect(sel).toMatchObject({
      source: "library",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      library_id: 42,
      thumbnail_url: "t.jpg",
    });
  });

  it("falls back to image_url when no thumbnail", () => {
    const sel = libraryRowToSelection({
      id: 1, common_name: "Basil", scientific_name: [], thumbnail_url: null, image_url: "i.jpg",
    } as any);
    expect(sel.thumbnail_url).toBe("i.jpg");
  });
});

describe("providerResultToSelection", () => {
  it("preserves provider source + ids", () => {
    const sel = providerResultToSelection({
      id: "x", common_name: "Sage", scientific_name: ["Salvia"], _provider: "verdantly", verdantly_id: "v1", thumbnail_url: null,
    } as any);
    expect(sel).toMatchObject({ source: "verdantly", common_name: "Sage", verdantly_id: "v1" });
  });
});

describe("searchLibrary", () => {
  it("returns empty for blank query without hitting the RPC", async () => {
    const res = await searchLibrary("  ");
    expect(res).toEqual({ rows: [], total: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps RPC rows + total_count", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { row_data: { id: 1, common_name: "Tomato" }, rank: 0, similarity_score: 1, total_count: 2 },
        { row_data: { id: 2, common_name: "Tomatillo" }, rank: 2, similarity_score: 0.5, total_count: 2 },
      ],
      error: null,
    });
    const res = await searchLibrary("tomato");
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("didYouMean", () => {
  it("returns [] for very short queries", async () => {
    expect(await didYouMean("ab")).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("dedupes, drops exact matches, and caps to the limit", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { row_data: { common_name: "rosemary" }, similarity_score: 0.9, total_count: 4 }, // exact (lowercased) — dropped
        { row_data: { common_name: "Rosemary Bush" }, similarity_score: 0.8, total_count: 4 },
        { row_data: { common_name: "Rosemary Bush" }, similarity_score: 0.7, total_count: 4 }, // dup — dropped
        { row_data: { common_name: "Rose" }, similarity_score: 0.6, total_count: 4 },
        { row_data: { common_name: "Rosehip" }, similarity_score: 0.5, total_count: 4 },
      ],
      error: null,
    });
    const out = await didYouMean("rosemary", 2);
    expect(out).toEqual(["Rosemary Bush", "Rose"]);
  });

  it("returns [] when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await didYouMean("lavender")).toEqual([]);
  });
});
