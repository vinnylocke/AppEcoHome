import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted so they are available inside vi.mock factories) ───────────

const {
  mockPerenualSearch,
  mockPerenualDetails,
  mockVerdantlySearch,
  mockVerdantlyDetails,
  mockMaybeSingle,
} = vi.hoisted(() => ({
  mockPerenualSearch: vi.fn(),
  mockPerenualDetails: vi.fn(),
  mockVerdantlySearch: vi.fn(),
  mockVerdantlyDetails: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock("../../../src/lib/perenualService", () => ({
  PerenualService: {
    searchPlants: mockPerenualSearch,
    getPlantDetails: mockPerenualDetails,
  },
}));

vi.mock("../../../src/lib/verdantlyService", () => ({
  VerdantlyService: {
    searchPlants: mockVerdantlySearch,
    getPlantDetails: mockVerdantlyDetails,
  },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  },
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { searchAllProviders, getProviderPlantDetails } from "../../../src/lib/plantProvider";

// ─── Helpers ─────────────────────────────────="────────────────────────────────

function perenualItem(name: string, id = 1) {
  return { id, common_name: name, scientific_name: ["sp."], default_image: null };
}

function verdantlyResult(name: string, id = "v1") {
  return { id, common_name: name, scientific_name: [], thumbnail_url: null, _provider: "verdantly" as const, verdantly_id: id };
}

// ─── searchAllProviders ───────────────────────────────────────────────────────

describe("searchAllProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns merged results from both providers when both enabled", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: { enabled: ["perenual", "verdantly"] } } });
    mockPerenualSearch.mockResolvedValue([perenualItem("Tomato", 1)]);
    mockVerdantlySearch.mockResolvedValue({ results: [verdantlyResult("Tomato", "v1")], hasMore: false, nextPage: 2 });

    const results = await searchAllProviders("Tomato");

    expect(results).toHaveLength(2);
    expect(results.some((r) => r._provider === "perenual")).toBe(true);
    expect(results.some((r) => r._provider === "verdantly")).toBe(true);
  });

  test("does not call VerdantlyService when only perenual is enabled", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: { enabled: ["perenual"] } } });
    mockPerenualSearch.mockResolvedValue([perenualItem("Basil", 2)]);

    const results = await searchAllProviders("Basil");

    expect(mockVerdantlySearch).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]._provider).toBe("perenual");
  });

  test("defaults to perenual-only when app_config has no value", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockPerenualSearch.mockResolvedValue([perenualItem("Rose", 3)]);

    const results = await searchAllProviders("Rose");

    expect(mockVerdantlySearch).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  test("each result carries the correct _provider tag", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: { enabled: ["perenual", "verdantly"] } } });
    mockPerenualSearch.mockResolvedValue([perenualItem("Mint", 4)]);
    mockVerdantlySearch.mockResolvedValue({ results: [verdantlyResult("Peppermint", "v2")], hasMore: false, nextPage: 2 });

    const results = await searchAllProviders("Mint");
    const providers = results.map((r) => r._provider);

    expect(providers).toContain("perenual");
    expect(providers).toContain("verdantly");
  });

  test("still returns Perenual results when Verdantly throws", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: { enabled: ["perenual", "verdantly"] } } });
    mockPerenualSearch.mockResolvedValue([perenualItem("Fern", 5)]);
    mockVerdantlySearch.mockRejectedValue(new Error("Network error"));

    const results = await searchAllProviders("Fern");

    // Verdantly error is swallowed by the .catch(() => []) inside searchAllProviders
    expect(results.some((r) => r._provider === "perenual")).toBe(true);
  });
});

// ─── getProviderPlantDetails ──────────────────────────────────────────────────

describe("getProviderPlantDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("dispatches to VerdantlyService when source is 'verdantly'", async () => {
    const mockDetails = { common_name: "Tomato", source: "verdantly" };
    mockVerdantlyDetails.mockResolvedValue(mockDetails);

    const result = await getProviderPlantDetails({ source: "verdantly", verdantly_id: "v123" });

    expect(mockVerdantlyDetails).toHaveBeenCalledWith("v123");
    expect(result).toBe(mockDetails);
  });

  test("dispatches to PerenualService when source is 'api'", async () => {
    const mockDetails = { common_name: "Lavender", source: "api" };
    mockPerenualDetails.mockResolvedValue(mockDetails);

    const result = await getProviderPlantDetails({ source: "api", perenual_id: 42 });

    expect(mockPerenualDetails).toHaveBeenCalledWith(42);
    expect(result).toBe(mockDetails);
  });

  test("dispatches to PerenualService when source is 'perenual'", async () => {
    const mockDetails = { common_name: "Rose", source: "perenual" };
    mockPerenualDetails.mockResolvedValue(mockDetails);

    const result = await getProviderPlantDetails({ source: "perenual", perenual_id: 99 });

    expect(mockPerenualDetails).toHaveBeenCalledWith(99);
    expect(result).toBe(mockDetails);
  });

  test("throws for unknown source", async () => {
    await expect(
      getProviderPlantDetails({ source: "manual" }),
    ).rejects.toThrow("Cannot load plant details");
  });
});
