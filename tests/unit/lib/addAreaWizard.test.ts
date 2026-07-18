import { describe, it, expect } from "vitest";
import {
  EMPTY_BED,
  validateBed,
  addPendingPlant,
  removePendingPlant,
  setPendingQuantity,
  buildAreaCommit,
  type PendingPlant,
} from "../../../src/lib/addAreaWizard";

const bed = { ...EMPTY_BED, name: "Raised Bed A" };

describe("validateBed", () => {
  it("requires a name", () => {
    expect(validateBed(EMPTY_BED)).toBe("name_required");
    expect(validateBed({ ...EMPTY_BED, name: "  " })).toBe("name_required");
    expect(validateBed(bed)).toBeNull();
  });

  it("bounds pH (0–14) and lux (≥0) but allows empties", () => {
    expect(validateBed({ ...bed, ph: "6.5", lux: "25000" })).toBeNull();
    expect(validateBed({ ...bed, ph: "14.1" })).toBe("ph_out_of_range");
    expect(validateBed({ ...bed, ph: "soil" })).toBe("ph_out_of_range");
    expect(validateBed({ ...bed, lux: "-1" })).toBe("lux_out_of_range");
  });
});

describe("pending plant list", () => {
  const tomato = { plantId: 1, name: "Tomato", thumbnailUrl: "t.jpg" };

  it("adds new plants and bumps quantity on re-add (no duplicates)", () => {
    let list: PendingPlant[] = [];
    list = addPendingPlant(list, tomato);
    list = addPendingPlant(list, { plantId: 2, name: "Basil" });
    list = addPendingPlant(list, tomato);
    expect(list).toEqual([
      { plantId: 1, name: "Tomato", thumbnailUrl: "t.jpg", quantity: 2 },
      { plantId: 2, name: "Basil", thumbnailUrl: null, quantity: 1 },
    ]);
  });

  it("removes by id and clamps quantity to 1–99", () => {
    let list = addPendingPlant([], tomato);
    list = setPendingQuantity(list, 1, 500);
    expect(list[0].quantity).toBe(99);
    list = setPendingQuantity(list, 1, 0);
    expect(list[0].quantity).toBe(1);
    expect(removePendingPlant(list, 1)).toEqual([]);
  });
});

describe("buildAreaCommit", () => {
  it("includes only set fields in the area insert", () => {
    const commit = buildAreaCommit({ ...bed, ph: "6.2", waterMovement: "Well-Drained" }, []);
    expect(commit.areaFields).toEqual({
      name: "Raised Bed A",
      medium_ph: 6.2,
      water_movement: "Well-Drained",
    });
    expect(commit.luxReading).toBeNull();
    expect(commit.instanceSeeds).toEqual([]);
  });

  it("a set peak light lands on the column AND as a lux reading", () => {
    const commit = buildAreaCommit({ ...bed, lux: "42000" }, []);
    expect(commit.areaFields.light_intensity_lux).toBe(42000);
    expect(commit.luxReading).toBe(42000);
  });

  it("expands pending plants into one seed per instance", () => {
    const pending: PendingPlant[] = [
      { plantId: 1, name: "Tomato", thumbnailUrl: null, quantity: 3 },
      { plantId: 2, name: "Basil", thumbnailUrl: null, quantity: 1 },
    ];
    const commit = buildAreaCommit(bed, pending);
    expect(commit.instanceSeeds).toEqual([
      { plant_id: 1, plant_name: "Tomato" },
      { plant_id: 1, plant_name: "Tomato" },
      { plant_id: 1, plant_name: "Tomato" },
      { plant_id: 2, plant_name: "Basil" },
    ]);
  });

  it("trims the name", () => {
    expect(buildAreaCommit({ ...bed, name: "  Herb Spiral  " }, []).areaFields.name).toBe("Herb Spiral");
  });
});
