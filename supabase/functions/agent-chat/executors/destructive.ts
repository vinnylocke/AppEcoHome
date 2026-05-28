/**
 * Destructive / bulk executors for Phase 4.
 *
 * Higher-impact than Phase 2-3 — these change history, archive entire
 * branches of data, or affect many rows at once. The agent-chat UI
 * renders these with hold-to-confirm and a 24h Undo window.
 *
 * Pattern matches the standard MutationExecutor (preview/execute/undo).
 * For bulk tools, affected_row_refs.previous_state stores per-row
 * snapshots ({ id, was: {...} }[]) so Undo can restore the exact
 * pre-state row by row.
 */

import type { MutationExecutor, ExecutorContext } from "./mutations.ts";

// ─── Helpers ──────────────────────────────────────────────────────────

async function inventoryLabel(ctx: ExecutorContext, id: string): Promise<string> {
  const { data } = await ctx.db
    .from("inventory_items")
    .select("plant_name, identifier")
    .eq("id", id)
    .eq("home_id", ctx.homeId)
    .maybeSingle();
  return data?.identifier || data?.plant_name || "this plant";
}

async function plantLabel(ctx: ExecutorContext, id: number): Promise<string> {
  const { data } = await ctx.db
    .from("plants")
    .select("common_name")
    .eq("id", id)
    .maybeSingle();
  return data?.common_name ?? `plant #${id}`;
}

// ─── archive_plant / restore_plant ────────────────────────────────────
export const archive_plant: MutationExecutor = {
  async preview(ctx, args) {
    return `Archive "${await plantLabel(ctx, args.plant_id)}" from your Shed`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("plants")
      .select("is_archived, common_name")
      .eq("id", args.plant_id)
      .maybeSingle();
    if (!prev) throw new Error("Plant not found.");
    const { error } = await ctx.db
      .from("plants")
      .update({ is_archived: true })
      .eq("id", args.plant_id);
    if (error) throw error;
    return {
      summary: `"${prev.common_name}" archived.`,
      payload: { id: args.plant_id },
      affected_row_refs: {
        table: "plants",
        ids: [String(args.plant_id)],
        op: "update",
        previous_state: { is_archived: prev.is_archived ?? false },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db
      .from("plants")
      .update({ is_archived: refs.previous_state.is_archived ?? false })
      .eq("id", Number(refs.ids[0]));
  },
};

export const restore_plant: MutationExecutor = {
  async preview(ctx, args) {
    return `Restore "${await plantLabel(ctx, args.plant_id)}" to your active Shed`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("plants")
      .select("is_archived, common_name")
      .eq("id", args.plant_id)
      .maybeSingle();
    if (!prev) throw new Error("Plant not found.");
    const { error } = await ctx.db
      .from("plants")
      .update({ is_archived: false })
      .eq("id", args.plant_id);
    if (error) throw error;
    return {
      summary: `"${prev.common_name}" restored.`,
      payload: { id: args.plant_id },
      affected_row_refs: {
        table: "plants",
        ids: [String(args.plant_id)],
        op: "update",
        previous_state: { is_archived: prev.is_archived ?? false },
      },
    };
  },
  undo: archive_plant.undo,
};

// ─── end_of_life_instance ─────────────────────────────────────────────
export const end_of_life_instance: MutationExecutor = {
  async preview(ctx, args) {
    const label = await inventoryLabel(ctx, args.inventory_item_id);
    const natural = args.was_natural === true;
    return `Mark ${label} as ${natural ? "naturally ended" : "ended"} (moves to Senescence)`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("inventory_items")
      .select("ended_at, was_natural_end, end_summary, status, plant_name")
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Plant instance not found.");

    const endedAt = new Date().toISOString();
    const summary = args.summary ?? null;
    const wasNatural = args.was_natural === true;

    const { error: updErr } = await ctx.db
      .from("inventory_items")
      .update({
        ended_at: endedAt,
        was_natural_end: wasNatural,
        end_summary: summary,
        status: "Archived",
      })
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId);
    if (updErr) throw updErr;

    // Closing journal entry. Best-effort — don't fail the whole tool if
    // the journal insert fails (the lifecycle change has already landed).
    const { data: journal } = await ctx.db
      .from("plant_journals")
      .insert({
        home_id: ctx.homeId,
        inventory_item_id: args.inventory_item_id,
        subject: wasNatural ? "Lifecycle complete (natural)" : "Lifecycle complete",
        description:
          summary ?? `Marked end of life via the AI assistant.`,
        image_url: args.photo_url ?? null,
      })
      .select("id")
      .single();

    return {
      summary: `${prev.plant_name ?? "Instance"} moved to Senescence.`,
      payload: { id: args.inventory_item_id, journal_id: journal?.id ?? null },
      affected_row_refs: {
        table: "inventory_items_eol",
        ids: [args.inventory_item_id, journal?.id ?? ""],
        op: "update",
        previous_state: {
          ended_at: prev.ended_at,
          was_natural_end: prev.was_natural_end,
          end_summary: prev.end_summary,
          status: prev.status,
        },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    // Restore inventory_items fields
    await ctx.db
      .from("inventory_items")
      .update({
        ended_at: refs.previous_state.ended_at ?? null,
        was_natural_end: refs.previous_state.was_natural_end ?? null,
        end_summary: refs.previous_state.end_summary ?? null,
        status: refs.previous_state.status ?? "Planted",
      })
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
    // Delete the closing journal entry if we wrote one
    const journalId = refs.ids[1];
    if (journalId) {
      await ctx.db.from("plant_journals").delete().eq("id", journalId);
    }
  },
};

// ─── restore_instance ─────────────────────────────────────────────────
export const restore_instance: MutationExecutor = {
  async preview(ctx, args) {
    const label = await inventoryLabel(ctx, args.inventory_item_id);
    return `Restore ${label} from Senescence back to Planted`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("inventory_items")
      .select("ended_at, was_natural_end, end_summary, status, plant_name")
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Plant instance not found.");
    if (!prev.ended_at) throw new Error("That plant isn't in Senescence — nothing to restore.");

    const { error: updErr } = await ctx.db
      .from("inventory_items")
      .update({
        ended_at: null,
        was_natural_end: null,
        end_summary: null,
        status: "Planted",
      })
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId);
    if (updErr) throw updErr;

    const { data: journal } = await ctx.db
      .from("plant_journals")
      .insert({
        home_id: ctx.homeId,
        inventory_item_id: args.inventory_item_id,
        subject: "Restored from Senescence",
        description: "Restored via the AI assistant.",
      })
      .select("id")
      .single();

    return {
      summary: `${prev.plant_name ?? "Instance"} restored.`,
      payload: { id: args.inventory_item_id, journal_id: journal?.id ?? null },
      affected_row_refs: {
        table: "inventory_items_eol",
        ids: [args.inventory_item_id, journal?.id ?? ""],
        op: "update",
        previous_state: {
          ended_at: prev.ended_at,
          was_natural_end: prev.was_natural_end,
          end_summary: prev.end_summary,
          status: prev.status,
        },
      },
    };
  },
  undo: end_of_life_instance.undo,  // Same shape — restore previous values
};

// ─── delete_instance (no undo) ────────────────────────────────────────
export const delete_instance: MutationExecutor = {
  async preview(ctx, args) {
    const label = await inventoryLabel(ctx, args.inventory_item_id);
    return `Permanently delete ${label} (NOT reversible — consider end_of_life_instance instead)`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("inventory_items")
      .select("plant_name")
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Plant instance not found.");
    const { error } = await ctx.db
      .from("inventory_items")
      .delete()
      .eq("id", args.inventory_item_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;
    return {
      summary: `${prev.plant_name ?? "Instance"} permanently deleted.`,
      payload: { id: args.inventory_item_id },
      // No affected_row_refs → Undo unavailable. The UI shows this as
      // "(can't undo)" next to the done card.
    };
  },
  async undo() {
    throw new Error("Delete is permanent — this action can't be undone.");
  },
};

// ─── archive_ailment ──────────────────────────────────────────────────
export const archive_ailment: MutationExecutor = {
  async preview(ctx, args) {
    const { data } = await ctx.db
      .from("ailments")
      .select("name")
      .eq("id", args.ailment_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    return `Archive "${data?.name ?? "this ailment"}" from the Watchlist`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("ailments")
      .select("is_archived, name")
      .eq("id", args.ailment_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Ailment not found.");
    const { error } = await ctx.db
      .from("ailments")
      .update({ is_archived: true })
      .eq("id", args.ailment_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;
    return {
      summary: `"${prev.name}" archived.`,
      payload: { id: args.ailment_id },
      affected_row_refs: {
        table: "ailments",
        ids: [args.ailment_id],
        op: "update",
        previous_state: { is_archived: prev.is_archived ?? false },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db
      .from("ailments")
      .update({ is_archived: refs.previous_state.is_archived ?? false })
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
  },
};

// ─── archive_blueprint ────────────────────────────────────────────────
export const archive_blueprint: MutationExecutor = {
  async preview(ctx, args) {
    const { data } = await ctx.db
      .from("task_blueprints")
      .select("title")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    return `Archive schedule "${data?.title ?? args.blueprint_id}" (future tasks stop generating)`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db
      .from("task_blueprints")
      .select("is_archived, title")
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId)
      .maybeSingle();
    if (!prev) throw new Error("Blueprint not found.");
    const { error } = await ctx.db
      .from("task_blueprints")
      .update({ is_archived: true })
      .eq("id", args.blueprint_id)
      .eq("home_id", ctx.homeId);
    if (error) throw error;
    return {
      summary: `Schedule "${prev.title}" archived.`,
      payload: { id: args.blueprint_id },
      affected_row_refs: {
        table: "task_blueprints",
        ids: [args.blueprint_id],
        op: "update",
        previous_state: { is_archived: prev.is_archived ?? false },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db
      .from("task_blueprints")
      .update({ is_archived: refs.previous_state.is_archived ?? false })
      .eq("id", refs.ids[0])
      .eq("home_id", ctx.homeId);
  },
};

// ─── bulk_reschedule ──────────────────────────────────────────────────
async function buildTaskFilter(
  ctx: ExecutorContext,
  args: Record<string, any>,
) {
  let q = ctx.db
    .from("tasks")
    .select("id, due_date, title, type")
    .eq("home_id", ctx.homeId)
    .eq("status", "Pending");
  if (args.area_id)      q = q.eq("area_id", args.area_id);
  if (args.task_type)    q = q.eq("type", args.task_type);
  if (args.blueprint_id) q = q.eq("blueprint_id", args.blueprint_id);
  if (args.due_before)   q = q.lt("due_date", args.due_before);
  return q;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export const bulk_reschedule: MutationExecutor = {
  async preview(ctx, args) {
    if (!args.shift_days && !args.new_date) {
      return "Provide either shift_days or new_date.";
    }
    const { data } = await buildTaskFilter(ctx, args);
    const count = data?.length ?? 0;
    if (count === 0) return "No tasks match that filter.";
    const target = args.new_date
      ? `to ${args.new_date}`
      : `by ${args.shift_days > 0 ? "+" : ""}${args.shift_days} day${args.shift_days === 1 || args.shift_days === -1 ? "" : "s"}`;
    const sample = (data ?? []).slice(0, 3).map((t: any) => `"${t.title}"`).join(", ");
    const more = count > 3 ? ` (+${count - 3} more)` : "";
    return `Reschedule ${count} task${count === 1 ? "" : "s"} ${target}: ${sample}${more}`;
  },
  async execute(ctx, args) {
    if (!args.shift_days && !args.new_date) {
      throw new Error("Provide either shift_days or new_date.");
    }
    const { data: tasks, error: selErr } = await buildTaskFilter(ctx, args);
    if (selErr) throw selErr;
    if (!tasks || tasks.length === 0) {
      return { summary: "No tasks matched — nothing to reschedule.", payload: { count: 0 } };
    }

    // Snapshot previous due_dates for undo.
    const previous = tasks.map((t: any) => ({ id: t.id, due_date: t.due_date }));

    // Apply update per row (could batch via update in single query, but
    // shift_days requires per-row arithmetic that's hard in pure SQL —
    // and the row count is bounded by the filter, usually <50).
    for (const t of tasks) {
      const newDate = args.new_date
        ? args.new_date
        : addDaysIso(t.due_date, args.shift_days);
      await ctx.db
        .from("tasks")
        .update({ due_date: newDate })
        .eq("id", t.id)
        .eq("home_id", ctx.homeId);
    }

    return {
      summary: `Rescheduled ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`,
      payload: { count: tasks.length },
      affected_row_refs: {
        table: "tasks_bulk",
        ids: previous.map((p: any) => p.id),
        op: "update",
        previous_state: { rows: previous },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state?.rows) return;
    for (const row of refs.previous_state.rows as Array<{ id: string; due_date: string }>) {
      await ctx.db
        .from("tasks")
        .update({ due_date: row.due_date })
        .eq("id", row.id)
        .eq("home_id", ctx.homeId);
    }
  },
};

// ─── bulk_complete_tasks ──────────────────────────────────────────────
export const bulk_complete_tasks: MutationExecutor = {
  async preview(ctx, args) {
    const { data } = await buildTaskFilter(ctx, args);
    const count = data?.length ?? 0;
    if (count === 0) return "No tasks match that filter.";
    const sample = (data ?? []).slice(0, 3).map((t: any) => `"${t.title}"`).join(", ");
    const more = count > 3 ? ` (+${count - 3} more)` : "";
    return `Mark ${count} task${count === 1 ? "" : "s"} complete: ${sample}${more}`;
  },
  async execute(ctx, args) {
    const { data: tasks, error: selErr } = await buildTaskFilter(ctx, args);
    if (selErr) throw selErr;
    if (!tasks || tasks.length === 0) {
      return { summary: "No tasks matched — nothing to complete.", payload: { count: 0 } };
    }

    const previous = tasks.map((t: any) => ({ id: t.id, status: "Pending" }));
    const ids = tasks.map((t: any) => t.id);

    const completedAt = new Date().toISOString();
    const { error } = await ctx.db
      .from("tasks")
      .update({ status: "Completed", completed_at: completedAt })
      .in("id", ids)
      .eq("home_id", ctx.homeId);
    if (error) throw error;

    return {
      summary: `Completed ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`,
      payload: { count: tasks.length },
      affected_row_refs: {
        table: "tasks_bulk",
        ids,
        op: "update",
        previous_state: { rows: previous, completed_at: completedAt },
      },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state?.rows) return;
    const ids = (refs.previous_state.rows as Array<{ id: string }>).map((r) => r.id);
    await ctx.db
      .from("tasks")
      .update({ status: "Pending", completed_at: null })
      .in("id", ids)
      .eq("home_id", ctx.homeId);
  },
};

// ─── Router ───────────────────────────────────────────────────────────

export const DESTRUCTIVE_EXECUTORS: Record<string, MutationExecutor> = {
  archive_plant,
  restore_plant,
  end_of_life_instance,
  restore_instance,
  delete_instance,
  archive_ailment,
  archive_blueprint,
  bulk_reschedule,
  bulk_complete_tasks,
};
