/**
 * Gap-filling executors — single-item complements to the bulk/create tools:
 * tasks (complete/skip/snooze), shopping (remove/tick/complete),
 * ailments (resolve/unlink), plans (update/archive/remove-plant),
 * areas + locations (rename/delete). Mirrors the MutationExecutor pattern.
 * All home-scoped (service role bypasses RLS).
 */

import type { MutationExecutor, ExecutorContext } from "./mutations.ts";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

async function loadTask(ctx: ExecutorContext, id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("task_id is required.");
  const { data } = await ctx.db.from("tasks").select("id, title, status, completed_at, due_date").eq("id", id).eq("home_id", ctx.homeId).maybeSingle();
  if (!data) throw new Error("Task not found in this home. Use list_tasks to get a valid id.");
  return data as { id: string; title: string; status: string; completed_at: string | null; due_date: string };
}

// ── Tasks ────────────────────────────────────────────────────────────────────
export const complete_task: MutationExecutor = {
  async preview(ctx, args) { return `Mark task "${(await loadTask(ctx, args.task_id)).title}" complete`; },
  async execute(ctx, args) {
    const t = await loadTask(ctx, args.task_id);
    const completed_at = new Date().toISOString();
    const { error } = await ctx.db.from("tasks").update({ status: "Completed", completed_at }).eq("id", t.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `"${t.title}" completed.`, payload: { id: t.id }, affected_row_refs: { table: "tasks", ids: [t.id], op: "update", previous_state: { status: t.status, completed_at: t.completed_at } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("tasks").update({ status: refs.previous_state.status ?? "Pending", completed_at: refs.previous_state.completed_at ?? null }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const skip_task: MutationExecutor = {
  async preview(ctx, args) { return `Skip task "${(await loadTask(ctx, args.task_id)).title}"`; },
  async execute(ctx, args) {
    const t = await loadTask(ctx, args.task_id);
    const { error } = await ctx.db.from("tasks").update({ status: "Skipped" }).eq("id", t.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `"${t.title}" skipped.`, payload: { id: t.id }, affected_row_refs: { table: "tasks", ids: [t.id], op: "update", previous_state: { status: t.status } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("tasks").update({ status: refs.previous_state.status ?? "Pending" }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const snooze_task: MutationExecutor = {
  async preview(ctx, args) {
    const t = await loadTask(ctx, args.task_id);
    const to = args.new_date ?? addDaysIso(t.due_date, Number(args.days) || 1);
    return `Move task "${t.title}" from ${t.due_date} to ${to}`;
  },
  async execute(ctx, args) {
    const t = await loadTask(ctx, args.task_id);
    const newDate = args.new_date ?? addDaysIso(t.due_date, Number(args.days) || 1);
    const { error } = await ctx.db.from("tasks").update({ due_date: newDate }).eq("id", t.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `"${t.title}" moved to ${newDate}.`, payload: { id: t.id, due_date: newDate }, affected_row_refs: { table: "tasks", ids: [t.id], op: "update", previous_state: { due_date: t.due_date } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("tasks").update({ due_date: refs.previous_state.due_date }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

// ── Shopping ─────────────────────────────────────────────────────────────────
async function loadShoppingItem(ctx: ExecutorContext, id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("item_id is required.");
  const { data } = await ctx.db.from("shopping_list_items").select("id, name, item_type, category, is_checked, list_id, quantity").eq("id", id).eq("home_id", ctx.homeId).maybeSingle();
  if (!data) throw new Error("Shopping item not found in this home.");
  return data as Record<string, any>;
}

export const remove_shopping_item: MutationExecutor = {
  async preview(ctx, args) { return `Remove "${(await loadShoppingItem(ctx, args.item_id)).name}" from the shopping list`; },
  async execute(ctx, args) {
    const it = await loadShoppingItem(ctx, args.item_id);
    const { error } = await ctx.db.from("shopping_list_items").delete().eq("id", it.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Removed "${it.name}".`, payload: { id: it.id }, affected_row_refs: { table: "shopping_list_items", ids: [it.id], op: "delete", previous_state: { row: { home_id: ctx.homeId, list_id: it.list_id, name: it.name, item_type: it.item_type, category: it.category, is_checked: it.is_checked, quantity: it.quantity } } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "delete" || !refs.previous_state?.row) return;
    await ctx.db.from("shopping_list_items").insert(refs.previous_state.row);
  },
};

export const toggle_shopping_item_bought: MutationExecutor = {
  async preview(ctx, args) {
    const it = await loadShoppingItem(ctx, args.item_id);
    const next = typeof args.bought === "boolean" ? args.bought : !it.is_checked;
    return `Mark "${it.name}" as ${next ? "bought" : "not bought"}`;
  },
  async execute(ctx, args) {
    const it = await loadShoppingItem(ctx, args.item_id);
    const next = typeof args.bought === "boolean" ? args.bought : !it.is_checked;
    const { error } = await ctx.db.from("shopping_list_items").update({ is_checked: next }).eq("id", it.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `"${it.name}" marked ${next ? "bought" : "not bought"}.`, payload: { id: it.id, is_checked: next }, affected_row_refs: { table: "shopping_list_items", ids: [it.id], op: "update", previous_state: { is_checked: it.is_checked } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("shopping_list_items").update({ is_checked: refs.previous_state.is_checked ?? false }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const complete_shopping_list: MutationExecutor = {
  async preview(ctx, args) {
    const { data } = await ctx.db.from("shopping_lists").select("name, status").eq("id", args.list_id).eq("home_id", ctx.homeId).maybeSingle();
    if (!data) return "List not found.";
    const next = args.reopen ? "active" : "completed";
    return `Mark list "${data.name}" as ${next === "completed" ? "completed" : "active again"}`;
  },
  async execute(ctx, args) {
    const { data: prev } = await ctx.db.from("shopping_lists").select("name, status").eq("id", args.list_id).eq("home_id", ctx.homeId).maybeSingle();
    if (!prev) throw new Error("Shopping list not found in this home.");
    const next = args.reopen ? "active" : "completed";
    const { error } = await ctx.db.from("shopping_lists").update({ status: next }).eq("id", args.list_id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `List "${prev.name}" marked ${next}.`, payload: { id: args.list_id, status: next }, affected_row_refs: { table: "shopping_lists", ids: [args.list_id], op: "update", previous_state: { status: prev.status } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("shopping_lists").update({ status: refs.previous_state.status ?? "active" }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

// ── Ailments ─────────────────────────────────────────────────────────────────
async function loadAilmentLink(ctx: ExecutorContext, inventoryItemId: unknown, ailmentId: unknown) {
  if (typeof inventoryItemId !== "string" || typeof ailmentId !== "string") throw new Error("inventory_item_id and ailment_id are required.");
  const { data } = await ctx.db.from("plant_instance_ailments").select("id, status").eq("home_id", ctx.homeId).eq("plant_instance_id", inventoryItemId).eq("ailment_id", ailmentId).order("linked_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error("No link between that plant and ailment was found.");
  return data as { id: string; status: string };
}

export const resolve_ailment: MutationExecutor = {
  async preview() { return "Mark this plant's ailment as resolved"; },
  async execute(ctx, args) {
    const link = await loadAilmentLink(ctx, args.inventory_item_id, args.ailment_id);
    const { error } = await ctx.db.from("plant_instance_ailments").update({ status: "resolved" }).eq("id", link.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: "Ailment marked resolved on that plant.", payload: { id: link.id }, affected_row_refs: { table: "plant_instance_ailments", ids: [link.id], op: "update", previous_state: { status: link.status } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("plant_instance_ailments").update({ status: refs.previous_state.status ?? "active" }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const unlink_ailment_from_instance: MutationExecutor = {
  async preview() { return "Remove the ailment from this plant"; },
  async execute(ctx, args) {
    const link = await loadAilmentLink(ctx, args.inventory_item_id, args.ailment_id);
    const { error } = await ctx.db.from("plant_instance_ailments").delete().eq("id", link.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: "Ailment unlinked from that plant.", payload: { id: link.id }, affected_row_refs: { table: "plant_instance_ailments", ids: [link.id], op: "delete", previous_state: { row: { home_id: ctx.homeId, plant_instance_id: args.inventory_item_id, ailment_id: args.ailment_id, status: link.status } } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "delete" || !refs.previous_state?.row) return;
    await ctx.db.from("plant_instance_ailments").insert(refs.previous_state.row);
  },
};

// ── Plans ────────────────────────────────────────────────────────────────────
async function loadPlan(ctx: ExecutorContext, id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("plan_id is required.");
  const { data } = await ctx.db.from("plans").select("id, name, description, status, ai_blueprint, staging_state").eq("id", id).eq("home_id", ctx.homeId).maybeSingle();
  if (!data) throw new Error("Plan not found in this home. Use list_plans to get a valid id.");
  return data as Record<string, any>;
}

export const update_plan: MutationExecutor = {
  async preview(ctx, args) {
    const p = await loadPlan(ctx, args.plan_id);
    const bits = [args.name !== undefined && `name → "${args.name}"`, args.description !== undefined && "update description", args.status !== undefined && `status → ${args.status}`].filter(Boolean);
    return `Update plan "${p.name}": ${bits.length ? bits.join(", ") : "no changes"}`;
  },
  async execute(ctx, args) {
    const p = await loadPlan(ctx, args.plan_id);
    const patch: Record<string, unknown> = {}; const prev: Record<string, unknown> = {};
    for (const k of ["name", "description", "status"]) if (args[k] !== undefined) { patch[k] = args[k]; prev[k] = p[k]; }
    if (Object.keys(patch).length === 0) return { summary: "No fields to update.", payload: { id: p.id } };
    const { error } = await ctx.db.from("plans").update(patch).eq("id", p.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Updated plan "${(patch.name as string) ?? p.name}".`, payload: { id: p.id }, affected_row_refs: { table: "plans", ids: [p.id], op: "update", previous_state: prev } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("plans").update(refs.previous_state).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const archive_plan: MutationExecutor = {
  async preview(ctx, args) { return `Archive plan "${(await loadPlan(ctx, args.plan_id)).name}"`; },
  async execute(ctx, args) {
    const p = await loadPlan(ctx, args.plan_id);
    const { error } = await ctx.db.from("plans").update({ status: "Archived" }).eq("id", p.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Plan "${p.name}" archived.`, payload: { id: p.id }, affected_row_refs: { table: "plans", ids: [p.id], op: "update", previous_state: { status: p.status } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("plans").update({ status: refs.previous_state.status ?? "Draft" }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const remove_plant_from_plan: MutationExecutor = {
  async preview(ctx, args) {
    const p = await loadPlan(ctx, args.plan_id);
    const manifest = (p.ai_blueprint?.plant_manifest ?? []) as Array<{ common_name?: string }>;
    const target = typeof args.index === "number" ? manifest[args.index]?.common_name : args.common_name;
    return `Remove ${target ?? "a plant"} from plan "${p.name}"`;
  },
  async execute(ctx, args) {
    const p = await loadPlan(ctx, args.plan_id);
    const blueprint = (p.ai_blueprint ?? {}) as Record<string, any>;
    const manifest = Array.isArray(blueprint.plant_manifest) ? [...blueprint.plant_manifest] : [];
    let idx = typeof args.index === "number" ? args.index : -1;
    if (idx < 0 && args.common_name) idx = manifest.findIndex((m: { common_name?: string }) => (m.common_name ?? "").toLowerCase() === String(args.common_name).toLowerCase());
    if (idx < 0 || idx >= manifest.length) throw new Error("That plant isn't in the plan's list — check list_plans / the plant name.");
    const removed = manifest[idx];
    manifest.splice(idx, 1);
    // Re-index plant_mapping in staging_state (drop the removed index, shift the rest down).
    const staging = (p.staging_state ?? {}) as Record<string, any>;
    const oldMapping = (staging.plant_mapping ?? {}) as Record<string, unknown>;
    const newMapping: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(oldMapping)) { const n = Number(k); if (n === idx) continue; newMapping[n > idx ? n - 1 : n] = v; }
    const { error } = await ctx.db.from("plans").update({ ai_blueprint: { ...blueprint, plant_manifest: manifest }, staging_state: { ...staging, plant_mapping: newMapping } }).eq("id", p.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Removed ${removed?.common_name ?? "plant"} from "${p.name}".`, payload: { id: p.id, index: idx }, affected_row_refs: { table: "plans", ids: [p.id], op: "update", previous_state: { ai_blueprint: p.ai_blueprint, staging_state: p.staging_state } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("plans").update({ ai_blueprint: refs.previous_state.ai_blueprint ?? null, staging_state: refs.previous_state.staging_state ?? {} }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

// ── Areas + locations ────────────────────────────────────────────────────────
// areas has no home_id — ownership flows through location_id → locations.home_id.
async function ownArea(ctx: ExecutorContext, areaId: unknown) {
  if (typeof areaId !== "string" || !areaId) throw new Error("area_id is required.");
  const { data: area } = await ctx.db.from("areas").select("id, name, location_id").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("Area not found.");
  const { data: loc } = await ctx.db.from("locations").select("id").eq("id", (area as { location_id: string }).location_id).eq("home_id", ctx.homeId).maybeSingle();
  if (!loc) throw new Error("Area not found in this home.");
  return area as { id: string; name: string; location_id: string };
}

async function loadLocation(ctx: ExecutorContext, id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("location_id is required.");
  const { data } = await ctx.db.from("locations").select("id, name").eq("id", id).eq("home_id", ctx.homeId).maybeSingle();
  if (!data) throw new Error("Location not found in this home.");
  return data as { id: string; name: string };
}

export const rename_area: MutationExecutor = {
  async preview(ctx, args) { return `Rename area "${(await ownArea(ctx, args.area_id)).name}" → "${args.name}"`; },
  async execute(ctx, args) {
    const a = await ownArea(ctx, args.area_id);
    if (typeof args.name !== "string" || !args.name.trim()) throw new Error("name is required.");
    const { error } = await ctx.db.from("areas").update({ name: args.name.trim() }).eq("id", a.id);
    if (error) throw error;
    return { summary: `Area renamed to "${args.name.trim()}".`, payload: { id: a.id }, affected_row_refs: { table: "areas", ids: [a.id], op: "update", previous_state: { name: a.name } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("areas").update({ name: refs.previous_state.name }).eq("id", refs.ids[0]);
  },
};

export const rename_location: MutationExecutor = {
  async preview(ctx, args) { return `Rename location "${(await loadLocation(ctx, args.location_id)).name}" → "${args.name}"`; },
  async execute(ctx, args) {
    const l = await loadLocation(ctx, args.location_id);
    if (typeof args.name !== "string" || !args.name.trim()) throw new Error("name is required.");
    const { error } = await ctx.db.from("locations").update({ name: args.name.trim() }).eq("id", l.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Location renamed to "${args.name.trim()}".`, payload: { id: l.id }, affected_row_refs: { table: "locations", ids: [l.id], op: "update", previous_state: { name: l.name } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    await ctx.db.from("locations").update({ name: refs.previous_state.name }).eq("id", refs.ids[0]).eq("home_id", ctx.homeId);
  },
};

export const delete_area: MutationExecutor = {
  async preview(ctx, args) { return `Delete area "${(await ownArea(ctx, args.area_id)).name}" (only if it's empty)`; },
  async execute(ctx, args) {
    const a = await ownArea(ctx, args.area_id);
    const [{ count: plants }, { count: devices }] = await Promise.all([
      ctx.db.from("inventory_items").select("id", { count: "exact", head: true }).eq("home_id", ctx.homeId).eq("area_id", a.id).is("ended_at", null),
      ctx.db.from("devices").select("id", { count: "exact", head: true }).eq("home_id", ctx.homeId).eq("area_id", a.id),
    ]);
    if ((plants ?? 0) > 0 || (devices ?? 0) > 0) throw new Error(`"${a.name}" still has ${plants ?? 0} plant(s) and ${devices ?? 0} device(s) — move or remove them first.`);
    const { error } = await ctx.db.from("areas").delete().eq("id", a.id);
    if (error) throw error;
    return { summary: `Area "${a.name}" deleted.`, payload: { id: a.id }, affected_row_refs: { table: "areas", ids: [a.id], op: "delete", previous_state: { row: { location_id: a.location_id, name: a.name } } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "delete" || !refs.previous_state?.row) return;
    await ctx.db.from("areas").insert(refs.previous_state.row);
  },
};

export const delete_location: MutationExecutor = {
  async preview(ctx, args) { return `Delete location "${(await loadLocation(ctx, args.location_id)).name}" (only if it has no areas)`; },
  async execute(ctx, args) {
    const l = await loadLocation(ctx, args.location_id);
    const { count: areas } = await ctx.db.from("areas").select("id", { count: "exact", head: true }).eq("location_id", l.id);
    if ((areas ?? 0) > 0) throw new Error(`"${l.name}" still has ${areas} area(s) — delete or move them first.`);
    const { error } = await ctx.db.from("locations").delete().eq("id", l.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return { summary: `Location "${l.name}" deleted.`, payload: { id: l.id }, affected_row_refs: { table: "locations", ids: [l.id], op: "delete", previous_state: { row: { home_id: ctx.homeId, name: l.name } } } };
  },
  async undo(ctx, refs) {
    if (refs.op !== "delete" || !refs.previous_state?.row) return;
    await ctx.db.from("locations").insert(refs.previous_state.row);
  },
};

export const GAP_EXECUTORS: Record<string, MutationExecutor> = {
  complete_task, skip_task, snooze_task,
  remove_shopping_item, toggle_shopping_item_bought, complete_shopping_list,
  resolve_ailment, unlink_ailment_from_instance,
  update_plan, archive_plan, remove_plant_from_plan,
  rename_area, rename_location, delete_area, delete_location,
};
