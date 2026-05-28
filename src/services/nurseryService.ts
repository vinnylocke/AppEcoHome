// The Nursery — client service for seed packets + sowings.
//
// Reads from the `seed_packets_with_germination` view (which joins the
// latest observed sowing + active in-progress sowing in a single round
// trip). Writes go straight to `seed_packets` / `seed_sowings`.
//
// Wave 1: read-only. Add/log/observe/plant-out helpers land in later
// waves alongside their modals.

import { supabase } from "../lib/supabase";

export type SowingStatus = "sown" | "germinated" | "planted_out" | "discarded";

export interface SeedPacket {
  id: string;
  home_id: string;
  plant_id: number | null;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
  is_archived: boolean;
  /** Public URL of the packet photo captured via the Nursery scan flow.
   *  Null when the packet was added manually or via bulk paste. */
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Row shape returned by `seed_packets_with_germination` — every
 * `SeedPacket` column plus the latest observed sowing + the active
 * in-progress sowing, joined LATERAL in the view.
 */
export interface SeedPacketWithGermination extends SeedPacket {
  latest_germination_observed_on: string | null;
  latest_germination_rate_pct: number | null;
  latest_germination_sample_size: number | null;
  active_sowing_id: string | null;
  active_sowing_status: SowingStatus | null;
  active_sowing_sown_count: number | null;
}

export interface SeedSowing {
  id: string;
  home_id: string;
  seed_packet_id: string;
  sown_on: string;
  sown_count: number;
  observed_on: string | null;
  germinated_count: number | null;
  status: SowingStatus;
  planted_out_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Plant catalogue fields we hydrate alongside each packet for display. */
export interface PacketPlantSummary {
  id: number;
  common_name: string | null;
  scientific_name: string | null;
}

export interface NurseryListEntry {
  packet: SeedPacketWithGermination;
  plant: PacketPlantSummary | null;
}

/**
 * Fetch all non-archived packets for a home, hydrated with plant info.
 *
 * The view returns packet rows already enriched with germination context;
 * we follow with one batched query against `plants` to attach the common
 * name + scientific name. Two roundtrips, no per-packet N+1.
 */
export async function fetchNurseryPackets(
  homeId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<NurseryListEntry[]> {
  const { includeArchived = false } = opts;

  let query = supabase
    .from("seed_packets_with_germination")
    .select("*")
    .eq("home_id", homeId)
    .order("sow_by", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) throw error;
  const packets = (data ?? []) as SeedPacketWithGermination[];

  // Hydrate plant info in a single follow-up query.
  const plantIds = Array.from(
    new Set(packets.map((p) => p.plant_id).filter((id): id is number => id != null)),
  );
  let plantById: Map<number, PacketPlantSummary> = new Map();
  if (plantIds.length > 0) {
    const { data: plants, error: plantsErr } = await supabase
      .from("plants")
      .select("id, common_name, scientific_name")
      .in("id", plantIds);
    if (plantsErr) throw plantsErr;
    plantById = new Map(
      (plants ?? []).map((p) => [
        p.id as number,
        {
          id: p.id as number,
          common_name: (p as { common_name?: string | null }).common_name ?? null,
          scientific_name:
            (p as { scientific_name?: string | null }).scientific_name ?? null,
        } satisfies PacketPlantSummary,
      ]),
    );
  }

  return packets.map((packet) => ({
    packet,
    plant: packet.plant_id != null ? plantById.get(packet.plant_id) ?? null : null,
  }));
}

/**
 * Fetch every sowing for a given packet, newest first. Used by the
 * Packet Detail modal in later waves.
 */
export async function fetchSowingsForPacket(
  seedPacketId: string,
): Promise<SeedSowing[]> {
  const { data, error } = await supabase
    .from("seed_sowings")
    .select("*")
    .eq("seed_packet_id", seedPacketId)
    .order("sown_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeedSowing[];
}

// ── Writes ────────────────────────────────────────────────────────────────

export interface CreateSeedPacketInput {
  home_id: string;
  plant_id: number | null;
  variety?: string | null;
  vendor?: string | null;
  purchased_on?: string | null;
  opened_on?: string | null;
  sow_by?: string | null;
  quantity_remaining?: string | null;
  notes?: string | null;
  /** Optional public URL of a captured packet photo — set by the
   *  Scan-a-packet flow after a successful Storage upload. */
  image_url?: string | null;
}

export async function createSeedPacket(
  input: CreateSeedPacketInput,
): Promise<SeedPacket> {
  const { data, error } = await supabase
    .from("seed_packets")
    .insert({
      home_id: input.home_id,
      plant_id: input.plant_id,
      variety: input.variety ?? null,
      vendor: input.vendor ?? null,
      purchased_on: input.purchased_on ?? null,
      opened_on: input.opened_on ?? null,
      sow_by: input.sow_by ?? null,
      quantity_remaining: input.quantity_remaining ?? null,
      notes: input.notes ?? null,
      image_url: input.image_url ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SeedPacket;
}

/**
 * Set the packet's image_url after a deferred Storage upload (the
 * scan flow uploads AFTER the packet row exists, so the upload key
 * can use the packet's UUID).
 */
export async function setSeedPacketImageUrl(
  packetId: string,
  imageUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from("seed_packets")
    .update({ image_url: imageUrl })
    .eq("id", packetId);
  if (error) throw error;
}

export async function updateSeedPacket(
  packetId: string,
  patch: Partial<Omit<CreateSeedPacketInput, "home_id">>,
): Promise<SeedPacket> {
  const { data, error } = await supabase
    .from("seed_packets")
    .update(patch)
    .eq("id", packetId)
    .select("*")
    .single();
  if (error) throw error;
  return data as SeedPacket;
}

export async function archiveSeedPacket(packetId: string): Promise<void> {
  const { error } = await supabase
    .from("seed_packets")
    .update({ is_archived: true })
    .eq("id", packetId);
  if (error) throw error;
}

export async function unarchiveSeedPacket(packetId: string): Promise<void> {
  const { error } = await supabase
    .from("seed_packets")
    .update({ is_archived: false })
    .eq("id", packetId);
  if (error) throw error;
}

export interface LogSowingInput {
  home_id: string;
  seed_packet_id: string;
  sown_on: string; // YYYY-MM-DD
  sown_count: number;
  notes?: string | null;
  /** When set, back-links the sowing to the task that triggered it.
   *  A unique partial index on seed_sowings(task_id) makes this
   *  idempotent — re-completing a task won't create a duplicate row. */
  task_id?: string | null;
}

export async function logSowing(input: LogSowingInput): Promise<SeedSowing> {
  const { data, error } = await supabase
    .from("seed_sowings")
    .insert({
      home_id: input.home_id,
      seed_packet_id: input.seed_packet_id,
      sown_on: input.sown_on,
      sown_count: input.sown_count,
      notes: input.notes ?? null,
      status: "sown",
      task_id: input.task_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SeedSowing;
}

export interface ObserveSowingInput {
  sowing_id: string;
  observed_on: string; // YYYY-MM-DD
  germinated_count: number;
  notes?: string | null;
}

export async function observeSowing(
  input: ObserveSowingInput,
): Promise<SeedSowing> {
  // Preserve any existing notes the user wrote on the sowing — the
  // observation appends a separate paragraph instead of overwriting.
  const { data: existing } = await supabase
    .from("seed_sowings")
    .select("notes")
    .eq("id", input.sowing_id)
    .single();

  let mergedNotes: string | null = existing?.notes ?? null;
  if (input.notes?.trim()) {
    const appended = `Observed ${input.observed_on}: ${input.notes.trim()}`;
    mergedNotes = mergedNotes ? `${mergedNotes}\n${appended}` : appended;
  }

  const { data, error } = await supabase
    .from("seed_sowings")
    .update({
      observed_on: input.observed_on,
      germinated_count: input.germinated_count,
      status: "germinated",
      notes: mergedNotes,
    })
    .eq("id", input.sowing_id)
    .select("*")
    .single();
  if (error) throw error;
  return data as SeedSowing;
}

/**
 * Sum the `quantity` already planted out from a sowing — i.e. how many
 * seedlings have graduated into `inventory_items` via the Plant Out flow.
 * Used by the modal to enforce "you can't plant out more than germinated_count"
 * and to decide whether to flip status to `planted_out` after the next batch.
 */
export async function fetchPlantedOutTotal(sowingId: string): Promise<number> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("quantity")
    .eq("from_sowing_id", sowingId);
  if (error) throw error;
  return (data ?? []).reduce(
    (sum, row) => sum + (Number((row as { quantity?: number }).quantity ?? 0) || 0),
    0,
  );
}

export interface PlantOutSowingInput {
  home_id: string;
  sowing_id: string;
  plant_id: number;
  /** When supplied, the resulting instance is placed in this area. */
  location_id: string | null;
  location_name: string | null;
  area_id: string | null;
  area_name: string | null;
  planted_at: string; // YYYY-MM-DD
  quantity: number;
  nickname?: string | null;
}

export interface PlantOutSowingResult {
  inventory_item: { id: string; home_id: string; plant_id: string; area_id: string | null; quantity: number };
  sowing_status: SowingStatus;
  remaining_to_plant_out: number;
}

/**
 * Create an `inventory_items` row from a sowing, update the sowing's
 * status, and return enough context for the caller to fire
 * `AutomationEngine.applyPlantedAutomations` against the right area.
 *
 * **Partial plant-outs**: the sowing only flips to `planted_out` once
 * the cumulative quantity across all `inventory_items.from_sowing_id`
 * rows hits `germinated_count`. Until then it stays at `germinated` so
 * the user can plant out the remainder in a second pass.
 */
export async function plantOutSowing(
  input: PlantOutSowingInput,
): Promise<PlantOutSowingResult> {
  if (input.quantity <= 0) throw new Error("Quantity must be at least 1.");

  // 1. Confirm we won't exceed germinated_count.
  const { data: sowing, error: sowingErr } = await supabase
    .from("seed_sowings")
    .select("germinated_count, status")
    .eq("id", input.sowing_id)
    .single();
  if (sowingErr) throw sowingErr;
  const germinated = sowing?.germinated_count ?? 0;
  if (germinated <= 0) {
    throw new Error(
      "Observe the sowing first so we know how many seedlings are ready.",
    );
  }
  const alreadyPlanted = await fetchPlantedOutTotal(input.sowing_id);
  const remainingBefore = germinated - alreadyPlanted;
  if (remainingBefore <= 0) {
    throw new Error("All seedlings from this sowing are already planted out.");
  }
  if (input.quantity > remainingBefore) {
    throw new Error(
      `Only ${remainingBefore} seedling${remainingBefore === 1 ? "" : "s"} left to plant out.`,
    );
  }

  // 2. Create the inventory_items row. `from_sowing_id` is the new FK
  //    column added in the Wave-1 migration.
  const { data: inv, error: invErr } = await supabase
    .from("inventory_items")
    .insert({
      home_id: input.home_id,
      plant_id: String(input.plant_id),
      from_sowing_id: input.sowing_id,
      status: "Planted",
      growth_state: "Seedling",
      is_established: false,
      quantity: input.quantity,
      planted_at: input.planted_at,
      location_id: input.location_id,
      location_name: input.location_name,
      area_id: input.area_id,
      area_name: input.area_name,
      identifier: input.nickname?.trim() || null,
    })
    .select("id, home_id, plant_id, area_id, quantity")
    .single();
  if (invErr) throw invErr;

  // 3. Decide the sowing's next status.
  const remainingAfter = remainingBefore - input.quantity;
  const nextStatus: SowingStatus = remainingAfter <= 0 ? "planted_out" : "germinated";

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "planted_out") {
    patch.planted_out_at = input.planted_at;
  }
  const { error: updateErr } = await supabase
    .from("seed_sowings")
    .update(patch)
    .eq("id", input.sowing_id);
  if (updateErr) throw updateErr;

  return {
    inventory_item: inv as PlantOutSowingResult["inventory_item"],
    sowing_status: nextStatus,
    remaining_to_plant_out: Math.max(0, remainingAfter),
  };
}

export async function discardSowing(
  sowingId: string,
  reason?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status: "discarded" };
  if (reason?.trim()) {
    const { data: existing } = await supabase
      .from("seed_sowings")
      .select("notes")
      .eq("id", sowingId)
      .single();
    const appended = `Discarded: ${reason.trim()}`;
    patch.notes = existing?.notes ? `${existing.notes}\n${appended}` : appended;
  }
  const { error } = await supabase
    .from("seed_sowings")
    .update(patch)
    .eq("id", sowingId);
  if (error) throw error;
}

export const NurseryService = {
  fetchPackets: fetchNurseryPackets,
  fetchSowings: fetchSowingsForPacket,
  createPacket: createSeedPacket,
  updatePacket: updateSeedPacket,
  archivePacket: archiveSeedPacket,
  unarchivePacket: unarchiveSeedPacket,
  logSowing,
  observeSowing,
  discardSowing,
  plantOutSowing,
  fetchPlantedOutTotal,
  setPacketImageUrl: setSeedPacketImageUrl,
};
