const CACHE_TTL_DAYS = 30;

export interface PurgeResult {
  deleted: number;
}

/**
 * Deletes species_cache entries that are stale (older than ttlDays) and no
 * longer referenced by any row in the plants table. Entries that are still
 * referenced are preserved regardless of age so PlantEditModal can always
 * re-fetch and refresh them on next open.
 *
 * Requires a service-role Supabase client — species_cache has no DELETE RLS
 * policy for authenticated users.
 */
export async function purgeStaleSpeciesCache(
  db: any,
  ttlDays = CACHE_TTL_DAYS,
): Promise<PurgeResult> {
  const cutoff = new Date(
    Date.now() - ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: referencedPlants, error: refError } = await db
    .from("plants")
    .select("perenual_id")
    .not("perenual_id", "is", null);

  if (refError) {
    throw new Error(`Failed to fetch referenced plants: ${refError.message}`);
  }

  const referencedIds: number[] = (referencedPlants ?? [])
    .map((p: any) => p.perenual_id)
    .filter(Boolean);

  let deleteQuery = db
    .from("species_cache")
    .delete()
    .lt("updated_at", cutoff);

  if (referencedIds.length > 0) {
    deleteQuery = deleteQuery.not(
      "id",
      "in",
      `(${referencedIds.join(",")})`,
    );
  }

  const { data: deleted, error: deleteError } = await deleteQuery.select("id");

  if (deleteError) {
    throw new Error(`Failed to purge species_cache: ${deleteError.message}`);
  }

  return { deleted: (deleted ?? []).length };
}
