import { describe, it, expect } from "vitest";
import { getEntryTargetType } from "../../../src/hooks/useGlobalJournal";
import type { JournalEntry } from "../../../src/types";

function baseEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "e1",
    home_id: "h1",
    subject: "Test",
    description: null,
    image_url: null,
    created_at: "2026-05-01T10:00:00Z",
    inventory_item_id: null,
    location_id: null,
    area_id: null,
    plan_id: null,
    task_id: null,
    ...overrides,
  };
}

describe("getEntryTargetType", () => {
  it("returns 'plant' when only inventory_item_id is set", () => {
    expect(
      getEntryTargetType(baseEntry({ inventory_item_id: "plant-1" })),
    ).toBe("plant");
  });

  it("returns 'location' when only location_id is set", () => {
    expect(
      getEntryTargetType(baseEntry({ location_id: "loc-1" })),
    ).toBe("location");
  });

  it("returns 'area' when only area_id is set", () => {
    expect(getEntryTargetType(baseEntry({ area_id: "area-1" }))).toBe("area");
  });

  it("returns 'plan' when only plan_id is set", () => {
    expect(getEntryTargetType(baseEntry({ plan_id: "plan-1" }))).toBe("plan");
  });

  it("returns 'none' for an unassigned entry", () => {
    expect(getEntryTargetType(baseEntry())).toBe("none");
  });

  it("prefers plant over other targets if multiple are set (defensive read)", () => {
    // The DB CHECK constraint enforces at most one target — but if a row
    // somehow has multiple set (e.g. legacy data), we keep the resolution
    // deterministic so the UI doesn't break.
    expect(
      getEntryTargetType(
        baseEntry({
          inventory_item_id: "plant-1",
          location_id: "loc-1",
        }),
      ),
    ).toBe("plant");
  });
});
