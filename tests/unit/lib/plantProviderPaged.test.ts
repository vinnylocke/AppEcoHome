// searchAllProvidersPaged (2026-07-22) — the per-provider cursor bookkeeping
// behind the external-results infinite scroll. These tests pin: first-page
// fan-out (+AI only on page one), cursor advancement, exhausted providers being
// skipped, per-provider failure downgrading to hasMore=false (never rejecting),
// and the enabled-providers config being respected.
import { describe, test, expect, vi, beforeEach } from "vitest";

const { perenualPagedMock, verdantlyMock, aiMock, configMock } = vi.hoisted(() => ({
  perenualPagedMock: vi.fn(),
  verdantlyMock: vi.fn(),
  aiMock: vi.fn(),
  configMock: vi.fn(),
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: configMock }),
      }),
    }),
  },
}));
vi.mock("../../../src/lib/perenualService", () => ({
  PerenualService: { searchPlantsPaged: perenualPagedMock, searchPlants: vi.fn() },
}));
vi.mock("../../../src/lib/verdantlyService", () => ({
  VerdantlyService: { searchPlants: verdantlyMock },
}));
vi.mock("../../../src/services/plantDoctorService", () => ({
  PlantDoctorService: { searchPlantsText: aiMock },
}));

import { searchAllProvidersPaged, cursorHasMore } from "../../../src/lib/plantProvider";

const perenualItem = (id: number) => ({ id, common_name: `Perenual ${id}`, scientific_name: [], default_image: null });
const verdantlyItem = (id: string) => ({
  id, common_name: `Verdantly ${id}`, scientific_name: [], thumbnail_url: null,
  _provider: "verdantly" as const, verdantly_id: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  configMock.mockResolvedValue({ data: { value: { enabled: ["perenual", "verdantly"] } } });
  perenualPagedMock.mockResolvedValue({ data: [perenualItem(1)], hasMore: true, nextPage: 2 });
  verdantlyMock.mockResolvedValue({ results: [verdantlyItem("v1")], hasMore: true, nextPage: 2 });
  aiMock.mockResolvedValue({ matches: ["AI Plant"], hits: {} });
});

describe("searchAllProvidersPaged", () => {
  test("first page (null cursor) fetches page 1 of both providers and merges results", async () => {
    const { results, cursor } = await searchAllProvidersPaged("lavender", null);
    expect(perenualPagedMock).toHaveBeenCalledWith("lavender", 1);
    expect(verdantlyMock).toHaveBeenCalledWith("lavender", 1);
    expect(results.map((r) => r._provider).sort()).toEqual(["perenual", "verdantly"]);
    expect(cursor).toEqual({
      perenual: { nextPage: 2, hasMore: true },
      verdantly: { nextPage: 2, hasMore: true },
    });
    expect(cursorHasMore(cursor)).toBe(true);
  });

  test("a returned cursor fetches each provider's next page", async () => {
    const { cursor: first } = await searchAllProvidersPaged("lavender", null);
    perenualPagedMock.mockResolvedValue({ data: [perenualItem(2)], hasMore: false, nextPage: 3 });
    verdantlyMock.mockResolvedValue({ results: [verdantlyItem("v2")], hasMore: true, nextPage: 3 });

    const { cursor } = await searchAllProvidersPaged("lavender", first);
    expect(perenualPagedMock).toHaveBeenLastCalledWith("lavender", 2);
    expect(verdantlyMock).toHaveBeenLastCalledWith("lavender", 2);
    expect(cursor.perenual).toEqual({ nextPage: 3, hasMore: false });
    expect(cursor.verdantly).toEqual({ nextPage: 3, hasMore: true });
    expect(cursorHasMore(cursor)).toBe(true);
  });

  test("an exhausted provider is not called again; both exhausted retires the cursor", async () => {
    const cursor = {
      perenual: { nextPage: 3, hasMore: false },
      verdantly: { nextPage: 2, hasMore: true },
    };
    verdantlyMock.mockResolvedValue({ results: [], hasMore: false, nextPage: 3 });

    const { cursor: next } = await searchAllProvidersPaged("lavender", cursor);
    expect(perenualPagedMock).not.toHaveBeenCalled();
    expect(verdantlyMock).toHaveBeenCalledWith("lavender", 2);
    expect(cursorHasMore(next)).toBe(false);
  });

  test("a provider failure yields no rows and hasMore=false for it, without rejecting", async () => {
    verdantlyMock.mockRejectedValue(new Error("verdantly down"));
    const { results, cursor } = await searchAllProvidersPaged("lavender", null);
    expect(results.every((r) => r._provider === "perenual")).toBe(true);
    expect(cursor.verdantly.hasMore).toBe(false);
    expect(cursor.perenual.hasMore).toBe(true);
  });

  test("the AI branch runs only on the first page", async () => {
    await searchAllProvidersPaged("lavender", null, undefined, { includeAi: true, homeId: "h1" });
    expect(aiMock).toHaveBeenCalledTimes(1);

    aiMock.mockClear();
    await searchAllProvidersPaged(
      "lavender",
      { perenual: { nextPage: 2, hasMore: true }, verdantly: { nextPage: 2, hasMore: true } },
      undefined,
      { includeAi: true, homeId: "h1" },
    );
    expect(aiMock).not.toHaveBeenCalled();
  });

  test("providers disabled in config (or excluded via `only`) are never called and report no more pages", async () => {
    configMock.mockResolvedValue({ data: { value: { enabled: ["perenual"] } } });
    const { cursor } = await searchAllProvidersPaged("lavender", null);
    expect(verdantlyMock).not.toHaveBeenCalled();
    expect(cursor.verdantly.hasMore).toBe(false);

    vi.clearAllMocks();
    configMock.mockResolvedValue({ data: { value: { enabled: ["perenual", "verdantly"] } } });
    perenualPagedMock.mockResolvedValue({ data: [], hasMore: false, nextPage: 2 });
    verdantlyMock.mockResolvedValue({ results: [], hasMore: false, nextPage: 2 });
    const { cursor: onlyVer } = await searchAllProvidersPaged("lavender", null, ["verdantly"]);
    expect(perenualPagedMock).not.toHaveBeenCalled();
    expect(onlyVer.perenual.hasMore).toBe(false);
  });
});
