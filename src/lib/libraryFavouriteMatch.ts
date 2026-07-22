// Garden Hub v3 Stage E — "is this library search result already ♥ by me?"
// Pure (no React, no supabase) so the matching rules are unit-testable.
//
// Unlike ailments (user_favourite_ailments.ailment_library_id is a direct FK),
// plant favourites only reference a plants row (catalogue row for AI clones,
// the home row otherwise). The stable bridges back to a search result are:
//   1. the referenced plants.id itself (AI catalogue hits),
//   2. provider ids (perenual_id / verdantly_id) on the joined live plant,
//   3. the species key — the exact expression both plants.scientific_name_key
//      and plant_library.scientific_name_key generate:
//      lower(trim(regexp_replace(COALESCE(NULLIF(sci->>0,''), common_name),
//      '\s+', ' ', 'g'))).
// Species-level precision is correct: the catalogue dedupes clones to one
// global row per scientific_name_key, so variant-level favourites are
// unrepresentable in the data anyway.

/** The client-side mirror of the generated scientific_name_key columns. */
export function plantSciNameKey(
  scientificName?: unknown,
  commonName?: string | null,
): string {
  const sci = Array.isArray(scientificName) ? scientificName[0] : undefined;
  const base =
    typeof sci === "string" && sci.trim() !== "" ? sci : (commonName ?? "");
  return base.replace(/\s+/g, " ").trim().toLowerCase();
}

/** One favourite row as loaded by listFavouritePlants() (fields we consume). */
export interface FavouritePlantLike {
  plant_id: number | null;
  common_name: string;
  scientific_name?: unknown;
  plant?: {
    common_name?: string | null;
    scientific_name?: unknown;
    perenual_id?: string | number | null;
    verdantly_id?: string | null;
    forked_from_plant_id?: number | null;
  } | null;
}

export interface FavouriteLookup {
  refIds: Set<number>;
  sciKeys: Set<string>;
  perenualIds: Set<string>;
  verdantlyIds: Set<string>;
}

/** Build the lookup once per favourites load. */
export function buildFavouriteLookup(
  favourites: FavouritePlantLike[],
): FavouriteLookup {
  const lookup: FavouriteLookup = {
    refIds: new Set(),
    sciKeys: new Set(),
    perenualIds: new Set(),
    verdantlyIds: new Set(),
  };
  for (const f of favourites) {
    if (f.plant_id != null) lookup.refIds.add(f.plant_id);
    // Live plant first; tombstone columns keep deleted references matchable.
    const key = plantSciNameKey(
      f.plant?.scientific_name ?? f.scientific_name,
      f.plant?.common_name ?? f.common_name,
    );
    if (key) lookup.sciKeys.add(key);
    if (f.plant?.perenual_id != null) {
      lookup.perenualIds.add(String(f.plant.perenual_id));
    }
    if (f.plant?.verdantly_id) lookup.verdantlyIds.add(f.plant.verdantly_id);
  }
  return lookup;
}

/** A search result row, any provider (fields we consume). */
export interface LibraryResultLike {
  common_name?: string | null;
  scientific_name?: unknown;
  scientific_name_key?: string | null;
  perenual_id?: string | number | null;
  verdantly_id?: string | null;
  catalogue_hit?: { hit_kind: "global" | "home_fork"; plant_id: number } | null;
}

/**
 * True when the result matches any of the user's favourites.
 * home_fork catalogue hits carry the FORK's id (not the global parent), so
 * they fall through to the species-key check rather than refIds.
 */
export function isLibraryResultFavourited(
  row: LibraryResultLike,
  lookup: FavouriteLookup,
): boolean {
  if (
    row.catalogue_hit?.hit_kind === "global" &&
    lookup.refIds.has(row.catalogue_hit.plant_id)
  ) {
    return true;
  }
  if (row.perenual_id != null && lookup.perenualIds.has(String(row.perenual_id))) {
    return true;
  }
  if (row.verdantly_id && lookup.verdantlyIds.has(row.verdantly_id)) return true;
  const key =
    row.scientific_name_key ??
    plantSciNameKey(row.scientific_name, row.common_name);
  return key !== "" && lookup.sciKeys.has(key);
}
