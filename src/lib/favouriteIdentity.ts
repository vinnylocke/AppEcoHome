// Cross-home favourites — pure identity, gating, and fork helpers.
// No React, no supabase imports (unit-testable). See
// docs/plans/cross-home-favourites.md (2026-07-03 final decisions):
//   * Favourite identity = the referenced plant's immutable id — the GLOBAL
//     catalogue id where one exists (AI/library forks), else the row's own id.
//   * Strict source × tier gating: acting on a plant whose source exceeds the
//     viewer's entitlements is blocked (view-only).
//   * Copy-on-write edits: any non-manual plant is forked to a NEW manual row
//     on save; only manual plants edit in place.

export type PlantSource = "manual" | "api" | "ai" | "verdantly";

export interface PlantIdentityInput {
  id: number;
  source: PlantSource | string | null;
  forked_from_plant_id?: number | null;
}

export interface TierFlags {
  aiEnabled: boolean;
  perenualEnabled: boolean;
}

/**
 * The immutable reference id a favourite stores for this plant.
 * AI/library home rows resolve to their global catalogue parent (stable across
 * homes and never deleted by home flows); everything else references the row
 * itself.
 */
export function canonicalPlantRefId(plant: PlantIdentityInput): number {
  if (plant.source === "ai" && plant.forked_from_plant_id != null) {
    return plant.forked_from_plant_id;
  }
  return plant.id;
}

/**
 * Strict source × tier action gate (plan §7 + 2026-07-03 answer 5).
 * Locked sources are VIEW-ONLY: favouriting, add-to-home, and copy-on-write
 * edits are all blocked for them.
 *
 *   source 'ai'              → needs ai_enabled       (Sage / Evergreen)
 *   source 'api'/'verdantly' → needs enable_perenual  (Botanist / Evergreen)
 *   source 'manual'          → open to every tier
 */
export function isSourceLockedForTier(
  source: PlantSource | string | null | undefined,
  flags: TierFlags,
): boolean {
  if (source === "ai") return !flags.aiEnabled;
  if (source === "api" || source === "verdantly") return !flags.perenualEnabled;
  return false;
}

/** Upsell copy for a tier-locked source (tooltips on disabled controls). */
export function lockedSourceMessage(source: PlantSource | string | null | undefined): string {
  if (source === "ai") {
    return "AI plants need an AI-enabled plan (Sage or Evergreen) — upgrade to act on this plant.";
  }
  if (source === "api" || source === "verdantly") {
    return "Plant-database plants need the species database (Botanist or Evergreen) — upgrade to act on this plant.";
  }
  return "";
}

/**
 * Copy-on-write decision (2026-07-03 final decisions): editing ANY non-manual
 * plant creates a NEW plant row; manual plants edit in place.
 */
export function shouldForkOnEdit(source: PlantSource | string | null | undefined): boolean {
  return source != null && source !== "manual";
}

/** Fields the favourite tombstone snapshot is capped to (care-card render set). */
export const SNAPSHOT_FIELDS = [
  "common_name",
  "scientific_name",
  "description",
  "plant_type",
  "cycle",
  "care_level",
  "growth_rate",
  "maintenance",
  "watering",
  "watering_min_days",
  "watering_max_days",
  "sunlight",
  "flowering_season",
  "harvest_season",
  "pruning_month",
  "propagation",
  "attracts",
  "is_toxic_humans",
  "is_toxic_pets",
  "indoor",
  "is_edible",
  "drought_tolerant",
  "tropical",
  "medicinal",
  "cuisine",
  "thumbnail_url",
  "labels",
] as const;

/**
 * Build the capped tombstone snapshot for a favourite. Only the fields the
 * favourite card / add-to-home copy needs — never the whole row (no ids,
 * home_id, provider ids, or AI-catalogue bookkeeping columns).
 */
export function buildFavouriteSnapshot(
  plant: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) {
    const value = plant[field];
    if (value !== undefined && value !== null) snapshot[field] = value;
  }
  return snapshot;
}

/**
 * Build the NEW plants row for a copy-on-write fork ("Save as my own copy").
 *
 * The fork is the user's own copy from here on:
 *   * source = 'manual' (editable in place thereafter — the one source that
 *     edits in place under the copy-on-write rules);
 *   * provider ids are NOT carried (the copy is no longer provider-tracked);
 *   * forked_from_plant_id records provenance — the ORIGINAL's canonical id
 *     (global parent for AI rows), ON DELETE SET NULL so it degrades safely;
 *   * AI-catalogue bookkeeping (overridden_fields, care_guide_data,
 *     freshness columns) is dropped — a manual row has none.
 *
 * `formPayload` is the whitelisted plants-column payload the edit form emits
 * (ManualPlantCreation's cleanPayload); `original` supplies provenance.
 */
export function buildForkRow(
  formPayload: Record<string, unknown>,
  original: PlantIdentityInput,
): Record<string, unknown> {
  // Defensive strip — the form payload is already a column whitelist, but a
  // caller passing a merged row must never leak identity/bookkeeping columns.
  const {
    id: _id,
    home_id: _homeId,
    created_at: _createdAt,
    scientific_name_key: _snk,
    instance_count: _ic,
    inventory_items: _ii,
    source: _source,
    perenual_id: _pid,
    verdantly_id: _vid,
    forked_from_plant_id: _ffpi,
    overridden_fields: _of,
    care_guide_data: _cgd,
    updated_care_fields: _ucf,
    freshness_version: _fv,
    last_freshness_check_at: _lfca,
    last_care_generated_at: _lcga,
    ...rest
  } = formPayload;

  return {
    ...rest,
    source: "manual",
    perenual_id: null,
    verdantly_id: null,
    forked_from_plant_id: canonicalPlantRefId(original),
    overridden_fields: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AILMENT FAVOURITES (Phase 2) — source-agnostic gating reused; ailments have
// their own source vocabulary ('manual' | 'perenual' | 'ai' | 'library') and a
// canonical reference to `ailment_library` rather than to a plants row.
// ─────────────────────────────────────────────────────────────────────────────

export type AilmentSource = "manual" | "perenual" | "ai" | "library";

/**
 * Strict source × tier action gate for ailments (plan §7 + 2026-07-03 answer 5).
 * Locked sources are VIEW-ONLY: favouriting and add-to-home are both blocked.
 * Mirrors isSourceLockedForTier for plants but uses the ailment source words —
 * ailments say 'perenual' where plants say 'api'/'verdantly'.
 *
 *   source 'ai'                 → needs ai_enabled       (Sage / Evergreen)
 *   source 'perenual'           → needs enable_perenual  (Botanist / Evergreen)
 *   source 'manual' / 'library' → open to every tier (library is the free
 *                                 default search source for all tiers)
 */
export function isAilmentSourceLockedForTier(
  source: AilmentSource | string | null | undefined,
  flags: TierFlags,
): boolean {
  if (source === "ai") return !flags.aiEnabled;
  if (source === "perenual") return !flags.perenualEnabled;
  return false;
}

/** Upsell copy for a tier-locked ailment source (tooltips on disabled controls). */
export function lockedAilmentSourceMessage(
  source: AilmentSource | string | null | undefined,
): string {
  if (source === "ai") {
    return "AI ailments need an AI-enabled plan (Sage or Evergreen) — upgrade to act on this ailment.";
  }
  if (source === "perenual") {
    return "Plant-database ailments need the species database (Botanist or Evergreen) — upgrade to act on this ailment.";
  }
  return "";
}

/**
 * The dedupe identity key for an ailment favourite that has no library
 * reference: the lowercased, whitespace-collapsed name — mirroring
 * `ailment_library.name_key`'s generated expression so a manual favourite and a
 * would-be library match hash the same way.
 */
export function ailmentIdentityKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fields the ailment favourite tombstone snapshot is capped to. */
export const AILMENT_SNAPSHOT_FIELDS = [
  "scientific_name",
  "description",
  "symptoms",
  "affected_plants",
  "prevention_steps",
  "remedy_steps",
  "perenual_id",
] as const;

/**
 * Build the capped tombstone snapshot for an ailment favourite. Only the fields
 * the favourite card / add-to-home copy needs — never the home-scoped
 * bookkeeping (id, home_id, created_at, is_archived).
 */
export function buildAilmentSnapshot(
  ailment: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of AILMENT_SNAPSHOT_FIELDS) {
    const value = ailment[field];
    if (value !== undefined && value !== null) snapshot[field] = value;
  }
  return snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED-PACKET FAVOURITES (Phase 3) — SNAPSHOT-ONLY (no canonical library, so no
// live-ref join and no "always live" render — packets are pure tombstones). No
// source × tier gating: seed_packets have no `source` column and packet
// favourites make zero AI/API calls, so there is nothing to gate. See
// docs/plans/cross-home-favourites-phase-3-nursery.md.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The dedupe identity key for a seed-packet favourite: the variety composited
 * with the plant common name, lowercased + whitespace-collapsed. Mirrors the
 * migration's `identity_key` expression so a UI-created favourite and a seed row
 * hash the same way. A packet with neither variety nor plant name yields "|".
 */
export function packetIdentityKey(
  variety: string | null | undefined,
  plantCommonName: string | null | undefined,
): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(variety)}|${norm(plantCommonName)}`;
}

/** Fields the seed-packet favourite snapshot is capped to — the variety
 *  reference only. NEVER live stock / sowings (physical home state). */
export const PACKET_SNAPSHOT_FIELDS = [
  "sow_by",
  "notes",
  "quantity_remaining",
  "purchased_on",
  "opened_on",
] as const;

/**
 * Build the capped snapshot for a seed-packet favourite. Only the variety
 * reference fields — never the home-scoped bookkeeping (id, home_id, is_archived,
 * created_at) or any sowing/germination state.
 */
export function buildPacketSnapshot(
  packet: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of PACKET_SNAPSHOT_FIELDS) {
    const value = packet[field];
    if (value !== undefined && value !== null) snapshot[field] = value;
  }
  return snapshot;
}
