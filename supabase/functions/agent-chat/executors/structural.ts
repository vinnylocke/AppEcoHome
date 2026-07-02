/**
 * Structural executors for Phase 3.
 *
 * Tools that affect the garden's *structure*: locations, areas, plans,
 * and task schedules (blueprints). Higher impact than Phase 2's safe
 * creates because blueprints + areas drive future task generation, so
 * the confirm cards include richer previews (e.g. projected dates).
 *
 * Pattern matches Phase 2's MutationExecutor (preview / execute / undo).
 */

import type { MutationExecutor, MutationResult, ExecutorContext } from "./mutations.ts";

// ─── Helpers ──────────────────────────────────────────────────────────

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function projectNextOccurrences(
  startDate: string,
  frequencyDays: number,
  count: number,
  endDate?: string | null,
): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  const today = new Date().toISOString().split("T")[0];
  // Skip past dates — project from today forward.
  while (cursor < today) {
    cursor = addDaysIso(cursor, frequencyDays);
  }
  for (let i = 0; i < count; i++) {
    if (endDate && cursor > endDate) break;
    dates.push(cursor);
    cursor = addDaysIso(cursor, frequencyDays);
  }
  return dates;
}

async function areaLabel(ctx: ExecutorContext, areaId: string | null | undefined): Promise<string> {
  if (!areaId) return "";
  const { data } = await ctx.db
    .from("areas")
    .select("name")
    .eq("id", areaId)
    .maybeSingle();
  return data?.name ?? "an area";
}

// ─── create_blueprint ─────────────────────────────────────────────────
export const create_blueprint: MutationExecutor = {
  async preview(ctx, args) {
    const next = projectNextOccurrences(
      args.start_date,
      args.frequency_days,
      5,
      args.end_date,
    );
    const whereParts: string[] = [];
    if (args.area_id) whereParts.push(`in ${await areaLabel(ctx, args.area_id)}`);
    if (args.inventory_item_ids?.length) {
      whereParts.push(`for ${args.inventory_item_ids.length} plant${args.inventory_item_ids.length === 1 ? "" : "s"}`);
    }
    const where = whereParts.length ? ` ${whereParts.join(" ")}` : "";
    const upcoming = next.length > 0 ? ` Next: ${next.slice(0, 3).join(", ")}${next.length > 3 ? "…" : ""}.` : "";
    return `Schedule "${args.title}" every ${args.frequency_days} day${args.frequency_days === 1 ? "" : "s"}${where}.${upcoming}`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("task_blueprints")
      .insert({
        home_id: ctx.homeId,
        title: args.title,
        description: args.description ?? null,
        task_type: args.task_type,
        frequency_days: args.frequency_days,
        start_date: args.start_date,
        end_date: args.end_date ?? null,
        area_id: args.area_id ?? null,
        inventory_item_ids: args.inventory_item_ids ?? null,
        is_recurring: true,
        is_archived: false,
      })
      .select("id, title, frequency_days")
      .single();
    if (error) throw error;
    return {
      summary: `Schedule "${data.title}" created (every ${data.frequency_days}d).`,
      payload: data,
      affected_row_refs: { table: "task_blueprints", ids: [data.id], op: "insert" },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "insert" || refs.ids.length === 0) return;
    await ctx.db.from("task_blueprints").delete().in("id", refs.ids);
  },
};

// ─── update_blueprint ─────────────────────────────────────────────────
export const update_blueprint: MutationExecutor = {
  async preview(ctx, args) {
    const { data: bp } = await ctx.db
      .from("task_blueprints")
      .select("title, frequency_days, end_date, area_id")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!bp) return `Update blueprint ${args.blueprint_id} (not found yet)`;

    const changes: string[] = [];
    if (args.title && args.title !== bp.title) changes.push(`title → "${args.title}"`);
    if (args.frequency_days && args.frequency_days !== bp.frequency_days) {
      changes.push(`frequency ${bp.frequency_days}d → ${args.frequency_days}d`);
    }
    if (args.end_date !== undefined && args.end_date !== bp.end_date) {
      changes.push(`end date → ${args.end_date ?? "none"}`);
    }
    if (args.area_id && args.area_id !== bp.area_id) {
      const newArea = await areaLabel(ctx, args.area_id);
      changes.push(`area → ${newArea}`);
    }
    if (args.description !== undefined) changes.push("update description");
    return changes.length
      ? `Update "${bp.title}": ${changes.join(", ")}`
      : `Update "${bp.title}" (no visible changes)`;
  },

  async execute(ctx, args) {
    // Snapshot previous state for undo.
    const { data: prev, error: prevErr } = await ctx.db
      .from("task_blueprints")
      .select("title, description, frequency_days, end_date, area_id")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (prevErr) throw prevErr;
    if (!prev) throw new Error("Blueprint not found.");

    const updates: Record<string, any> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.frequency_days !== undefined) updates.frequency_days = args.frequency_days;
    if (args.end_date !== undefined) updates.end_date = args.end_date;
    if (args.area_id !== undefined) updates.area_id = args.area_id;

    if (Object.keys(updates).length === 0) {
      return {
        summary: "No fields to update.",
        payload: prev,
      };
    }

    const { error } = await ctx.db
      .from("task_blueprints")
      .update(updates)
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;

    return {
      summary: `Updated "${updates.title ?? prev.title}".`,
      payload: { id: args.blueprint_id, updates, previous: prev },
      affected_row_refs: {
        table: "task_blueprints",
        ids: [args.blueprint_id],
        op: "update",
        previous_state: prev,
      },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state || refs.ids.length === 0) return;
    await ctx.db
      .from("task_blueprints")
      .update(refs.previous_state)
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
  },
};

// ─── pause_blueprint ──────────────────────────────────────────────────
export const pause_blueprint: MutationExecutor = {
  async preview(ctx, args) {
    const { data: bp } = await ctx.db
      .from("task_blueprints")
      .select("title")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!bp) return `Pause blueprint ${args.blueprint_id} (not found)`;
    if (!args.until_date) return `Unpause "${bp.title}"`;
    return `Pause "${bp.title}" until ${args.until_date}`;
  },

  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("task_blueprints")
      .select("paused_until, title")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Blueprint not found.");

    const { error } = await ctx.db
      .from("task_blueprints")
      .update({ paused_until: args.until_date ?? null })
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;

    const verb = args.until_date ? `paused until ${args.until_date}` : "unpaused";
    return {
      summary: `"${prev.title}" ${verb}.`,
      payload: { id: args.blueprint_id, paused_until: args.until_date ?? null },
      affected_row_refs: {
        table: "task_blueprints",
        ids: [args.blueprint_id],
        op: "update",
        previous_state: { paused_until: prev.paused_until },
      },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state || refs.ids.length === 0) return;
    await ctx.db
      .from("task_blueprints")
      .update({ paused_until: refs.previous_state.paused_until ?? null })
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
  },
};

// ─── create_location ──────────────────────────────────────────────────
export const create_location: MutationExecutor = {
  async preview(_ctx, args) {
    const pc = args.postcode ? ` (${args.postcode})` : "";
    return `Create location "${args.name}"${pc}`;
  },

  async execute(ctx, args) {
    // locations has no postcode column — the arg is preview-only context.
    const { data, error } = await ctx.db
      .from("locations")
      .insert({
        home_id: ctx.homeId,
        name: args.name,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    return {
      summary: `Location "${data.name}" created.`,
      payload: data,
      affected_row_refs: { table: "locations", ids: [data.id], op: "insert" },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "insert" || refs.ids.length === 0) return;
    await ctx.db.from("locations").delete().in("id", refs.ids);
  },
};

// ─── create_area ──────────────────────────────────────────────────────
// areas has no home_id column — it links via location_id. Verify the
// location is in this home before inserting.
export const create_area: MutationExecutor = {
  async preview(ctx, args) {
    const { data: loc } = await ctx.db
      .from("locations")
      .select("name")
      .eq("id", args.location_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    const locName = loc?.name ?? "(unknown location)";
    return `Create area "${args.name}" inside ${locName}`;
  },

  async execute(ctx, args) {
    // Verify location ownership.
    const { data: loc } = await ctx.db
      .from("locations")
      .select("id")
      .eq("id", args.location_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!loc) throw new Error("Location not found in this home.");

    const { data, error } = await ctx.db
      .from("areas")
      .insert({
        location_id: args.location_id,
        name: args.name,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    return {
      summary: `Area "${data.name}" created.`,
      payload: data,
      affected_row_refs: { table: "areas", ids: [data.id], op: "insert" },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "insert" || refs.ids.length === 0) return;
    await ctx.db.from("areas").delete().in("id", refs.ids);
  },
};

// ─── create_plan ──────────────────────────────────────────────────────
export const create_plan: MutationExecutor = {
  async preview(_ctx, args) {
    const status = args.status ?? "Draft";
    return `Create plan "${args.name}" (${status})`;
  },

  async execute(ctx, args) {
    const { data, error } = await ctx.db
      .from("plans")
      .insert({
        home_id: ctx.homeId,
        name: args.name,
        description: args.description ?? "",
        status: args.status ?? "Draft",
      })
      .select("id, name, status")
      .single();
    if (error) throw error;
    return {
      summary: `Plan "${data.name}" created.`,
      payload: data,
      affected_row_refs: { table: "plans", ids: [data.id], op: "insert" },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "insert" || refs.ids.length === 0) return;
    await ctx.db.from("plans").delete().in("id", refs.ids);
  },
};

// ─── add_plant_to_plan ────────────────────────────────────────────────
// Appends a plant to the plan's ai_blueprint.plant_manifest, mirroring
// the manual "add custom plant" flow in PlanStaging.tsx (handleSaveNewPlant).
// Sets plant_mapping[newIndex] = "create" so the Shed phase procures it.
export const add_plant_to_plan: MutationExecutor = {
  async preview(ctx, args) {
    const { data: plan } = await ctx.db
      .from("plans")
      .select("name")
      .eq("id", args.plan_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    const qty = args.quantity ?? 1;
    return `Add ${qty}× ${args.common_name} to plan "${plan?.name ?? args.plan_id}"`;
  },

  async execute(ctx, args) {
    const { data: plan, error: planErr } = await ctx.db
      .from("plans")
      .select("name, status, ai_blueprint, staging_state")
      .eq("id", args.plan_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan) throw new Error("Plan not found.");
    if (plan.status === "Completed") {
      throw new Error("That plan is completed — start a new plan or reopen this one first.");
    }

    const blueprint = (plan.ai_blueprint ?? {}) as Record<string, any>;
    if (!Array.isArray(blueprint.plant_manifest)) {
      throw new Error(
        "This plan doesn't have a plant list yet — open it in the Planner first, then I can add to it.",
      );
    }

    const qty = Math.max(1, Number(args.quantity) || 1);
    const newPlant = {
      common_name: args.common_name,
      scientific_name: args.scientific_name ?? "Custom Addition",
      quantity: qty,
      role: "Custom Addition",
      aesthetic_reason: "Added via the Rhozly assistant.",
      horticultural_reason: "Added via the Rhozly assistant.",
      procurement_advice: "Procure locally or search the Shed.",
    };

    const updatedManifest = [...blueprint.plant_manifest, newPlant];
    const newIndex = updatedManifest.length - 1;
    const updatedBlueprint = { ...blueprint, plant_manifest: updatedManifest };

    const staging = (plan.staging_state ?? {}) as Record<string, any>;
    const updatedStaging = {
      ...staging,
      plant_mapping: { ...(staging.plant_mapping ?? {}), [newIndex]: "create" },
    };

    const { error: updErr } = await ctx.db
      .from("plans")
      .update({ ai_blueprint: updatedBlueprint, staging_state: updatedStaging })
      .eq("id", args.plan_id)
      .eq("home_id", ctx.homeId);
    if (updErr) throw updErr;

    const alreadyLinked = !!staging.plants_linked;
    const tail = alreadyLinked
      ? " Open the plan's Shed phase in the Planner to procure it."
      : "";
    return {
      summary: `Added ${qty}× ${args.common_name} to "${plan.name}".${tail}`,
      payload: { plan_id: args.plan_id, index: newIndex },
      affected_row_refs: {
        table: "plans_manifest",
        ids: [args.plan_id],
        op: "update",
        // Snapshot BOTH jsonb columns so undo is an exact restore.
        previous_state: {
          ai_blueprint: plan.ai_blueprint,
          staging_state: plan.staging_state,
        },
      },
    };
  },

  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state || refs.ids.length === 0) return;
    await ctx.db
      .from("plans")
      .update({
        ai_blueprint: refs.previous_state.ai_blueprint ?? null,
        staging_state: refs.previous_state.staging_state ?? {},
      })
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
  },
};

// ─── Router ───────────────────────────────────────────────────────────

export const STRUCTURAL_EXECUTORS: Record<string, MutationExecutor> = {
  create_blueprint,
  update_blueprint,
  pause_blueprint,
  create_location,
  create_area,
  create_plan,
  add_plant_to_plan,
};
