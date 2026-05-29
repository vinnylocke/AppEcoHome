import { describe, it, expect, vi, beforeEach } from "vitest";

const searchLibraryMock = vi.fn();
const searchAllProvidersMock = vi.fn();
const getProviderPlantDetailsMock = vi.fn();
const libraryRowToPlantDetailsMock = vi.fn();

vi.mock("../../../src/lib/unifiedPlantSearch", () => ({
  searchLibrary: (...a: any[]) => searchLibraryMock(...a),
}));
vi.mock("../../../src/lib/plantProvider", () => ({
  searchAllProviders: (...a: any[]) => searchAllProvidersMock(...a),
  getProviderPlantDetails: (...a: any[]) => getProviderPlantDetailsMock(...a),
}));
vi.mock("../../../src/lib/plantCatalogue", () => ({
  libraryRowToPlantDetails: (...a: any[]) => libraryRowToPlantDetailsMock(...a),
}));

import { resolvePlantInfo } from "../../../src/lib/plantInfoResolver";

beforeEach(() => {
  searchLibraryMock.mockReset();
  searchAllProvidersMock.mockReset();
  getProviderPlantDetailsMock.mockReset();
  libraryRowToPlantDetailsMock.mockReset();
});

describe("resolvePlantInfo", () => {
  it("uses a library hit first and never touches providers", async () => {
    searchLibraryMock.mockResolvedValue({ rows: [{ id: 42 }], total: 1 });
    libraryRowToPlantDetailsMock.mockReturnValue({ common_name: "Basil", thumbnail_url: "t.jpg" });

    const r = await resolvePlantInfo("Basil");
    expect(r.details).toEqual({ common_name: "Basil", thumbnail_url: "t.jpg" });
    expect(r.result).toMatchObject({ id: "library-42", _provider: "ai", plant_library_id: 42 });
    expect(searchAllProvidersMock).not.toHaveBeenCalled();
  });

  it("falls back to a provider (no AI) on a library miss, preferring Verdantly", async () => {
    searchLibraryMock.mockResolvedValue({ rows: [], total: 0 });
    searchAllProvidersMock.mockResolvedValue([
      { id: 5, common_name: "Sage", _provider: "perenual", perenual_id: 5 },
      { id: "v9", common_name: "Sage", _provider: "verdantly", verdantly_id: "v9" },
    ]);
    getProviderPlantDetailsMock.mockResolvedValue({ common_name: "Sage" });

    const r = await resolvePlantInfo("Sage");
    expect(getProviderPlantDetailsMock).toHaveBeenCalledWith({ source: "verdantly", perenual_id: null, verdantly_id: "v9" });
    expect(r.details).toEqual({ common_name: "Sage" });
    expect(r.result._provider).toBe("verdantly");
  });

  it("resolves to an AI-by-name result when nothing is found", async () => {
    searchLibraryMock.mockResolvedValue({ rows: [], total: 0 });
    searchAllProvidersMock.mockResolvedValue([]);

    const r = await resolvePlantInfo("Unknownia");
    expect(r.details).toBeNull();
    expect(r.result).toMatchObject({ id: "ai-Unknownia", _provider: "ai", common_name: "Unknownia" });
  });

  it("never throws when the library RPC errors — falls through to provider/AI", async () => {
    searchLibraryMock.mockRejectedValue(new Error("rpc down"));
    searchAllProvidersMock.mockResolvedValue([]);

    const r = await resolvePlantInfo("X");
    expect(r.details).toBeNull();
    expect(r.result._provider).toBe("ai");
  });
});
