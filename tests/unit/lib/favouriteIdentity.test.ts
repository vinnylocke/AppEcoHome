import { describe, it, expect } from "vitest";
import {
  buildFavouriteSnapshot,
  buildForkRow,
  canonicalPlantRefId,
  isSourceLockedForTier,
  lockedSourceMessage,
  shouldForkOnEdit,
  SNAPSHOT_FIELDS,
  isAilmentSourceLockedForTier,
  lockedAilmentSourceMessage,
  ailmentIdentityKey,
  buildAilmentSnapshot,
  AILMENT_SNAPSHOT_FIELDS,
  packetIdentityKey,
  buildPacketSnapshot,
  PACKET_SNAPSHOT_FIELDS,
} from "../../../src/lib/favouriteIdentity";

describe("canonicalPlantRefId", () => {
  it("returns the row's own id for manual plants", () => {
    expect(canonicalPlantRefId({ id: 42, source: "manual" })).toBe(42);
  });

  it("returns the row's own id for api / verdantly plants", () => {
    expect(canonicalPlantRefId({ id: 7, source: "api" })).toBe(7);
    expect(canonicalPlantRefId({ id: 8, source: "verdantly" })).toBe(8);
  });

  it("resolves AI/library forks to the global catalogue parent", () => {
    expect(
      canonicalPlantRefId({ id: 9, source: "ai", forked_from_plant_id: 1000010 }),
    ).toBe(1000010);
  });

  it("returns the row's own id for orphan AI rows (no parent)", () => {
    expect(
      canonicalPlantRefId({ id: 9, source: "ai", forked_from_plant_id: null }),
    ).toBe(9);
  });

  it("does NOT follow forked_from_plant_id on non-AI sources (copy-on-write provenance links)", () => {
    // Copy-on-write forks are manual rows carrying provenance — the fork's
    // own id is its identity, not the ancestor's.
    expect(
      canonicalPlantRefId({ id: 11, source: "manual", forked_from_plant_id: 5 }),
    ).toBe(11);
  });
});

describe("isSourceLockedForTier — strict source × tier matrix", () => {
  const sprout = { aiEnabled: false, perenualEnabled: false };
  const botanist = { aiEnabled: false, perenualEnabled: true };
  const sage = { aiEnabled: true, perenualEnabled: false };
  const evergreen = { aiEnabled: true, perenualEnabled: true };

  it("manual is open to every tier", () => {
    for (const flags of [sprout, botanist, sage, evergreen]) {
      expect(isSourceLockedForTier("manual", flags)).toBe(false);
    }
  });

  it("Sprout: api + verdantly + ai all locked", () => {
    expect(isSourceLockedForTier("api", sprout)).toBe(true);
    expect(isSourceLockedForTier("verdantly", sprout)).toBe(true);
    expect(isSourceLockedForTier("ai", sprout)).toBe(true);
  });

  it("enable_perenual-only (Botanist): ai locked, api/verdantly open", () => {
    expect(isSourceLockedForTier("ai", botanist)).toBe(true);
    expect(isSourceLockedForTier("api", botanist)).toBe(false);
    expect(isSourceLockedForTier("verdantly", botanist)).toBe(false);
  });

  it("ai_enabled-only (Sage): api/verdantly locked, ai open", () => {
    expect(isSourceLockedForTier("api", sage)).toBe(true);
    expect(isSourceLockedForTier("verdantly", sage)).toBe(true);
    expect(isSourceLockedForTier("ai", sage)).toBe(false);
  });

  it("Evergreen: everything open", () => {
    for (const source of ["manual", "api", "verdantly", "ai"]) {
      expect(isSourceLockedForTier(source, evergreen)).toBe(false);
    }
  });

  it("null / unknown sources are never locked", () => {
    expect(isSourceLockedForTier(null, sprout)).toBe(false);
    expect(isSourceLockedForTier(undefined, sprout)).toBe(false);
  });
});

describe("lockedSourceMessage", () => {
  it("mentions the AI plans for ai source", () => {
    expect(lockedSourceMessage("ai")).toMatch(/Sage or Evergreen/);
  });
  it("mentions the species database for provider sources", () => {
    expect(lockedSourceMessage("api")).toMatch(/Botanist or Evergreen/);
    expect(lockedSourceMessage("verdantly")).toMatch(/Botanist or Evergreen/);
  });
  it("is empty for manual", () => {
    expect(lockedSourceMessage("manual")).toBe("");
  });
});

describe("shouldForkOnEdit — copy-on-write decision", () => {
  it("manual plants edit in place", () => {
    expect(shouldForkOnEdit("manual")).toBe(false);
  });
  it("every non-manual source forks", () => {
    expect(shouldForkOnEdit("api")).toBe(true);
    expect(shouldForkOnEdit("verdantly")).toBe(true);
    expect(shouldForkOnEdit("ai")).toBe(true);
  });
  it("null source does not fork", () => {
    expect(shouldForkOnEdit(null)).toBe(false);
    expect(shouldForkOnEdit(undefined)).toBe(false);
  });
});

describe("buildFavouriteSnapshot", () => {
  it("caps the snapshot to the care-card field set", () => {
    const plant = {
      id: 1,
      home_id: "h",
      created_at: "2026-01-01",
      scientific_name_key: "solanum lycopersicum",
      perenual_id: "123",
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      watering: "Average",
      sunlight: ["Full sun"],
      care_guide_data: { plantData: {} },
      freshness_version: 3,
    };
    const snap = buildFavouriteSnapshot(plant);
    expect(snap).toEqual({
      common_name: "Tomato",
      scientific_name: ["Solanum lycopersicum"],
      watering: "Average",
      sunlight: ["Full sun"],
    });
    // Never leaks identity or catalogue bookkeeping.
    expect(snap).not.toHaveProperty("id");
    expect(snap).not.toHaveProperty("home_id");
    expect(snap).not.toHaveProperty("perenual_id");
    expect(snap).not.toHaveProperty("care_guide_data");
    expect(snap).not.toHaveProperty("freshness_version");
  });

  it("skips null / undefined fields", () => {
    const snap = buildFavouriteSnapshot({ common_name: "X", description: null });
    expect(snap).toEqual({ common_name: "X" });
  });

  it("keeps falsy-but-present booleans", () => {
    const snap = buildFavouriteSnapshot({ common_name: "X", is_edible: false });
    expect(snap).toEqual({ common_name: "X", is_edible: false });
  });

  it("SNAPSHOT_FIELDS stays a bounded whitelist", () => {
    expect(SNAPSHOT_FIELDS).toContain("common_name");
    expect(SNAPSHOT_FIELDS).not.toContain("home_id");
    expect(SNAPSHOT_FIELDS).not.toContain("perenual_id");
  });
});

describe("buildForkRow — copy-on-write fork payload", () => {
  const original = { id: 555, source: "api" as const, forked_from_plant_id: null };

  it("re-sources the fork as manual and drops provider ids", () => {
    const fork = buildForkRow(
      { common_name: "Lavender", watering: "Minimum", perenual_id: "99" },
      original,
    );
    expect(fork.source).toBe("manual");
    expect(fork.perenual_id).toBeNull();
    expect(fork.verdantly_id).toBeNull();
    expect(fork.common_name).toBe("Lavender");
    expect(fork.watering).toBe("Minimum");
  });

  it("records provenance via the ORIGINAL's canonical id", () => {
    const fork = buildForkRow({ common_name: "Lavender" }, original);
    expect(fork.forked_from_plant_id).toBe(555);
  });

  it("resolves AI originals to their global parent for provenance", () => {
    const fork = buildForkRow(
      { common_name: "Cherry Tomato" },
      { id: 777, source: "ai", forked_from_plant_id: 1000010 },
    );
    expect(fork.forked_from_plant_id).toBe(1000010);
  });

  it("strips identity, home, and AI-catalogue bookkeeping columns", () => {
    const fork = buildForkRow(
      {
        id: 555,
        home_id: "some-home",
        created_at: "2026-01-01",
        scientific_name_key: "x",
        instance_count: 3,
        inventory_items: [{ id: "a" }],
        overridden_fields: ["watering"],
        care_guide_data: { plantData: {} },
        updated_care_fields: ["watering"],
        freshness_version: 2,
        last_freshness_check_at: "2026-01-01",
        last_care_generated_at: "2026-01-01",
        common_name: "Lavender",
      },
      original,
    );
    for (const key of [
      "id",
      "home_id",
      "created_at",
      "scientific_name_key",
      "instance_count",
      "inventory_items",
      "care_guide_data",
      "updated_care_fields",
      "freshness_version",
      "last_freshness_check_at",
      "last_care_generated_at",
    ]) {
      expect(fork).not.toHaveProperty(key);
    }
    // overridden_fields is explicitly nulled (a manual row has none).
    expect(fork.overridden_fields).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AILMENT FAVOURITES (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

describe("isAilmentSourceLockedForTier — strict source × tier matrix", () => {
  const sprout = { aiEnabled: false, perenualEnabled: false };
  const botanist = { aiEnabled: false, perenualEnabled: true };
  const sage = { aiEnabled: true, perenualEnabled: false };
  const evergreen = { aiEnabled: true, perenualEnabled: true };

  it("manual + library are open to every tier", () => {
    for (const flags of [sprout, botanist, sage, evergreen]) {
      expect(isAilmentSourceLockedForTier("manual", flags)).toBe(false);
      expect(isAilmentSourceLockedForTier("library", flags)).toBe(false);
    }
  });

  it("Sprout: perenual + ai both locked", () => {
    expect(isAilmentSourceLockedForTier("perenual", sprout)).toBe(true);
    expect(isAilmentSourceLockedForTier("ai", sprout)).toBe(true);
  });

  it("enable_perenual-only (Botanist): ai locked, perenual open", () => {
    expect(isAilmentSourceLockedForTier("ai", botanist)).toBe(true);
    expect(isAilmentSourceLockedForTier("perenual", botanist)).toBe(false);
  });

  it("ai_enabled-only (Sage): perenual locked, ai open", () => {
    expect(isAilmentSourceLockedForTier("perenual", sage)).toBe(true);
    expect(isAilmentSourceLockedForTier("ai", sage)).toBe(false);
  });

  it("Evergreen: everything open", () => {
    for (const source of ["manual", "library", "perenual", "ai"]) {
      expect(isAilmentSourceLockedForTier(source, evergreen)).toBe(false);
    }
  });

  it("null / unknown sources are never locked", () => {
    expect(isAilmentSourceLockedForTier(null, sprout)).toBe(false);
    expect(isAilmentSourceLockedForTier(undefined, sprout)).toBe(false);
  });
});

describe("lockedAilmentSourceMessage", () => {
  it("mentions the AI plans for ai source", () => {
    expect(lockedAilmentSourceMessage("ai")).toMatch(/Sage or Evergreen/);
    expect(lockedAilmentSourceMessage("ai")).toMatch(/ailment/);
  });
  it("mentions the species database for perenual source", () => {
    expect(lockedAilmentSourceMessage("perenual")).toMatch(/Botanist or Evergreen/);
  });
  it("is empty for manual + library", () => {
    expect(lockedAilmentSourceMessage("manual")).toBe("");
    expect(lockedAilmentSourceMessage("library")).toBe("");
  });
});

describe("ailmentIdentityKey — mirrors ailment_library.name_key", () => {
  it("lowercases and trims", () => {
    expect(ailmentIdentityKey("  Black Spot  ")).toBe("black spot");
  });
  it("collapses internal whitespace", () => {
    expect(ailmentIdentityKey("Powdery\t  Mildew")).toBe("powdery mildew");
  });
  it("handles null / undefined", () => {
    expect(ailmentIdentityKey(null)).toBe("");
    expect(ailmentIdentityKey(undefined)).toBe("");
  });
  it("is stable for casing/spacing variants (dedupe safety)", () => {
    expect(ailmentIdentityKey("Aphids")).toBe(ailmentIdentityKey("  aphids "));
  });
});

describe("buildAilmentSnapshot", () => {
  it("caps the snapshot to the ailment card + copy field set", () => {
    const ailment = {
      id: "uuid",
      home_id: "h",
      created_at: "2026-01-01",
      is_archived: false,
      name: "Black Spot",
      type: "disease",
      source: "library",
      scientific_name: "Diplocarpon rosae",
      description: "A fungal disease of roses.",
      symptoms: [{ id: "s", title: "Black patches" }],
      affected_plants: ["Roses"],
      prevention_steps: [{ id: "p", title: "Airflow" }],
      remedy_steps: [{ id: "r", title: "Fungicide" }],
      perenual_id: 42,
    };
    const snap = buildAilmentSnapshot(ailment);
    expect(snap).toEqual({
      scientific_name: "Diplocarpon rosae",
      description: "A fungal disease of roses.",
      symptoms: [{ id: "s", title: "Black patches" }],
      affected_plants: ["Roses"],
      prevention_steps: [{ id: "p", title: "Airflow" }],
      remedy_steps: [{ id: "r", title: "Fungicide" }],
      perenual_id: 42,
    });
    // Never leaks home-scoped bookkeeping.
    expect(snap).not.toHaveProperty("id");
    expect(snap).not.toHaveProperty("home_id");
    expect(snap).not.toHaveProperty("is_archived");
    expect(snap).not.toHaveProperty("name");
  });

  it("skips null / undefined fields", () => {
    const snap = buildAilmentSnapshot({ description: "X", scientific_name: null });
    expect(snap).toEqual({ description: "X" });
  });

  it("AILMENT_SNAPSHOT_FIELDS stays a bounded whitelist", () => {
    expect(AILMENT_SNAPSHOT_FIELDS).toContain("prevention_steps");
    expect(AILMENT_SNAPSHOT_FIELDS).not.toContain("home_id");
    expect(AILMENT_SNAPSHOT_FIELDS).not.toContain("name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEED-PACKET FAVOURITES (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

describe("packetIdentityKey — variety + plant composite", () => {
  it("composites variety and plant name, lowercased + collapsed", () => {
    expect(packetIdentityKey("Cherokee Purple", "Tomato")).toBe(
      "cherokee purple|tomato",
    );
  });
  it("lowercases and collapses internal whitespace on both parts", () => {
    expect(packetIdentityKey("  Sungold  F1 ", "Cherry\tTomato")).toBe(
      "sungold f1|cherry tomato",
    );
  });
  it("handles a missing variety (plant-only packet)", () => {
    expect(packetIdentityKey(null, "Basil")).toBe("|basil");
  });
  it("handles a missing plant (variety-only packet)", () => {
    expect(packetIdentityKey("Cosmos", null)).toBe("cosmos|");
  });
  it("handles both missing (untitled packet)", () => {
    expect(packetIdentityKey(null, undefined)).toBe("|");
  });
  it("is stable for casing/spacing variants (dedupe safety)", () => {
    expect(packetIdentityKey("Kale", "Brassica")).toBe(
      packetIdentityKey("  kale ", " brassica "),
    );
  });
});

describe("buildPacketSnapshot", () => {
  it("caps the snapshot to the variety-reference field set", () => {
    const packet = {
      id: "uuid",
      home_id: "h",
      created_at: "2026-01-01",
      is_archived: false,
      variety: "Cherokee Purple",
      vendor: "Real Seeds",
      sow_by: "2027-03-01",
      notes: "Slice for sandwiches.",
      quantity_remaining: "half a packet",
      purchased_on: "2026-01-01",
      opened_on: "2026-02-01",
      // Physical / live state must NEVER leak into the snapshot:
      active_sowing_id: "s1",
      active_sowing_status: "sown",
      latest_germination_rate_pct: 80,
    };
    const snap = buildPacketSnapshot(packet);
    expect(snap).toEqual({
      sow_by: "2027-03-01",
      notes: "Slice for sandwiches.",
      quantity_remaining: "half a packet",
      purchased_on: "2026-01-01",
      opened_on: "2026-02-01",
    });
    // Never leaks home-scoped bookkeeping or live/physical state.
    expect(snap).not.toHaveProperty("id");
    expect(snap).not.toHaveProperty("home_id");
    expect(snap).not.toHaveProperty("variety");
    expect(snap).not.toHaveProperty("active_sowing_id");
    expect(snap).not.toHaveProperty("latest_germination_rate_pct");
  });

  it("skips null / undefined fields", () => {
    const snap = buildPacketSnapshot({ notes: "keep dry", sow_by: null });
    expect(snap).toEqual({ notes: "keep dry" });
  });

  it("PACKET_SNAPSHOT_FIELDS stays a bounded whitelist (no live stock/sowings)", () => {
    expect(PACKET_SNAPSHOT_FIELDS).toContain("sow_by");
    expect(PACKET_SNAPSHOT_FIELDS).not.toContain("home_id");
    expect(PACKET_SNAPSHOT_FIELDS).not.toContain("active_sowing_status");
    expect(PACKET_SNAPSHOT_FIELDS).not.toContain("latest_germination_rate_pct");
  });
});
