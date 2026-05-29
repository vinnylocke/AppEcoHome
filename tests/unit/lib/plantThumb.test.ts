import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the module under test.
const invokeMock = vi.fn();
vi.mock("../../../src/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: any[]) => invokeMock(...args) } },
}));

import { isUsablePlantImageUrl, resolvePlantThumbUrl } from "../../../src/lib/plantThumb";

beforeEach(() => {
  invokeMock.mockReset();
});

describe("isUsablePlantImageUrl", () => {
  it("rejects empty / null / non-string values", () => {
    expect(isUsablePlantImageUrl(null)).toBe(false);
    expect(isUsablePlantImageUrl(undefined)).toBe(false);
    expect(isUsablePlantImageUrl("")).toBe(false);
    expect(isUsablePlantImageUrl("   ")).toBe(false);
  });

  it("rejects the Perenual upgrade_access placeholder", () => {
    expect(
      isUsablePlantImageUrl("https://perenual.com/storage/image/upgrade_access.jpg"),
    ).toBe(false);
  });

  it("accepts a real image URL", () => {
    expect(isUsablePlantImageUrl("https://example.com/tomato.jpg")).toBe(true);
  });
});

describe("resolvePlantThumbUrl", () => {
  it("returns the first usable thumb from plant-image-search (count:1)", async () => {
    invokeMock.mockResolvedValue({
      data: { images: [{ thumb_url: "https://img/x.jpg" }] },
      error: null,
    });
    const url = await resolvePlantThumbUrl("Aloe Vera Test One");
    expect(url).toBe("https://img/x.jpg");
    expect(invokeMock).toHaveBeenCalledWith("plant-image-search", {
      body: { query: "Aloe Vera Test One", count: 1 },
    });
  });

  it("returns null on an edge-function error", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await resolvePlantThumbUrl("Errplant Unique")).toBeNull();
  });

  it("returns null when no images come back", async () => {
    invokeMock.mockResolvedValue({ data: { images: [] }, error: null });
    expect(await resolvePlantThumbUrl("Empty Plant Unique")).toBeNull();
  });

  it("rejects an upgrade_access thumb from the function", async () => {
    invokeMock.mockResolvedValue({
      data: { images: [{ thumb_url: "x/upgrade_access.jpg" }] },
      error: null,
    });
    expect(await resolvePlantThumbUrl("Paywall Plant Unique")).toBeNull();
  });

  it("never throws when invoke rejects", async () => {
    invokeMock.mockRejectedValue(new Error("network"));
    expect(await resolvePlantThumbUrl("Throwy Plant Unique")).toBeNull();
  });

  it("dedupes concurrent calls for the same name into one edge-fn call", async () => {
    invokeMock.mockResolvedValue({
      data: { images: [{ thumb_url: "https://img/dedupe.jpg" }] },
      error: null,
    });
    const [a, b] = await Promise.all([
      resolvePlantThumbUrl("Dedupe Plant Unique"),
      resolvePlantThumbUrl("Dedupe Plant Unique"),
    ]);
    expect(a).toBe("https://img/dedupe.jpg");
    expect(b).toBe("https://img/dedupe.jpg");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("returns null without calling the function for an empty name", async () => {
    expect(await resolvePlantThumbUrl("   ")).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
