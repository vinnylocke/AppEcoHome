import { describe, test, expect } from "vitest";
import {
  plantSciNameKey,
  buildFavouriteLookup,
  isLibraryResultFavourited,
  type FavouritePlantLike,
  type LibraryResultLike,
} from "../../../src/lib/libraryFavouriteMatch";

describe("plantSciNameKey", () => {
  test("uses the first scientific name when present and non-empty", () => {
    expect(plantSciNameKey(["Solanum lycopersicum"], "Tomato")).toBe(
      "solanum lycopersicum",
    );
  });

  test("falls back to common name when scientific name array is empty-string", () => {
    expect(plantSciNameKey([""], "Tomato")).toBe("tomato");
  });

  test("falls back to common name when scientific name is not an array", () => {
    expect(plantSciNameKey(undefined, "Tomato")).toBe("tomato");
    expect(plantSciNameKey("not-an-array" as unknown, "Tomato")).toBe("tomato");
  });

  test("collapses internal whitespace and trims", () => {
    expect(plantSciNameKey(["  Solanum   lycopersicum  "], "Tomato")).toBe(
      "solanum lycopersicum",
    );
  });

  test("lowercases the result", () => {
    expect(plantSciNameKey(["SOLANUM LYCOPERSICUM"])).toBe(
      "solanum lycopersicum",
    );
  });

  test("returns empty string when both inputs are absent", () => {
    expect(plantSciNameKey(undefined, undefined)).toBe("");
    expect(plantSciNameKey(undefined, null)).toBe("");
  });

  test("returns empty string when common name is also empty", () => {
    expect(plantSciNameKey([""], "")).toBe("");
  });
});

describe("buildFavouriteLookup", () => {
  test("adds a non-null plant_id to refIds", () => {
    const favs: FavouritePlantLike[] = [
      { plant_id: 42, common_name: "Tomato" },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.refIds.has(42)).toBe(true);
  });

  test("skips null plant_id from refIds", () => {
    const favs: FavouritePlantLike[] = [
      { plant_id: null, common_name: "Tomato" },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.refIds.size).toBe(0);
  });

  test("live plant fields win over tombstone fields for the sci key", () => {
    const favs: FavouritePlantLike[] = [
      {
        plant_id: 1,
        common_name: "Tombstone Name",
        scientific_name: ["Tombstonia tombstonis"],
        plant: {
          common_name: "Live Name",
          scientific_name: ["Livia livia"],
        },
      },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.sciKeys.has("livia livia")).toBe(true);
    expect(lookup.sciKeys.has("tombstonia tombstonis")).toBe(false);
  });

  test("falls back to tombstone fields when the live plant is null", () => {
    const favs: FavouritePlantLike[] = [
      {
        plant_id: 1,
        common_name: "Tombstone Name",
        scientific_name: ["Tombstonia tombstonis"],
        plant: null,
      },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.sciKeys.has("tombstonia tombstonis")).toBe(true);
  });

  test("collects perenual and verdantly provider ids from the live plant", () => {
    const favs: FavouritePlantLike[] = [
      {
        plant_id: 1,
        common_name: "Basil",
        plant: { perenual_id: 555, verdantly_id: "verd-abc" },
      },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.perenualIds.has("555")).toBe(true);
    expect(lookup.verdantlyIds.has("verd-abc")).toBe(true);
  });

  test("does not add provider ids when the live plant is absent", () => {
    const favs: FavouritePlantLike[] = [
      { plant_id: 1, common_name: "Basil", plant: null },
    ];
    const lookup = buildFavouriteLookup(favs);
    expect(lookup.perenualIds.size).toBe(0);
    expect(lookup.verdantlyIds.size).toBe(0);
  });

  test("builds an empty lookup for an empty favourites list", () => {
    const lookup = buildFavouriteLookup([]);
    expect(lookup.refIds.size).toBe(0);
    expect(lookup.sciKeys.size).toBe(0);
    expect(lookup.perenualIds.size).toBe(0);
    expect(lookup.verdantlyIds.size).toBe(0);
  });
});

describe("isLibraryResultFavourited", () => {
  test("matches a global catalogue_hit against refIds", () => {
    const lookup = buildFavouriteLookup([{ plant_id: 100, common_name: "Rose" }]);
    const row: LibraryResultLike = {
      common_name: "Rose",
      catalogue_hit: { hit_kind: "global", plant_id: 100 },
    };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("home_fork catalogue_hit does NOT match refIds — falls through to sci-key", () => {
    const lookup = buildFavouriteLookup([
      { plant_id: 999, common_name: "Rose", scientific_name: ["Rosa rubiginosa"] },
    ]);
    const row: LibraryResultLike = {
      common_name: "Rose",
      scientific_name: ["Rosa rubiginosa"],
      // The fork's OWN id (not the favourited global parent's id) — must not
      // match refIds directly.
      catalogue_hit: { hit_kind: "home_fork", plant_id: 12345 },
    };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true); // via sci-key
  });

  test("home_fork catalogue_hit with no matching sci-key does not match", () => {
    const lookup = buildFavouriteLookup([{ plant_id: 999, common_name: "Rose" }]);
    const row: LibraryResultLike = {
      common_name: "Something Else",
      catalogue_hit: { hit_kind: "home_fork", plant_id: 999 },
    };
    expect(isLibraryResultFavourited(row, lookup)).toBe(false);
  });

  test("matches on perenual_id", () => {
    const lookup = buildFavouriteLookup([
      { plant_id: 1, common_name: "Basil", plant: { perenual_id: 777 } },
    ]);
    const row: LibraryResultLike = { common_name: "Basil", perenual_id: "777" };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("matches on verdantly_id", () => {
    const lookup = buildFavouriteLookup([
      { plant_id: 1, common_name: "Basil", plant: { verdantly_id: "verd-1" } },
    ]);
    const row: LibraryResultLike = { common_name: "Basil", verdantly_id: "verd-1" };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("falls back to a precomputed scientific_name_key on the row", () => {
    const lookup = buildFavouriteLookup([
      { plant_id: 1, common_name: "Lavender", scientific_name: ["Lavandula angustifolia"] },
    ]);
    const row: LibraryResultLike = {
      common_name: "Lavender",
      scientific_name_key: "lavandula angustifolia",
    };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("falls back to deriving the sci key from common/scientific name when scientific_name_key is absent", () => {
    const lookup = buildFavouriteLookup([{ plant_id: 1, common_name: "Fern" }]);
    const row: LibraryResultLike = { common_name: "Fern" };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("precedence — refIds match wins even when sci-key would also match", () => {
    const lookup = buildFavouriteLookup([
      { plant_id: 1, common_name: "Different Name" },
    ]);
    const row: LibraryResultLike = {
      common_name: "Totally Unrelated",
      catalogue_hit: { hit_kind: "global", plant_id: 1 },
    };
    expect(isLibraryResultFavourited(row, lookup)).toBe(true);
  });

  test("returns false when nothing matches", () => {
    const lookup = buildFavouriteLookup([{ plant_id: 1, common_name: "Tomato" }]);
    const row: LibraryResultLike = { common_name: "Basil" };
    expect(isLibraryResultFavourited(row, lookup)).toBe(false);
  });

  test("empty key never matches (guards against '' === '' false positives)", () => {
    const lookup = buildFavouriteLookup([{ plant_id: 1, common_name: "" }]);
    const row: LibraryResultLike = { common_name: "" };
    expect(isLibraryResultFavourited(row, lookup)).toBe(false);
  });
});
