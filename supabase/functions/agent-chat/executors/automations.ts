/**
 * Automation mutation executors for the agent-chat tools.
 *
 * create / update / delete / run automations. The trigger tree + actions are
 * built + validated by the pure `_shared/automationTriggerBuild.ts`; this layer
 * adds DB access: ID-ownership checks (device / blueprint / area belong to the
 * home), the insert/update/delete, and a human-readable confirm preview built
 * from `summariseTree`. Scoped to ctx.homeId (service role bypasses RLS).
 */

import type { ExecutorContext, MutationExecutor, MutationResult } from "./mutations.ts";
import { summariseTree, type ConditionNode } from "../../_shared/conditionTree.ts";
import { fanoutActions } from "../../_shared/fanoutActions.ts";
import { sendReceipt } from "../../_shared/automationReceipt.ts";
import {
  buildTriggerTree, buildActions, treeReferencedIds, actionDeviceIds,
  type GroupInput, type ActionInput, type BuiltAction,
} from "../../_shared/automationTriggerBuild.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verify every referenced id belongs to the home. Throws on a foreign id. */
async function assertOwned(
  ctx: ExecutorContext,
  refs: { deviceIds?: string[]; blueprintIds?: string[]; areaIds?: string[] },
): Promise<void> {
  const checks: Array<[string, string, string[]]> = [
    ["devices", "device", refs.deviceIds ?? []],
    ["task_blueprints", "task schedule", refs.blueprintIds ?? []],
    ["areas", "area", refs.areaIds ?? []],
  ];
  for (const [table, label, ids] of checks) {
    if (ids.length === 0) continue;
    const { data, error } = await ctx.db.from(table).select("id").eq("home_id", ctx.homeId).in("id", ids);
    if (error) throw error;
    const found = new Set((data ?? []).map((r: { id: string }) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`These ${label} IDs aren't in this home: ${missing.join(", ")}. Use the list tools to get valid IDs.`);
  }
}

function summariseActions(actions: BuiltAction[]): string {
  return actions.map((a) => {
    if (a.action_kind === "valve_open") return `open valve${a.valve_duration_seconds ? ` (${Math.round(a.valve_duration_seconds / 60)} min)` : ""}`;
    if (a.action_kind === "valve_close") return "close valve";
    if (a.action_kind === "notification") return `notify${a.notification_title ? ` "${a.notification_title}"` : ""}`;
    return "complete linked task";
  }).join(", ");
}

/** Build + validate the tree and actions from raw tool args, then check IDs. */
async function buildAndValidate(ctx: ExecutorContext, trigger: GroupInput, actions: ActionInput[]) {
  const tree = buildTriggerTree(trigger);
  const built = buildActions(actions);
  const refs = treeReferencedIds(tree);
  await assertOwned(ctx, {
    deviceIds: [...refs.sensorIds, ...actionDeviceIds(built)],
    blueprintIds: refs.blueprintIds,
    areaIds: refs.areaIds,
  });
  return { tree, built };
}

async function deriveLocationId(ctx: ExecutorContext, areaId: string | null | undefined): Promise<string | null> {
  if (!areaId) return null;
  // areas has no home_id — ownership flows through location_id → locations.home_id.
  const { data } = await ctx.db.from("areas").select("location_id, locations!inner(home_id)").eq("id", areaId).eq("locations.home_id", ctx.homeId).maybeSingle();
  return (data?.location_id as string | null) ?? null;
}

// ── create_automation ──────────────────────────────────────────────────────
export const create_automation: MutationExecutor = {
  async preview(ctx, args) {
    const tree = buildTriggerTree(args.trigger);
    const built = buildActions(args.actions);
    return `Create automation "${args.name}": WHEN ${summariseTree(tree)} → ${summariseActions(built)}.`;
  },
  async execute(ctx, args): Promise<MutationResult> {
    const { tree, built } = await buildAndValidate(ctx, args.trigger, args.actions);
    const areaId = (args.area_id as string | null) ?? null;
    const payload = {
      home_id: ctx.homeId,
      name: String(args.name),
      is_active: args.is_active === false ? false : true,
      trigger_kind: "condition",
      trigger_logic: tree,
      sensor_cooldown_minutes: typeof args.cooldown_minutes === "number" ? args.cooldown_minutes : 60,
      condition_was_true: false,
      area_id: areaId,
      location_id: await deriveLocationId(ctx, areaId),
      run_limit_count: typeof args.run_limit_count === "number" && args.run_limit_count > 0 ? args.run_limit_count : null,
      run_limit_window_hours: typeof args.run_limit_window_hours === "number" && args.run_limit_window_hours > 0 ? args.run_limit_window_hours : 24,
    };
    const { data: row, error } = await ctx.db.from("automations").insert(payload).select("id").single();
    if (error) throw error;
    const id = (row as { id: string }).id;
    const { error: actErr } = await ctx.db.from("automation_actions").insert(built.map((a) => ({ ...a, automation_id: id })));
    if (actErr) { await ctx.db.from("automations").delete().eq("id", id); throw actErr; }
    return {
      summary: `Created automation "${payload.name}".`,
      payload: { id, name: payload.name, trigger: summariseTree(tree), actions: summariseActions(built) },
      affected_row_refs: { table: "automations", ids: [id], op: "insert" },
    };
  },
  // Insert undo — deleting the automation cascades its actions/runs.
  async undo(ctx, refs) {
    if (refs.op !== "insert" || refs.ids.length === 0) return;
    await ctx.db.from("automations").delete().in("id", refs.ids).eq("home_id", ctx.homeId);
  },
};

// ── update_automation ────────────────────────────────────────────────────────
export const update_automation: MutationExecutor = {
  async preview(ctx, args) {
    const a = await loadAutomation(ctx, args.automation_id);
    const bits: string[] = [];
    if (args.name !== undefined) bits.push(`rename to "${args.name}"`);
    if (args.is_active !== undefined) bits.push(args.is_active ? "enable" : "disable");
    if (args.trigger !== undefined) bits.push(`change trigger to: ${summariseTree(buildTriggerTree(args.trigger))}`);
    if (args.actions !== undefined) bits.push(`set actions to: ${summariseActions(buildActions(args.actions))}`);
    if (args.run_limit_count !== undefined) bits.push(`run limit ${args.run_limit_count}/${args.run_limit_window_hours ?? a.run_limit_window_hours ?? 24}h`);
    if (args.cooldown_minutes !== undefined) bits.push(`cooldown ${args.cooldown_minutes} min`);
    return `Update "${a.name}": ${bits.length ? bits.join("; ") : "no changes"}.`;
  },
  async execute(ctx, args): Promise<MutationResult> {
    const a = await loadAutomation(ctx, args.automation_id);
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    const capture = (k: string, v: unknown) => { patch[k] = v; prev[k] = (a as Record<string, unknown>)[k]; };

    if (args.name !== undefined) capture("name", String(args.name));
    if (args.is_active !== undefined) capture("is_active", !!args.is_active);
    if (args.run_limit_count !== undefined) capture("run_limit_count", args.run_limit_count > 0 ? args.run_limit_count : null);
    if (args.run_limit_window_hours !== undefined) capture("run_limit_window_hours", args.run_limit_window_hours > 0 ? args.run_limit_window_hours : 24);
    if (args.cooldown_minutes !== undefined) capture("sensor_cooldown_minutes", args.cooldown_minutes);

    let newActions: BuiltAction[] | null = null;
    if (args.trigger !== undefined || args.actions !== undefined) {
      // Validate IDs against whatever the final tree/actions will be.
      const tree = args.trigger !== undefined ? buildTriggerTree(args.trigger) : (a.trigger_logic as ConditionNode);
      newActions = args.actions !== undefined ? buildActions(args.actions) : null;
      const refs = treeReferencedIds(tree);
      await assertOwned(ctx, {
        deviceIds: [...refs.sensorIds, ...(newActions ? actionDeviceIds(newActions) : [])],
        blueprintIds: refs.blueprintIds, areaIds: refs.areaIds,
      });
      if (args.trigger !== undefined) capture("trigger_logic", tree);
    }

    let prevActions: BuiltAction[] | null = null;
    if (newActions) {
      const { data: old } = await ctx.db.from("automation_actions")
        .select("action_kind, target_device_id, valve_duration_seconds, notification_title, notification_body, target_blueprint_id, ord")
        .eq("automation_id", a.id).order("ord");
      prevActions = (old ?? []) as BuiltAction[];
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await ctx.db.from("automations").update(patch).eq("id", a.id).eq("home_id", ctx.homeId);
      if (error) throw error;
    }
    if (newActions) {
      await ctx.db.from("automation_actions").delete().eq("automation_id", a.id);
      if (newActions.length) await ctx.db.from("automation_actions").insert(newActions.map((x) => ({ ...x, automation_id: a.id })));
    }
    return {
      summary: `Updated automation "${(patch.name as string) ?? a.name}".`,
      payload: { id: a.id },
      affected_row_refs: { table: "automations", ids: [a.id], op: "update", previous_state: { fields: prev, actions: prevActions } },
    };
  },
  async undo(ctx, refs) {
    if (refs.op !== "update" || !refs.previous_state) return;
    const id = refs.ids[0];
    const ps = refs.previous_state as { fields?: Record<string, unknown>; actions?: BuiltAction[] | null };
    if (ps.fields && Object.keys(ps.fields).length) {
      await ctx.db.from("automations").update(ps.fields).eq("id", id).eq("home_id", ctx.homeId);
    }
    if (ps.actions) {
      await ctx.db.from("automation_actions").delete().eq("automation_id", id);
      if (ps.actions.length) await ctx.db.from("automation_actions").insert(ps.actions.map((x) => ({ ...x, automation_id: id })));
    }
  },
};

// ── delete_automation ────────────────────────────────────────────────────────
export const delete_automation: MutationExecutor = {
  async preview(ctx, args) {
    const a = await loadAutomation(ctx, args.automation_id);
    return `Delete automation "${a.name}" (${summariseTree(a.trigger_logic as ConditionNode)}). This removes it and its actions.`;
  },
  async execute(ctx, args): Promise<MutationResult> {
    const a = await loadAutomation(ctx, args.automation_id);
    const { data: actions } = await ctx.db.from("automation_actions")
      .select("action_kind, target_device_id, valve_duration_seconds, notification_title, notification_body, target_blueprint_id, ord")
      .eq("automation_id", a.id).order("ord");
    // Snapshot the full row + actions so undo can recreate them.
    const snapshot = {
      automation: {
        name: a.name, is_active: a.is_active, trigger_kind: a.trigger_kind, trigger_logic: a.trigger_logic,
        sensor_cooldown_minutes: a.sensor_cooldown_minutes, condition_was_true: false,
        area_id: a.area_id, location_id: a.location_id, run_limit_count: a.run_limit_count, run_limit_window_hours: a.run_limit_window_hours,
      },
      actions: (actions ?? []) as BuiltAction[],
    };
    const { error } = await ctx.db.from("automations").delete().eq("id", a.id).eq("home_id", ctx.homeId);
    if (error) throw error;
    return {
      summary: `Deleted automation "${a.name}".`,
      payload: { id: a.id, name: a.name },
      affected_row_refs: { table: "automations", ids: [a.id], op: "delete", previous_state: snapshot },
    };
  },
  // Recreate from the snapshot.
  async undo(ctx, refs) {
    if (refs.op !== "delete" || !refs.previous_state) return;
    const snap = refs.previous_state as { automation: Record<string, unknown>; actions: BuiltAction[] };
    const { data: row, error } = await ctx.db.from("automations").insert({ ...snap.automation, home_id: ctx.homeId }).select("id").single();
    if (error) throw error;
    const id = (row as { id: string }).id;
    if (snap.actions?.length) await ctx.db.from("automation_actions").insert(snap.actions.map((x) => ({ ...x, automation_id: id })));
  },
};

// ── run_automation ───────────────────────────────────────────────────────────
export const run_automation: MutationExecutor = {
  async preview(ctx, args) {
    const a = await loadAutomation(ctx, args.automation_id);
    return `Run "${a.name}" now — fires its actions immediately, ignoring the trigger conditions.`;
  },
  async execute(ctx, args): Promise<MutationResult> {
    const a = await loadAutomation(ctx, args.automation_id);
    const now = new Date();
    const { data: runRow, error } = await ctx.db.from("automation_runs")
      .insert({ automation_id: a.id, home_id: ctx.homeId, triggered_by: "manual", status: "pending" })
      .select("id").single();
    if (error) throw error;
    const runId = (runRow as { id: string }).id;
    const fanout = await fanoutActions(ctx.db, { id: a.id, home_id: ctx.homeId, name: a.name as string }, runId, now);
    const membersAlerted = await sendReceipt(
      ctx.db, { id: a.id, home_id: ctx.homeId, name: a.name as string }, "ran",
      { valvesFired: fanout.valves_queued, tasksCompleted: fanout.tasks_completed.length },
    );
    await ctx.db.from("automation_runs").update({
      status: "success",
      devices_triggered: { members_alerted: Math.max(membersAlerted, fanout.notifications_sent), valves_queued: fanout.valves_queued },
      tasks_completed: fanout.tasks_completed,
      completed_at: now.toISOString(),
    }).eq("id", runId);
    return {
      summary: `Ran "${a.name}" — ${fanout.valves_queued} valve(s) queued, ${fanout.tasks_completed.length} task(s) completed${membersAlerted ? `, ${membersAlerted} member(s) alerted` : ""}. Valves fire on the next drain (within a few minutes).`,
      payload: { runId, membersAlerted, ...fanout },
      // No undo — you can't un-fire a run.
    };
  },
  async undo() { /* not reversible */ },
};

// Load + home-scope an automation, or throw.
async function loadAutomation(ctx: ExecutorContext, automationId: unknown): Promise<Record<string, any>> {
  if (typeof automationId !== "string" || !automationId) throw new Error("automation_id is required.");
  const { data, error } = await ctx.db.from("automations").select("*").eq("id", automationId).eq("home_id", ctx.homeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Automation not found in this home. Use list_automations to get a valid id.");
  return data as Record<string, any>;
}

export const AUTOMATION_EXECUTORS: Record<string, MutationExecutor> = {
  create_automation,
  update_automation,
  delete_automation,
  run_automation,
};
