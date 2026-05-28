import { describe, it, expect } from "vitest";
import {
  buildAreaRotationHistory,
  recommendRotation,
  type InventoryItemForRotation,
} from "../../../src/lib/rotationEngine";

function row(overrides: Partial<InventoryItemForRotation>): InventoryItemForRotation {
  return {
    id: "i" + Math.random().toString(36).slice(2, 8),
    area_id: "area-1",
    plant_name: "Plant",
    planted_at: null,
    ended_at: null,
    created_at: null,
    family: null,
    ...overrides,
  };
}

describe("buildAreaRotationHistory", () => {
  it("returns an empty timeline for an area with no rows", () => {
    const h = buildAreaRotationHistory("area-1", []);
    expect(h.areaId).toBe("area-1");
    expect(h.seasons).toEqual([]);
  });

  it("filters by areaId — other areas' plants don't leak in", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ area_id: "area-1", plant_name: "Tomato", family: "Solanaceae", planted_at: "2026-05-01" }),
      row({ area_id: "area-2", plant_name: "Cabbage", family: "Brassicaceae", planted_at: "2026-05-01" }),
    ]);
    expect(h.seasons.length).toBe(1);
    expect(h.seasons[0].families[0].family).toBe("Solanaceae");
  });

  it("groups plants by family per year", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2026-05-01" }),
      row({ plant_name: "Pepper", family: "Solanaceae", planted_at: "2026-05-15" }),
      row({ plant_name: "Cabbage", family: "Brassicaceae", planted_at: "2026-04-01" }),
    ]);
    const fams = h.seasons[0].families.map((f) => f.family);
    expect(fams).toContain("Solanaceae");
    expect(fams).toContain("Brassicaceae");
    const solanaceaeEntry = h.seasons[0].families.find((f) => f.family === "Solanaceae")!;
    expect(solanaceaeEntry.plants.sort()).toEqual(["Pepper", "Tomato"]);
  });

  it("sorts seasons newest first", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2024-05-01" }),
      row({ plant_name: "Cabbage", family: "Brassicaceae", planted_at: "2026-05-01" }),
      row({ plant_name: "Pea", family: "Fabaceae", planted_at: "2025-05-01" }),
    ]);
    expect(h.seasons.map((s) => s.year)).toEqual([2026, 2025, 2024]);
  });

  it("falls back through planted_at → ended_at → created_at for the year", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "A", family: "Solanaceae", planted_at: null, ended_at: "2025-09-01" }),
      row({ plant_name: "B", family: "Brassicaceae", planted_at: null, ended_at: null, created_at: "2024-03-01" }),
    ]);
    expect(h.seasons.map((s) => s.year).sort()).toEqual([2024, 2025]);
  });

  it("drops rows that have no reference date", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae" }),
    ]);
    expect(h.seasons).toEqual([]);
  });

  it("includes unknown families in the timeline (no rule filter)", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Cactus", family: "Cactaceae", planted_at: "2026-05-01" }),
    ]);
    expect(h.seasons[0].families[0].family).toBe("Cactaceae");
    expect(h.seasons[0].families[0].display.latin).toBeNull();
  });

  it("buckets rows with null family into the season's `unknown` list", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Mystery", family: null, planted_at: "2026-05-01" }),
    ]);
    expect(h.seasons[0].unknown).toEqual(["Mystery"]);
    expect(h.seasons[0].families).toEqual([]);
  });

  it("deduplicates duplicate plant names within a family in the same year", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2026-05-01" }),
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2026-06-15" }),
    ]);
    expect(h.seasons[0].families[0].plants).toEqual(["Tomato"]);
  });

  it("aliased family names normalise to the canonical family (Compositae → Asteraceae)", () => {
    const h = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Lettuce", family: "Compositae", planted_at: "2026-05-01" }),
    ]);
    expect(h.seasons[0].families[0].family).toBe("Asteraceae");
  });
});

describe("recommendRotation", () => {
  it("returns isClear=true when there's no history", () => {
    const r = recommendRotation({ areaId: "a", seasons: [] }, 2026);
    expect(r.isClear).toBe(true);
    expect(r.avoid).toEqual([]);
    expect(r.prefer).toEqual([]);
  });

  it("flags Solanaceae as avoid when planted last year", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2025-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.isClear).toBe(false);
    expect(r.avoid.map((c) => c.family)).toEqual(["Solanaceae"]);
    expect(r.avoid[0].reason).toContain("1 year ago");
  });

  it("sharpens the reason when family grown 2+ of last 3 years", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2025-05-01" }),
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2024-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.avoid[0].reason).toContain("2 of the last 3 years");
  });

  it("flags 'this year' when family grown in the target year", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2026-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.avoid[0].reason).toContain("this year");
  });

  it("does NOT flag families outside the avoid window (Solanaceae 3+ years ago)", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2022-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.avoid).toEqual([]);
    expect(r.isClear).toBe(true);
  });

  it("suggests partner families in 'prefer' but excludes avoided ones", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2025-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    const preferFams = r.prefer.map((p) => p.family);
    expect(preferFams).toContain("Fabaceae");
    expect(preferFams).toContain("Brassicaceae");
    expect(preferFams).not.toContain("Solanaceae");
  });

  it("doesn't recommend partners that are themselves in the avoid set", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2025-05-01" }),
      row({ plant_name: "Cabbage", family: "Brassicaceae", planted_at: "2025-08-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    const preferFams = r.prefer.map((p) => p.family);
    expect(preferFams).not.toContain("Solanaceae");
    expect(preferFams).not.toContain("Brassicaceae");
    expect(preferFams).toContain("Fabaceae");
  });

  it("ignores future-dated entries (data anomaly safety)", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2030-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.isClear).toBe(true);
  });

  it("produces no avoid/prefer chips for unknown families", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Cactus", family: "Cactaceae", planted_at: "2026-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.isClear).toBe(true);
  });

  it("respects different avoidYears per family (Lamiaceae = 1 year)", () => {
    // Lamiaceae has avoidYears=1, so planted 1 year ago should clear.
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Basil", family: "Lamiaceae", planted_at: "2025-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.isClear).toBe(true);
  });

  it("respects long avoid windows (Solanaceae = 3 years, planted 2 years ago still flagged)", () => {
    const history = buildAreaRotationHistory("area-1", [
      row({ plant_name: "Tomato", family: "Solanaceae", planted_at: "2024-05-01" }),
    ]);
    const r = recommendRotation(history, 2026);
    expect(r.avoid.map((c) => c.family)).toContain("Solanaceae");
  });
});
