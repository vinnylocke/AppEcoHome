import { describe, it, expect } from "vitest";
import {
  shouldAutoCreate,
  buildAutoEntryCopy,
} from "../../../src/services/journalAutoUpdateService";

describe("shouldAutoCreate", () => {
  it("returns false when no categories are enabled", () => {
    expect(
      shouldAutoCreate(
        { id: "t1", title: "Water tomatoes", type: "Watering" },
        [],
      ),
    ).toBe(false);
  });

  it("returns false when the task's category isn't in the list", () => {
    expect(
      shouldAutoCreate(
        { id: "t1", title: "Water tomatoes", type: "Watering" },
        ["Planting", "Harvesting"],
      ),
    ).toBe(false);
  });

  it("returns true when the task's category matches", () => {
    expect(
      shouldAutoCreate(
        { id: "t1", title: "Sow tomatoes", type: "Planting" },
        ["Planting"],
      ),
    ).toBe(true);
  });

  it("is case-sensitive — different casing does NOT match", () => {
    // Task categories are a canonical PascalCase enum; mismatched casing
    // suggests a programmer mistake we'd rather surface than silently
    // accept.
    expect(
      shouldAutoCreate(
        { id: "t1", title: "Sow tomatoes", type: "planting" },
        ["Planting"],
      ),
    ).toBe(false);
  });

  it("handles a fully-enabled preference set", () => {
    const all = ["Planting", "Watering", "Harvesting", "Maintenance", "Pruning"];
    for (const cat of all) {
      expect(
        shouldAutoCreate(
          { id: "t", title: "x", type: cat },
          all,
        ),
      ).toBe(true);
    }
  });
});

describe("buildAutoEntryCopy", () => {
  it("formats single-plant Planting tasks", () => {
    const out = buildAutoEntryCopy(
      { id: "t1", title: "Sow basil from packet A", type: "Planting" },
      ["Basil"],
    );
    expect(out.subject).toBe("Planted · Basil");
    expect(out.description).toBe("Sow basil from packet A");
  });

  it("uses the task verb for non-mapped types", () => {
    const out = buildAutoEntryCopy(
      { id: "t1", title: "Inspect for aphids", type: "Inspection" },
      ["Tomato"],
    );
    expect(out.subject).toBe("Inspection · Tomato");
  });

  it("uses 'N plants' label when multiple instances are involved", () => {
    const out = buildAutoEntryCopy(
      { id: "t1", title: "Harvest cherry tomatoes batch", type: "Harvesting" },
      ["Sungold", "Black Krim", "San Marzano"],
    );
    expect(out.subject).toBe("Harvested · 3 plants");
    expect(out.description).toContain("Plants: Sungold, Black Krim, San Marzano");
  });

  it("falls back to the verb-only subject when no plant names are given", () => {
    const out = buildAutoEntryCopy(
      { id: "t1", title: "Spring tidy-up", type: "Maintenance" },
      [],
    );
    expect(out.subject).toBe("Maintained");
    expect(out.description).toBe("Spring tidy-up");
  });

  it("maps known verbs (Planting/Harvesting/Pruning/Watering/Maintenance)", () => {
    const cases: Array<[string, string]> = [
      ["Planting", "Planted"],
      ["Harvesting", "Harvested"],
      ["Pruning", "Pruned"],
      ["Watering", "Watered"],
      ["Maintenance", "Maintained"],
    ];
    for (const [type, expectedVerb] of cases) {
      const out = buildAutoEntryCopy(
        { id: "t1", title: "task", type },
        ["Plant"],
      );
      expect(out.subject.startsWith(expectedVerb)).toBe(true);
    }
  });
});
