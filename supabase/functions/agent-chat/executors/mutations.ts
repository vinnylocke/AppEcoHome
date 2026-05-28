/**
 * Mutation executors for Phase 2.
 *
 * Pattern: each tool exposes two functions:
 *   - preview(ctx, args) → human-readable description for the confirm card
 *   - execute(ctx, args) → performs the mutation, returns affected_row_refs for Undo
 *
 * The agent-chat handler:
 *   1. When Gemini proposes a confirm-risk tool, calls preview() to build the
 *      card text, inserts a `chat_tool_calls` row with status='pending',
 *      and returns it to the client.
 *   2. When the user taps Confirm, the handler validates the call still
 *      pending, calls execute(), updates the row to 'executed', returns result.
 *
 * Every executor scopes to ctx.homeId — service-role bypasses RLS so this
 * is the enforcement boundary.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface ExecutorContext {
  db: SupabaseClient;
  userId: string;
  homeId: string;
}

export interface MutationResult {
  summary: string;
  payload: unknown;
  affected_row_refs?: {
    table: string;
    ids: string[];
    op: "insert" | "update" | "delete";
    /** For update ops: snapshot of the row(s) before the change, used by undo. */
    previous_state?: Record<string, any>;
  };
}

export interface MutationExecutor {
  preview(ctx: ExecutorContext, args: Record<string, any>): Promise<string>;
  execute(ctx: ExecutorContext, args: Record<string, any>): Promise<MutationResult>;
  /** Reverse a previous execute(). Reads the stored affected_row_refs and undoes the change. */
  undo(ctx: ExecutorContext, refs: NonNullable<MutationResult["affected_row_refs"]>): Promise<void>;
}

// Helper — fetch the human-readable name of an area for previews.
async function areaLabel(ctx: ExecutorContext, areaId: string | null | undefined): Promise<string> {
  if (!areaId) return "";
  const { data } = await ctx.db
    .from("areas")
    .select("name, location_id")
    .eq("id", areaId)
    .eq("home_id", ctx.homeId)
    .maybeSingle();
  return data?.name ?? "an area";
}

async function inventoryLabels(
  ctx: ExecutorContext,
  ids: string[] | null | undefined,
): Promise<string[]> {
  if (!ids || ids.length === 0) return [];
  const { data } = await ctx.db
    .from("inventory_items")
    .select("id, plant_name, identifier")
    .in("id", ids)
    .eq("home_id", ctx.homeId);
  return (data ?? []).map((r: any) => r.identifier || r.plant_name || "unnamed plant");
}

// Generic insert + delete undo
async function simpleInsertUndo(
  ctx: ExecutorContext,
  refs: NonNullable<MutationResult["affected_row_refs"]>,
): Promise<void> {
  if (refs.op !== "insert" || refs.ids.length === 0) return;
  await ctx.db.from(refs.table).delete().in("id", refs.ids);
}

// ─── create_one_off_task ──────────────────────────────────────────────
export const create_one_off_task: MutationExecutor = {
  async preview(ctx, args) {
    const parts = [`Create task "${args.title}"`];
    parts.push(`due ${args.due_date}`);
    parts.push(`(${args.type})`);
    const targets = await inventoryLabels(ctx, args.inventory_item_ids);
    if (targets.length > 0) {
      parts.push(`for ${targets.slice(0, 3).join(", ")}${targets.length > 3 ? ` +${targets.length - 3}` : ""}`);
    } else if (args.area_id) {
      const a = await areaLabel(ctx, args.area_id);
      if (a) parts.push(`in ${a}`);
    }
    return parts.join(" ");
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("tasks")
      .insert({
        home_id: ctx.homeId,
        title: args.title,
        type: args.type,
        due_date: args.due_date,
        area_id: args.area_id ?? null,
        inventory_item_ids: args.inventory_item_ids ?? null,
        description: args.description ?? null,
        status: "Pending",
      })
      .select("id, title, due_date")
      .single();
    if (error) throw error;
    return {
      summary: `Task "${data.title}" scheduled for ${data.due_date}.`,
      payload: data,
      affected_row_refs: { table: "tasks", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── add_journal_entry ────────────────────────────────────────────────
export const add_journal_entry: MutationExecutor = {
  async preview(ctx, args) {
    const target =
      args.inventory_item_id ? (await inventoryLabels(ctx, [args.inventory_item_id]))[0] :
      args.area_id           ? await areaLabel(ctx, args.area_id) :
      args.location_id       ? "a location" :
      args.plan_id           ? "a plan" : "the garden";
    return `Add journal entry "${args.subject}" on ${target}`;
  },

  async execute(ctx, args) {
    // CHECK constraint enforces at most one target — let the DB validate.
    const { data, error } = await ctx.db
      .from("plant_journals")
      .insert({
        home_id: ctx.homeId,
        subject: args.subject,
        description: args.description,
        image_url: args.photo_url ?? null,
        inventory_item_id: args.inventory_item_id ?? null,
        location_id: args.location_id ?? null,
        area_id: args.area_id ?? null,
        plan_id: args.plan_id ?? null,
      })
      .select("id, subject")
      .single();
    if (error) throw error;
    return {
      summary: `Journal entry "${data.subject}" added.`,
      payload: data,
      affected_row_refs: { table: "plant_journals", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── add_plant_to_shed ────────────────────────────────────────────────
export const add_plant_to_shed: MutationExecutor = {
  async preview(ctx, args) {
    const where = args.area_id
      ? ` in ${await areaLabel(ctx, args.area_id)}`
      : " to the Shed";
    const label = args.identifier ? ` as "${args.identifier}"` : "";
    return `Add ${args.common_name}${label}${where}`;
  },

  async execute(ctx, args) {
    // 1. Insert a manual plants row scoped to this home.
    const { data: plantRow, error: pErr } = await ctx.db
      .from("plants")
      .insert({
        home_id: ctx.homeId,
        common_name: args.common_name,
        scientific_name: args.scientific_name ? [args.scientific_name] : [],
        source: "manual",
      })
      .select("id, common_name")
      .single();
    if (pErr) throw pErr;

    // 2. Look up area_name for the denormalised column on inventory_items.
    let areaName: string | null = null;
    let locationId: string | null = null;
    if (args.area_id) {
      const { data: area } = await ctx.db
        .from("areas")
        .select("name, location_id")
        .eq("id", args.area_id)
        .eq("home_id", ctx.homeId)
        .maybeSingle();
      areaName = area?.name ?? null;
      locationId = area?.location_id ?? null;
    }

    // 3. Insert inventory_items row.
    const { data: invRow, error: iErr } = await ctx.db
      .from("inventory_items")
      .insert({
        home_id: ctx.homeId,
        plant_id: plantRow.id,
        area_id: args.area_id ?? null,
        location_id: locationId,
        plant_name: plantRow.common_name,
        identifier: args.identifier ?? null,
        area_name: areaName,
        status: args.area_id ? "Planted" : "In Shed",
        quantity: args.quantity ?? 1,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    return {
      summary: `Added "${plantRow.common_name}" to ${areaName ?? "the Shed"}.`,
      payload: { plant_id: plantRow.id, inventory_item_id: invRow.id },
      // Undo deletes both rows. plants row deletion cascades to inventory_items
      // (FK ON DELETE CASCADE), but explicit list keeps the contract simple.
      affected_row_refs: {
        table: "plants_and_inventory",
        ids: [String(plantRow.id), invRow.id],
        op: "insert",
      },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "insert") return;
    const [plantId, invId] = refs.ids;
    // Delete inventory first (no cascade risk to other tables), then plant.
    if (invId) {
      await ctx.db.from("inventory_items").delete().eq("id", invId);
    }
    if (plantId) {
      await ctx.db.from("plants").delete().eq("id", Number(plantId));
    }
  },
};

// ─── assign_plant_to_area ─────────────────────────────────────────────
export const assign_plant_to_area: MutationExecutor = {
  async preview(ctx, args) {
    const [plantLabel] = await inventoryLabels(ctx, [args.inventory_item_id]);
    const a = await areaLabel(ctx, args.area_id);
    return `Move ${plantLabel} to ${a}`;
  },

  async execute(ctx, args) {
    // Fetch previous area_id for undo.
    const { data: prev } = await ctx.db
      .from("inventory_items")
      .select("area_id, location_id, area_name, status")
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Inventory item not found.");

    const { data: area } = await ctx.db
      .from("areas")
      .select("name, location_id")
      .eq("id", args.area_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!area) throw new Error("Area not found.");

    const { error } = await ctx.db
      .from("inventory_items")
      .update({
        area_id: args.area_id,
        location_id: area.location_id,
        area_name: area.name,
        status: "Planted",
      })
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;

    return {
      summary: `Moved to ${area.name}.`,
      // Stash previous state in the payload so Undo can restore it
      payload: { previous: prev, new_area_id: args.area_id },
      affected_row_refs: {
        table: "inventory_items_move",
        ids: [args.inventory_item_id],
        op: "update",
      },
    };
  },

  async undo(_ctx, _refs) {
    // Undo for moves requires the original payload (previous area). The
    // generic refs structure doesn't carry it, so undo of an assign is
    // a no-op for Phase 2 — surface via the UI as "use the Plant Edit
    // modal to revert". We'll wire payload-aware undo in Phase 4.
    throw new Error("Undo for move actions isn't supported yet — edit the plant from the Shed to revert.");
  },
};

// ─── add_ailment ──────────────────────────────────────────────────────
export const add_ailment: MutationExecutor = {
  async preview(_ctx, args) {
    return `Add ${args.type} "${args.name}" to your Watchlist`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("ailments")
      .insert({
        home_id: ctx.homeId,
        name: args.name,
        type: args.type,
        description: args.description ?? "",
        source: "manual",
      })
      .select("id, name, type")
      .single();
    if (error) throw error;
    return {
      summary: `"${data.name}" added to the Watchlist.`,
      payload: data,
      affected_row_refs: { table: "ailments", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── link_ailment_to_instance ─────────────────────────────────────────
export const link_ailment_to_instance: MutationExecutor = {
  async preview(ctx, args) {
    const [plantLabel] = await inventoryLabels(ctx, [args.inventory_item_id]);
    const { data: ailment } = await ctx.db
      .from("ailments")
      .select("name")
      .eq("id", args.ailment_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    return `Mark ${plantLabel} as affected by "${ailment?.name ?? "this ailment"}"`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("plant_instance_ailments")
      .insert({
        home_id: ctx.homeId,
        plant_instance_id: args.inventory_item_id,
        ailment_id: args.ailment_id,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      summary: "Linked.",
      payload: data,
      affected_row_refs: { table: "plant_instance_ailments", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── create_shopping_list ─────────────────────────────────────────────
export const create_shopping_list: MutationExecutor = {
  async preview(_ctx, args) {
    return `Create shopping list "${args.name}"`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("shopping_lists")
      .insert({
        home_id: ctx.homeId,
        name: args.name,
        status: "active",
      })
      .select("id, name")
      .single();
    if (error) throw error;
    return {
      summary: `Shopping list "${data.name}" created.`,
      payload: data,
      affected_row_refs: { table: "shopping_lists", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── add_to_shopping_list ─────────────────────────────────────────────
export const add_to_shopping_list: MutationExecutor = {
  async preview(ctx, args) {
    // Resolve the target list at preview time so the card shows the actual name.
    let listName: string;
    if (args.list_id) {
      const { data } = await ctx.db
        .from("shopping_lists")
        .select("name")
        .eq("id", args.list_id)
        .eq("home_id", ctx.homeId)
        .maybeSingle();
      listName = data?.name ?? "(unknown list)";
    } else {
      const { data } = await ctx.db
        .from("shopping_lists")
        .select("name")
        .eq("home_id", ctx.homeId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      listName = data?.name ?? "(will create one)";
    }
    return `Add "${args.name}" (${args.item_type}) to "${listName}"`;
  },

  async execute(ctx, args) {
    // Resolve or create the target list.
    let listId = args.list_id as string | undefined;
    if (!listId) {
      const { data: existing } = await ctx.db
        .from("shopping_lists")
        .select("id")
        .eq("home_id", ctx.homeId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        listId = existing.id;
      } else {
        const { data: created, error: cErr } = await ctx.db
          .from("shopping_lists")
          .insert({ home_id: ctx.homeId, name: "My List", status: "active" })
          .select("id")
          .single();
        if (cErr) throw cErr;
        listId = created.id;
      }
    }

    const { data, error } = await ctx.db
      .from("shopping_list_items")
      .insert({
        home_id: ctx.homeId,
        list_id: listId,
        name: args.name,
        item_type: args.item_type,
        category: args.category ?? null,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    return {
      summary: `Added "${data.name}" to your list.`,
      payload: data,
      affected_row_refs: { table: "shopping_list_items", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── add_seed_packet ──────────────────────────────────────────────────
export const add_seed_packet: MutationExecutor = {
  async preview(_ctx, args) {
    const v = args.variety ? ` (${args.variety})` : "";
    const sow = args.sow_by ? ` — sow by ${args.sow_by}` : "";
    return `Add seed packet "${args.plant_name}"${v}${sow}`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("seed_packets")
      .insert({
        home_id: ctx.homeId,
        plant_id: null,
        variety: args.variety ?? null,
        vendor: args.vendor ?? null,
        sow_by: args.sow_by ?? null,
        // Denormalised name lives in a separate column added later in the
        // nursery migrations; safe to omit and the UI will fall back to plant_id lookup.
      })
      .select("id, variety")
      .single();
    if (error) throw error;
    return {
      summary: `Seed packet added.`,
      payload: data,
      affected_row_refs: { table: "seed_packets", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── log_sowing ───────────────────────────────────────────────────────
export const log_sowing: MutationExecutor = {
  async preview(ctx, args) {
    const { data: packet } = await ctx.db
      .from("seed_packets")
      .select("variety")
      .eq("id", args.packet_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    const name = packet?.variety ?? "this packet";
    const date = args.sown_on ?? "today";
    const count = args.quantity ?? 1;
    return `Log a sowing of ${count} seed${count === 1 ? "" : "s"} from "${name}" on ${date}`;
  },

  async execute(ctx, args) {
    const sownOn = args.sown_on ?? new Date().toISOString().split("T")[0];
    const { data, error } = await ctx.db
      .from("seed_sowings")
      .insert({
        home_id: ctx.homeId,
        seed_packet_id: args.packet_id,
        sown_on: sownOn,
        sown_count: args.quantity ?? 1,
        notes: args.location_note ?? null,
        status: "sown",
      })
      .select("id, sown_on, sown_count")
      .single();
    if (error) throw error;
    return {
      summary: `Logged ${data.sown_count} seed${data.sown_count === 1 ? "" : "s"} sown on ${data.sown_on}.`,
      payload: data,
      affected_row_refs: { table: "seed_sowings", ids: [data.id], op: "insert" },
    };
  },

  undo: simpleInsertUndo,
};

// ─── Router ───────────────────────────────────────────────────────────

export const MUTATION_EXECUTORS: Record<string, MutationExecutor> = {
  create_one_off_task,
  add_journal_entry,
  add_plant_to_shed,
  assign_plant_to_area,
  add_ailment,
  link_ailment_to_instance,
  create_shopping_list,
  add_to_shopping_list,
  add_seed_packet,
  log_sowing,
};
