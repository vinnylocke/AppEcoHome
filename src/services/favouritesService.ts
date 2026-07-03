// Cross-home favourites service — Phase 1 (plants).
//
// All queries here are USER-scoped (user_id only — never filter favourites by
// home_id; a home filter would silently return nothing under the user-scoped
// RLS). See docs/plans/cross-home-favourites.md.
//
// Add-to-home is copy semantics via the existing add-plant insert path
// (`saveToShed`) — zero AI/API calls, allowed for ANY home member regardless
// of per-member permission keys (2026-07-03 final decisions).

import { supabase } from "../lib/supabase";
import { saveToShed } from "../lib/saveToShed";
import { Logger } from "../lib/errorHandler";
import {
  createSeedPacket,
  setSeedPacketImageUrl,
  type SeedPacketWithGermination,
} from "./nurseryService";
import {
  ailmentIdentityKey,
  buildAilmentSnapshot,
  buildFavouriteSnapshot,
  buildPacketSnapshot,
  canonicalPlantRefId,
  packetIdentityKey,
  type PlantIdentityInput,
} from "../lib/favouriteIdentity";
import type {
  FavouriteAilment,
  FavouritePlant,
  FavouriteSeedPacket,
} from "../types";

/** Columns selected for the live joined plant — the favourite card render set. */
const LIVE_PLANT_SELECT =
  "id, common_name, scientific_name, source, thumbnail_url, home_id, " +
  "description, plant_type, cycle, care_level, growth_rate, maintenance, " +
  "watering, watering_min_days, watering_max_days, sunlight, " +
  "flowering_season, harvest_season, pruning_month, propagation, attracts, " +
  "is_toxic_humans, is_toxic_pets, indoor, is_edible, drought_tolerant, " +
  "tropical, medicinal, cuisine, labels, freshness_version, plant_metadata";

/** List the current user's favourite plants, newest first, with the live
 *  referenced plant joined (null → tombstone render). */
export async function listFavouritePlants(): Promise<FavouritePlant[]> {
  const { data, error } = await supabase
    .from("user_favourite_plants")
    .select(
      `*, plant:plants(${LIVE_PLANT_SELECT}), favourited_from_home:homes(name)`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FavouritePlant[];
}

/**
 * Favourite a plant (idempotent). Resolves the canonical reference id, builds
 * the tombstone snapshot, and upserts on (user_id, plant_id) — re-favouriting
 * the same id refreshes the tombstone instead of erroring.
 */
export async function favouritePlant(
  plant: PlantIdentityInput & Record<string, unknown>,
  homeId: string | null,
): Promise<FavouritePlant> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Not signed in");

  const refId = canonicalPlantRefId(plant);
  const row = {
    user_id: userId,
    plant_id: refId,
    source: (plant.source as string) ?? "manual",
    common_name: (plant.common_name as string) ?? "Unknown plant",
    scientific_name: Array.isArray(plant.scientific_name)
      ? plant.scientific_name
      : [],
    image_url: (plant.thumbnail_url as string | null) ?? null,
    snapshot: buildFavouriteSnapshot(plant),
    favourited_from_home_id: homeId,
  };

  const { data, error } = await supabase
    .from("user_favourite_plants")
    .upsert(row, { onConflict: "user_id,plant_id" })
    .select()
    .single();
  if (error) throw error;
  return data as FavouritePlant;
}

/** Remove a favourite by its row id. Never touches any home row. */
export async function unfavouritePlant(favouriteId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favourite_plants")
    .delete()
    .eq("id", favouriteId);
  if (error) throw error;
}

/** Remove a favourite by its canonical plant reference id. */
export async function unfavouritePlantByRef(plantRefId: number): Promise<void> {
  const { error } = await supabase
    .from("user_favourite_plants")
    .delete()
    .eq("plant_id", plantRefId);
  if (error) throw error;
}

/**
 * Is this favourite's plant already present in the given home's shed?
 * Presence = a home row that IS the reference (manual favourite of a row in
 * this home) or a home row copied/forked from it (`forked_from_plant_id`
 * back-reference set by add-to-home and by copy-on-write forks).
 */
export function isFavouriteInHome(
  favourite: Pick<FavouritePlant, "plant_id" | "common_name">,
  homePlants: Array<{
    id: number;
    forked_from_plant_id?: number | null;
    common_name?: string;
    is_archived?: boolean;
  }>,
): boolean {
  if (favourite.plant_id != null) {
    return homePlants.some(
      (p) =>
        p.id === favourite.plant_id ||
        p.forked_from_plant_id === favourite.plant_id,
    );
  }
  // Tombstone: fall back to a case-insensitive name match (best effort).
  const name = favourite.common_name.trim().toLowerCase();
  return homePlants.some((p) => p.common_name?.trim().toLowerCase() === name);
}

/**
 * Copy a favourite into the active home — a brand-new home-scoped `plants`
 * row via the existing `saveToShed` insert path (auto seasonal schedules
 * included, zero AI/API calls).
 *
 *   * Live reference resolves → copy from the live row ("always live");
 *     source preserved. AI/library favourites become the classic shallow
 *     fork (`source='ai'`, `forked_from_plant_id` = global id, empty
 *     overrides) and seed `user_plant_ack` at the global's current
 *     freshness version, mirroring the library-add flow.
 *   * Reference gone → copy from the tombstone snapshot.
 *
 * Returns the new home plant row.
 */
export async function addFavouritePlantToHome(
  favourite: FavouritePlant,
  homeId: string,
): Promise<Record<string, unknown>> {
  const live = favourite.plant ?? null;
  const payload: Record<string, unknown> = live
    ? { ...live }
    : { ...favourite.snapshot };

  const {
    id: _id,
    home_id: _homeId,
    created_at: _createdAt,
    scientific_name_key: _snk,
    freshness_version: _fv,
    ...care
  } = payload;

  const source = (live?.source as string) ?? favourite.source;
  const skeleton: Record<string, unknown> = {
    ...care,
    common_name: (care.common_name as string) ?? favourite.common_name,
    scientific_name: care.scientific_name ?? favourite.scientific_name,
    thumbnail_url:
      (care.thumbnail_url as string | null) ?? favourite.image_url ?? null,
    source,
    perenual_id: null,
    // Back-reference so the "In this home" check and the heart on the new
    // home row resolve to the same favourite identity.
    forked_from_plant_id: favourite.plant_id,
  };
  if (source === "ai") {
    skeleton.overridden_fields = [];
  }

  const { row } = await saveToShed(
    skeleton as Parameters<typeof saveToShed>[0],
    care,
    homeId,
  );

  // AI/library copies: seed the ack at the global's current freshness version
  // so the "Updated" chip doesn't fire on a just-added plant (mirrors the
  // bulk-add / library flow).
  if (source === "ai" && favourite.plant_id != null) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      await supabase.from("user_plant_ack").upsert(
        {
          user_id: userId,
          plant_id: favourite.plant_id,
          seen_freshness_version:
            (live?.freshness_version as number | null) ?? 1,
          acked_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plant_id" },
      );
    }
  }

  return row;
}

/**
 * Copy-on-write fork ("Save as my own copy") — editing a non-manual plant
 * creates a NEW manual row and the fork becomes the home's plant going
 * forward:
 *
 *   1. insert the fork (new id, source='manual', provenance via
 *      forked_from_plant_id — the ORIGINAL's canonical id);
 *   2. re-point the home's operational references (inventory_items,
 *      plant_schedules, seed_packets, plant_sprites, automations) from the
 *      original to the fork — instances, routines and packets carry on
 *      uninterrupted;
 *   3. delete the original home row (it was replaced, not duplicated).
 *      Favourites referencing it degrade to their tombstone — which holds
 *      exactly the pre-edit state the favouriter saved. AI/library plants'
 *      favourites reference the GLOBAL row and are unaffected.
 *
 * `forkRow` comes from buildForkRow() (already stripped + re-sourced).
 * Returns the inserted fork row.
 */
export async function forkPlantForHomeEdit(
  originalPlantId: number,
  forkRow: Record<string, unknown>,
  homeId: string,
): Promise<Record<string, unknown>> {
  // 0. SAFETY GUARD — this function re-points then DELETES the original row,
  //    which is only ever safe for a home-scoped row owned by THIS home. A
  //    global catalogue row (home_id IS NULL) is shared by every home;
  //    deleting it would corrupt data app-wide. All Shed plant queries are
  //    home-scoped today so the happy path is unaffected — but never trust
  //    a caller to have upheld that (Phases 2/3 add new edit entry points).
  const { data: original, error: originalError } = await supabase
    .from("plants")
    .select("id, home_id")
    .eq("id", originalPlantId)
    .single();
  if (originalError) throw originalError;
  if (original.home_id !== homeId) {
    throw new Error(
      `forkPlantForHomeEdit refused: plant ${originalPlantId} is not home-scoped to ` +
        `${homeId} (home_id=${original.home_id ?? "null/global"}). Refusing to ` +
        `re-point/delete a row this home does not own.`,
    );
  }

  // 1. Insert the fork. Reuse saveToShed's id generation + labels behaviour
  //    by inserting directly (no auto-schedules — the original's schedules
  //    are re-pointed below, so generating new ones would duplicate them).
  const newId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
  const { data: fork, error: insertError } = await supabase
    .from("plants")
    .insert([{ ...forkRow, id: newId, home_id: homeId }])
    .select()
    .single();
  if (insertError) throw insertError;

  // 2. Re-point home references. The original is a home-scoped row (asserted
  //    above), so every reference to it belongs to this home already.
  const repoint = async (table: string, column = "plant_id") => {
    const { error } = await supabase
      .from(table)
      .update({ [column]: fork.id })
      .eq(column, originalPlantId);
    if (error) throw new Error(`repoint ${table} failed: ${error.message}`);
  };
  await repoint("inventory_items");
  await repoint("plant_schedules");
  await repoint("seed_packets");
  await repoint("plant_sprites");
  await repoint("automations");

  // 3. Delete the original (favourites referencing it tombstone via
  //    ON DELETE SET NULL — by design, the tombstone is the pre-edit state).
  const { error: deleteError } = await supabase
    .from("plants")
    .delete()
    .eq("id", originalPlantId);
  if (deleteError) throw deleteError;

  return fork as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AILMENT FAVOURITES (Phase 2) — mirrors the plant functions above.
//
// Reference = the GLOBAL `ailment_library` row (immutable, stable across homes),
// resolved by name_key at favourite time because the home `ailments` row carries
// no library link column. NULL ref → pure snapshot tombstone. Add-to-home is a
// plain `ailments` insert (NO fork — ailments have no shared-catalogue edit
// path, so there is no copy-on-write requirement). Open to any home member.
// ─────────────────────────────────────────────────────────────────────────────

/** Columns selected for the live joined library row — the favourite card render set. */
const LIVE_AILMENT_LIBRARY_SELECT =
  "id, name, kind, scientific_name, description, symptoms, causes, treatment, " +
  "prevention, severity, affected_plant_types, thumbnail_url, image_url";

/** List the current user's favourite ailments, newest first, with the live
 *  referenced ailment_library row joined (null → tombstone render). */
export async function listFavouriteAilments(): Promise<FavouriteAilment[]> {
  const { data, error } = await supabase
    .from("user_favourite_ailments")
    .select(
      `*, library:ailment_library(${LIVE_AILMENT_LIBRARY_SELECT}), favourited_from_home:homes(name)`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FavouriteAilment[];
}

/** The shape favouriteAilment needs from a watchlist ailment row. */
export interface AilmentFavouriteInput {
  id: string;
  name: string;
  type: "invasive_plant" | "pest" | "disease";
  source: "manual" | "perenual" | "ai" | "library" | string;
  thumbnail_url?: string | null;
  scientific_name?: string | null;
  description?: string | null;
  symptoms?: unknown;
  affected_plants?: unknown;
  prevention_steps?: unknown;
  remedy_steps?: unknown;
  perenual_id?: number | null;
  [key: string]: unknown;
}

/**
 * Best-effort: resolve the canonical `ailment_library.id` for a home ailment by
 * matching its name against the library's generated name_key. The home
 * `ailments` row has no library FK, so this is the only way to give a favourite
 * an "always live" reference. Returns null when nothing matches (→ tombstone).
 */
export async function resolveAilmentLibraryId(
  name: string | null | undefined,
): Promise<number | null> {
  const key = ailmentIdentityKey(name);
  if (!key) return null;
  // ailment_library.name_key is lower(trim(collapse-whitespace(name))). Match on
  // an ilike of the raw name (equality on the generated column isn't exposed to
  // PostgREST); fall back to a client-side name_key compare on the small set.
  const { data, error } = await supabase
    .from("ailment_library")
    .select("id, name")
    .ilike("name", name ?? "")
    .limit(5);
  if (error || !data?.length) return null;
  const match = data.find((r) => ailmentIdentityKey(r.name as string) === key);
  return match ? (match.id as number) : null;
}

/**
 * Favourite an ailment (idempotent). Resolves the canonical library reference,
 * builds the tombstone snapshot, and upserts — on (user_id, ailment_library_id)
 * for library-backed favourites, else on (user_id, identity_key) for tombstones.
 */
export async function favouriteAilment(
  ailment: AilmentFavouriteInput,
  homeId: string | null,
): Promise<FavouriteAilment> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Not signed in");

  const libraryId = await resolveAilmentLibraryId(ailment.name);
  const identityKey = ailmentIdentityKey(ailment.name);
  const row = {
    user_id: userId,
    ailment_library_id: libraryId,
    identity_key: identityKey,
    source: (ailment.source as string) ?? "manual",
    name: ailment.name ?? "Unknown ailment",
    ailment_type: ailment.type,
    thumbnail_url: ailment.thumbnail_url ?? null,
    snapshot: buildAilmentSnapshot(ailment as Record<string, unknown>),
    favourited_from_home_id: homeId,
  };

  // The table has TWO partial unique indexes (one per reference-present case),
  // which PostgREST's on_conflict cannot disambiguate — so do an explicit
  // find-then-update-or-insert instead of an upsert. Idempotent: re-favouriting
  // the same identity refreshes the tombstone. Match on the library id when
  // present, else the identity_key.
  const existingQuery = supabase
    .from("user_favourite_ailments")
    .select("id")
    .eq("user_id", userId);
  const { data: existing } = await (
    libraryId != null
      ? existingQuery.eq("ailment_library_id", libraryId)
      : existingQuery.is("ailment_library_id", null).eq("identity_key", identityKey)
  ).maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("user_favourite_ailments")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as FavouriteAilment;
  }

  const { data, error } = await supabase
    .from("user_favourite_ailments")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as FavouriteAilment;
}

/** Remove a favourite ailment by its row id. Never touches any home row. */
export async function unfavouriteAilment(favouriteId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favourite_ailments")
    .delete()
    .eq("id", favouriteId);
  if (error) throw error;
}

/**
 * Is this favourite ailment already present in the given home's watchlist?
 * Presence = a case-insensitive name match against the home's ailments (the
 * only stable identity across the library-less home ailments).
 */
export function isFavouriteAilmentInHome(
  favourite: Pick<FavouriteAilment, "identity_key" | "name">,
  homeAilments: Array<{ name?: string }>,
): boolean {
  const key = favourite.identity_key || ailmentIdentityKey(favourite.name);
  return homeAilments.some((a) => ailmentIdentityKey(a.name) === key);
}

/**
 * Copy a favourite ailment into the active home — a brand-new home-scoped
 * `ailments` row via the same insert path the watchlist "add" flow uses. Zero
 * AI/API calls. Live library reference wins for the copy payload; otherwise the
 * snapshot tombstone is copied. Returns the new home ailment row.
 */
export async function addFavouriteAilmentToHome(
  favourite: FavouriteAilment,
  homeId: string,
): Promise<Record<string, unknown>> {
  const lib = favourite.library ?? null;
  const snap = favourite.snapshot ?? {};

  // Symptoms in the library are string[]; in the home ailment they're objects.
  // Prefer the snapshot's already-home-shaped values; fall back to library.
  const payload = {
    home_id: homeId,
    name: (lib?.name as string) ?? favourite.name,
    scientific_name:
      (lib?.scientific_name as string | null) ??
      (snap.scientific_name as string | null) ??
      null,
    type: favourite.ailment_type,
    description:
      (lib?.description as string | null) ??
      (snap.description as string | null) ??
      "",
    symptoms: (snap.symptoms as unknown[]) ?? [],
    affected_plants: (snap.affected_plants as unknown[]) ?? [],
    prevention_steps: (snap.prevention_steps as unknown[]) ?? [],
    remedy_steps: (snap.remedy_steps as unknown[]) ?? [],
    // Preserve the source the user favourited (library rows stay 'library').
    source: favourite.source,
    perenual_id: (snap.perenual_id as number | null) ?? null,
    thumbnail_url:
      favourite.thumbnail_url ??
      (lib?.thumbnail_url as string | null) ??
      (lib?.image_url as string | null) ??
      null,
  };

  const { data, error } = await supabase
    .from("ailments")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED-PACKET FAVOURITES (Phase 3 — FINAL) — SNAPSHOT-ONLY.
//
// Packets have NO canonical library, so a favourite is a pure tombstone: the
// variety reference (variety + vendor + plant identity) + a snapshot of the
// reference fields. There is no live-ref join. Dedupe is a single
// UNIQUE (user_id, identity_key). No tier gating — seed_packets have no `source`
// column and favouriting / add-to-home make zero AI/API calls.
//
// Packet images are HOME-scoped (`seed-packet-images/{home_id}/{packet_id}.jpg`),
// so the favourite copies the object to a favourite-scoped path
// (`seed-packet-images/favourites/{user_id}/{favourite_id}.jpg`) at favourite
// time — the copied URL is what the card + add-to-home use, so the favourite
// survives the home packet's deletion. Add-to-home copies the image BACK into
// the new home path. See docs/plans/cross-home-favourites-phase-3-nursery.md.
// ─────────────────────────────────────────────────────────────────────────────

const PACKET_BUCKET = "seed-packet-images";

/** List the current user's favourite seed packets, newest first. */
export async function listFavouriteSeedPackets(): Promise<FavouriteSeedPacket[]> {
  const { data, error } = await supabase
    .from("user_favourite_seed_packets")
    .select("*, favourited_from_home:homes(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FavouriteSeedPacket[];
}

/** The shape favouriteSeedPacket needs from a nursery list entry. */
export interface PacketFavouriteInput {
  id: string;
  home_id: string;
  plant_id: number | null;
  variety: string | null;
  vendor: string | null;
  image_url: string | null;
  plant_common_name?: string | null;
  sow_by?: string | null;
  notes?: string | null;
  quantity_remaining?: string | null;
  purchased_on?: string | null;
  opened_on?: string | null;
  [key: string]: unknown;
}

/**
 * Copy a Storage object within the seed-packet-images bucket. Downloads the
 * source object and re-uploads it at `destPath`. Best-effort — returns the
 * destination public URL, or null if anything fails (missing source, network).
 */
async function copyPacketImage(
  fromPublicUrl: string | null | undefined,
  destPath: string,
): Promise<string | null> {
  if (!fromPublicUrl) return null;
  try {
    // The public URL ends with `/object/public/seed-packet-images/<path>`.
    const marker = `/${PACKET_BUCKET}/`;
    const idx = fromPublicUrl.indexOf(marker);
    if (idx === -1) return null;
    const srcPath = decodeURIComponent(
      fromPublicUrl.slice(idx + marker.length).split("?")[0],
    );
    const { data: blob, error: dlErr } = await supabase.storage
      .from(PACKET_BUCKET)
      .download(srcPath);
    if (dlErr || !blob) return null;
    const { error: upErr } = await supabase.storage
      .from(PACKET_BUCKET)
      .upload(destPath, blob, { upsert: true, contentType: "image/jpeg" });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage
      .from(PACKET_BUCKET)
      .getPublicUrl(destPath);
    return pub?.publicUrl ?? null;
  } catch (err) {
    Logger.warn("copyPacketImage failed", { destPath, err });
    return null;
  }
}

/**
 * Favourite a seed packet (idempotent). Builds the identity key + snapshot,
 * upserts on (user_id, identity_key), then copies the packet image (if any)
 * into the favourite-scoped path so the favourite survives the home packet's
 * deletion. Re-favouriting the same variety refreshes the snapshot + image.
 */
export async function favouriteSeedPacket(
  packet: PacketFavouriteInput,
  homeId: string | null,
): Promise<FavouriteSeedPacket> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Not signed in");

  const identityKey = packetIdentityKey(
    packet.variety,
    packet.plant_common_name ?? null,
  );
  const row = {
    user_id: userId,
    seed_packet_id: packet.id,
    plant_id: packet.plant_id ?? null,
    plant_common_name: packet.plant_common_name ?? null,
    variety: packet.variety ?? null,
    vendor: packet.vendor ?? null,
    identity_key: identityKey,
    snapshot: buildPacketSnapshot(packet as Record<string, unknown>),
    favourited_from_home_id: homeId,
  };

  const { data, error } = await supabase
    .from("user_favourite_seed_packets")
    .upsert(row, { onConflict: "user_id,identity_key" })
    .select()
    .single();
  if (error) throw error;
  const fav = data as FavouriteSeedPacket;

  // Copy the packet image into the favourite-scoped path (best-effort).
  if (packet.image_url) {
    const destPath = `favourites/${userId}/${fav.id}.jpg`;
    const copied = await copyPacketImage(packet.image_url, destPath);
    if (copied) {
      const { data: updated } = await supabase
        .from("user_favourite_seed_packets")
        .update({ copied_image_url: copied })
        .eq("id", fav.id)
        .select()
        .single();
      if (updated) return updated as FavouriteSeedPacket;
    }
  }
  return fav;
}

/** Remove a favourite seed packet by its row id. Never touches any home row. */
export async function unfavouriteSeedPacket(favouriteId: string): Promise<void> {
  const { error } = await supabase
    .from("user_favourite_seed_packets")
    .delete()
    .eq("id", favouriteId);
  if (error) throw error;
}

/**
 * Is this favourite packet's variety already present in the given home's
 * nursery? Presence = a home packet with the same identity_key (variety +
 * plant name), the only stable cross-home identity for a packet.
 */
export function isFavouritePacketInHome(
  favourite: Pick<FavouriteSeedPacket, "identity_key" | "variety">,
  homeEntries: Array<{
    packet: SeedPacketWithGermination;
    plant: { common_name?: string | null } | null;
  }>,
): boolean {
  const key = favourite.identity_key;
  return homeEntries.some(
    (e) =>
      packetIdentityKey(e.packet.variety, e.plant?.common_name ?? null) === key,
  );
}

/**
 * Copy a favourite packet into the active home — a brand-new home-scoped
 * `seed_packets` row via the existing `createSeedPacket` insert path. Zero
 * AI/API calls, open to any home member (no fork). `plant_id` is linked only
 * when the same plant identity already exists in the target home's shed, else
 * NULL (the packet-detail "link plant" nudge handles that). The favourite-scoped
 * image (if any) is copied BACK into the new home path. Returns the new packet.
 */
export async function addFavouritePacketToHome(
  favourite: FavouriteSeedPacket,
  homeId: string,
): Promise<Record<string, unknown>> {
  // Resolve plant_id in the target home by the favourite's plant name (the
  // stored plant_id may reference a plant in another home).
  let targetPlantId: number | null = null;
  const name = (favourite.plant_common_name ?? "").trim().toLowerCase();
  if (name) {
    const { data: homePlants } = await supabase
      .from("plants")
      .select("id, common_name")
      .eq("home_id", homeId)
      .eq("is_archived", false);
    const match = (homePlants ?? []).find(
      (p) => (p.common_name as string)?.trim().toLowerCase() === name,
    );
    targetPlantId = match ? (match.id as number) : null;
  }

  const snap = favourite.snapshot ?? {};
  const created = await createSeedPacket({
    home_id: homeId,
    plant_id: targetPlantId,
    variety: favourite.variety,
    vendor: favourite.vendor,
    sow_by: (snap.sow_by as string | null) ?? null,
    notes: (snap.notes as string | null) ?? null,
    quantity_remaining: (snap.quantity_remaining as string | null) ?? null,
    purchased_on: (snap.purchased_on as string | null) ?? null,
    opened_on: (snap.opened_on as string | null) ?? null,
  });

  // Copy the favourite-scoped image back into the new home path (best-effort).
  if (favourite.copied_image_url) {
    const destPath = `${homeId}/${created.id}.jpg`;
    const copied = await copyPacketImage(favourite.copied_image_url, destPath);
    if (copied) {
      await setSeedPacketImageUrl(created.id, copied);
    }
  }

  return created as unknown as Record<string, unknown>;
}
