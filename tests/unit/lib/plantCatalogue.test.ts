import { describe, test, expect } from "vitest";
import { plantRowToPlantDetails } from "../../../src/lib/plantCatalogue";

// `plantRowToPlantDetails` is a pure adapter; the rest of plantCatalogue.ts
// is exercised by the E2E spec. We just want assurance that the column
// shape coming out of supabase always lands in the PlantDetails contract
// the preview UI expects.

describe("plantRowToPlantDetails", () => {
  test("normalises a Perenual row", () => {
    const row = {
      id: 12345,
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      source: "api",
      perenual_id: "9876",
      thumbnail_url: "https://example/tomato.jpg",
      sunlight: ["full_sun"],
      cycle: "Annual",
      watering: "Frequent",
      watering_min_days: 2,
      watering_max_days: 4,
      is_edible: true,
      is_toxic_pets: false,
      is_toxic_humans: false,
      description: "A red fruit",
      pruning_month: ["May", "Jun"],
      propagation: ["seed"],
    };
    const out = plantRowToPlantDetails(row);
    expect(out.common_name).toBe("Tomato");
    expect(out.scientific_name).toEqual(["Solanum lycopersicum"]);
    expect(out.sunlight).toEqual(["full_sun"]);
    expect(out.perenual_id).toBe("9876");
    expect(out.is_edible).toBe(true);
    expect(out.source).toBe("api");
  });

  test("joins array flowering/harvest season into a string", () => {
    const row = {
      common_name: "Lavender",
      flowering_season: ["Jun", "Jul", "Aug"],
      harvest_season: ["Aug"],
      source: "ai",
    };
    const out = plantRowToPlantDetails(row);
    expect(out.flowering_season).toBe("Jun, Jul, Aug");
    expect(out.harvest_season).toBe("Aug");
  });

  test("defaults missing arrays to empty arrays", () => {
    const out = plantRowToPlantDetails({ common_name: "X", source: "manual" });
    expect(out.scientific_name).toEqual([]);
    expect(out.sunlight).toEqual([]);
    expect(out.attracts).toEqual([]);
    expect(out.pruning_month).toEqual([]);
    expect(out.propagation).toEqual([]);
    expect(out.pest_susceptibility).toEqual([]);
  });

  test("falls back to maintenance_notes when maintenance is missing", () => {
    const out = plantRowToPlantDetails({
      common_name: "Rose",
      source: "manual",
      maintenance_notes: "Deadhead weekly",
    });
    expect(out.maintenance).toBe("Deadhead weekly");
  });

  test("preserves provider ids when present", () => {
    const out = plantRowToPlantDetails({
      common_name: "Mint",
      source: "verdantly",
      verdantly_id: "verd-abc",
      perenual_id: null,
    });
    expect(out.verdantly_id).toBe("verd-abc");
    expect(out.perenual_id).toBeNull();
  });
});
