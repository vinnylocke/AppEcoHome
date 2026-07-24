import { describe, it, expect } from "vitest";
import { libraryRowToSwipePlant, verdantlyResultToSwipePlant } from "../../../src/lib/librarySwipePlant";

describe("libraryRowToSwipePlant", () => {
  it("maps identity + image + source", () => {
    const p = libraryRowToSwipePlant({
      id: 42,
      common_name: "English Lavender",
      scientific_name: ["Lavandula angustifolia"],
      thumbnail_url: "http://x/thumb.jpg",
      image_url: "http://x/full.jpg",
    });
    expect(p.id).toBe("lib-42");
    expect(p.name).toBe("English Lavender");
    expect(p.scientific_name).toBe("Lavandula angustifolia");
    expect(p.source).toBe("library");
    expect(p.thumbnail).toBe("http://x/thumb.jpg");
    expect(p.image_query).toBe("English Lavender");
  });

  it("derives trait tags from structured columns", () => {
    const p = libraryRowToSwipePlant({
      id: 1,
      common_name: "Sea Holly",
      cycle: "Perennial",
      watering: "Frequent",
      sunlight: ["full sun"],
      drought_tolerant: true,
      is_edible: false,
      care_level: "low",
      attracts: ["Bees", "Butterflies"],
    });
    expect(p.tags).toContain("drought-tolerant");
    expect(p.tags).toContain("water-hungry");
    expect(p.tags).toContain("full-sun");
    expect(p.tags).toContain("perennial");
    expect(p.tags).toContain("low-maintenance");
    expect(p.tags).toContain("pollinator-friendly");
    expect(p.tags).not.toContain("edible");
    expect(p.tags.length).toBeLessThanOrEqual(6);
  });

  it("uses the description's first sentence as the tagline when present", () => {
    const p = libraryRowToSwipePlant({
      id: 2,
      common_name: "Foxglove",
      description: "A tall cottage-garden favourite. Loved by bees; toxic if eaten.",
    });
    expect(p.tagline).toBe("A tall cottage-garden favourite.");
  });

  it("falls back to a care-built tagline when there's no description", () => {
    const p = libraryRowToSwipePlant({
      id: 3,
      common_name: "Aloe",
      cycle: "Perennial",
      watering: "Minimum",
    });
    expect(p.tagline).toMatch(/perennial plant that needs minimum watering/i);
  });

  it("handles missing/odd fields without throwing", () => {
    const p = libraryRowToSwipePlant({ id: 4, common_name: "Mystery Plant" } as any);
    expect(p.name).toBe("Mystery Plant");
    expect(p.scientific_name).toBe("");
    expect(Array.isArray(p.tags)).toBe(true);
  });
});

describe("verdantlyResultToSwipePlant", () => {
  it("maps a Verdantly search result", () => {
    const p = verdantlyResultToSwipePlant({
      id: "v9",
      common_name: "Tomato 'Gardener's Delight'",
      scientific_name: ["Solanum lycopersicum"],
      thumbnail_url: "http://v/img.jpg",
    });
    expect(p.id).toBe("verdantly-v9");
    expect(p.name).toBe("Tomato 'Gardener's Delight'");
    expect(p.scientific_name).toBe("Solanum lycopersicum");
    expect(p.source).toBe("verdantly");
    expect(p.thumbnail).toBe("http://v/img.jpg");
  });
});
