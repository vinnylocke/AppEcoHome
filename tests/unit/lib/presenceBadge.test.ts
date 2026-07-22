import { describe, it, expect } from "vitest";
import { presencePill, toPresenceMap } from "../../../src/lib/presenceBadge";

describe("presencePill — one pill max, Active > Inactive > Saved", () => {
  it("active wins regardless of curation", () => {
    expect(presencePill("active", true)).toBe("active");
    expect(presencePill("active", false)).toBe("active");
  });

  it("inactive wins over saved", () => {
    expect(presencePill("inactive", true)).toBe("inactive");
    expect(presencePill("inactive", false)).toBe("inactive");
  });

  it("saved only when curated with no presence", () => {
    expect(presencePill(null, true)).toBe("saved");
    expect(presencePill(undefined, true)).toBe("saved");
  });

  it("library-only rows show nothing", () => {
    expect(presencePill(null, false)).toBeNull();
    expect(presencePill(undefined, false)).toBeNull();
  });
});

describe("toPresenceMap", () => {
  it("folds view rows by the given id key", () => {
    const map = toPresenceMap<number>(
      [
        { plant_id: 1, presence: "active" },
        { plant_id: 2, presence: "inactive" },
      ],
      "plant_id",
    );
    expect(map.get(1)).toBe("active");
    expect(map.get(2)).toBe("inactive");
    expect(map.size).toBe(2);
  });

  it("skips null/undefined ids and works for string ids", () => {
    const map = toPresenceMap<string>(
      [
        { ailment_id: "a", presence: "active" },
        { ailment_id: null, presence: "inactive" },
      ],
      "ailment_id",
    );
    expect(map.get("a")).toBe("active");
    expect(map.size).toBe(1);
  });
});
