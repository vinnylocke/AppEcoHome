// mutate-task — the Wear companion's WRITE path: complete / postpone / delete a
// task from the watch, with the same data-correctness the browser guarantees.
//
// Why a server function (not a direct client write): get-today-tasks returns
// only 7 columns but a faithful materialised row needs ~15 (buildGhostPayload);
// there are ZERO DB triggers on `tasks`, so the user_events row that feeds the
// pattern engine + streaks is code-orchestrated and would be silently lost by a
// bare client write. The pure branch logic lives in _shared/taskWrite.ts
// (unit-tested); this handler authorises, fetches the source, runs the planned
// ops with the 23505→UPDATE recovery, emits the event, and auto-journals.
//
// Auth: requireAuth (JWT) + requireHomeMembership + a self-enforced scope subset
// + a home-match guard on the target row/blueprint (serviceClient bypasses RLS).
// See docs/plans/wear-phase3-task-actions.md.

import { serviceClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { captureException } from "../_shared/sentry.ts";
import {
  buildAutoEntryCopy,
  planTaskMutation,
  shouldAutoCreate,
  type MutateAction,
  type SourceRow,
  type WriteOp,
} from "../_shared/taskWrite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

/** The watch may only act on rows it can SEE — mirror get-today-tasks' scope
 *  subset (home rows + the caller's own personal/assigned rows). */
const inScope = (
  row: { scope?: string | null; created_by?: string | null; assigned_to?: string | null },
  userId: string,
): boolean =>
  (row.scope ?? "home") === "home" || row.created_by === userId || row.assigned_to === userId;

const dateOnly = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = serviceClient();
    // serviceClient() is a newer supabase-js than the auth helpers import; cast
    // for them (same pattern as get-today-tasks). Queries use `db`.
    const authDb = db as unknown as Parameters<typeof requireAuth>[1];

    const auth = await requireAuth(req, authDb);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const homeId: unknown = body.home_id;
    const action: unknown = body.action;
    const task = body.task;

    if (typeof homeId !== "string") return json({ error: "home_id is required" }, 400);
    if (action !== "complete" && action !== "postpone" && action !== "delete") {
      return json({ error: "invalid action" }, 400);
    }
    if (!task || typeof task !== "object" || typeof task.id !== "string") {
      return json({ error: "task is required" }, 400);
    }
    const dueDate = dateOnly(task.due_date);
    if (!dueDate) return json({ error: "task.due_date is required" }, 400);
    const isGhost = task.is_ghost === true;

    const membershipErr = await requireHomeMembership(authDb, homeId, userId);
    if (membershipErr) return membershipErr;

    // ── Resolve the source row (+ home & scope guard) ────────────────────────
    let source: SourceRow;
    let blueprintId: string | null;

    if (isGhost) {
      if (typeof task.blueprint_id !== "string") {
        return json({ error: "task.blueprint_id is required for a ghost" }, 400);
      }
      const { data: bp, error } = await db
        .from("task_blueprints")
        .select(
          "id, home_id, title, description, task_type, location_id, area_id, plan_id, inventory_item_ids, scope, created_by, assigned_to",
        )
        .eq("id", task.blueprint_id)
        .maybeSingle();
      if (error) throw error;
      if (!bp) return json({ error: "blueprint_not_found" }, 404);
      if (bp.home_id !== homeId) return json({ error: "wrong_home" }, 403);
      if (!inScope(bp, userId)) return json({ error: "not_visible" }, 403);

      blueprintId = bp.id;
      source = {
        home_id: bp.home_id,
        blueprint_id: bp.id,
        title: bp.title,
        description: bp.description,
        type: bp.task_type,
        due_date: dueDate,
        location_id: bp.location_id,
        area_id: bp.area_id,
        plan_id: bp.plan_id,
        inventory_item_ids: bp.inventory_item_ids,
        scope: bp.scope,
        created_by: bp.created_by,
        assigned_to: bp.assigned_to,
        window_end_date: dateOnly(task.window_end_date),
        next_check_at: null,
      };
    } else {
      const { data: row, error } = await db
        .from("tasks")
        .select(
          "id, home_id, blueprint_id, title, description, type, due_date, location_id, area_id, plan_id, inventory_item_ids, scope, created_by, assigned_to, window_end_date, next_check_at",
        )
        .eq("id", task.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return json({ error: "task_not_found" }, 404);
      if (row.home_id !== homeId) return json({ error: "wrong_home" }, 403);
      if (!inScope(row, userId)) return json({ error: "not_visible" }, 403);

      blueprintId = row.blueprint_id ?? null;
      source = {
        home_id: row.home_id,
        blueprint_id: row.blueprint_id ?? null,
        title: row.title,
        description: row.description,
        type: row.type,
        due_date: dateOnly(row.due_date) ?? dueDate,
        location_id: row.location_id,
        area_id: row.area_id,
        plan_id: row.plan_id,
        inventory_item_ids: row.inventory_item_ids,
        scope: row.scope,
        created_by: row.created_by,
        assigned_to: row.assigned_to,
        window_end_date: dateOnly(row.window_end_date),
        next_check_at: dateOnly(row.next_check_at),
      };
    }

    const deleteSeries = action === "delete" && body.delete_series === true;
    // Destructive cascade — re-verify the blueprint's home + scope for a
    // physical task (a ghost's blueprint was already verified above).
    if (deleteSeries && blueprintId && !isGhost) {
      const { data: bp2 } = await db
        .from("task_blueprints")
        .select("home_id, scope, created_by, assigned_to")
        .eq("id", blueprintId)
        .maybeSingle();
      if (!bp2 || bp2.home_id !== homeId || !inScope(bp2, userId)) {
        return json({ error: "cannot_delete_series" }, 403);
      }
    }

    const newDate = action === "postpone" ? dateOnly(body.new_date) : null;
    if (action === "postpone" && !newDate) return json({ error: "new_date is required" }, 400);

    // ── Plan (pure) → execute ────────────────────────────────────────────────
    const plan = planTaskMutation({
      action: action as MutateAction,
      taskId: task.id,
      isGhost,
      blueprintId,
      source,
      userId,
      now: new Date().toISOString(),
      newDate,
      deleteSeries,
    });
    if (plan.error) {
      return json({ error: plan.error.code, hint: plan.error.hint }, plan.error.status);
    }

    const { affected, primaryId } = await runOps(db, plan.ops);

    // Event fires ONLY when a row actually changed (retry-safe). Fire-and-forget:
    // a failure here must not fail the already-committed task write.
    if (plan.event && affected > 0) {
      // For a ghost completion the browser logs the materialised row's real
      // UUID (not the ghost string) — mirror that so any future detector that
      // joins task_completed → tasks.id sees watch completions too.
      const meta =
        plan.event.event_type === "task_completed" && primaryId
          ? { ...plan.event.meta, task_id: primaryId }
          : plan.event.meta;
      try {
        const { error: evErr } = await db.from("user_events").insert({
          user_id: userId,
          event_type: plan.event.event_type,
          meta,
        });
        if (evErr) console.warn("[mutate-task] event insert failed", evErr.message);
      } catch (e) {
        console.warn("[mutate-task] event insert threw", (e as Error).message);
      }
    }

    // Auto-journal on a real completion (preference-gated, idempotent on task_id).
    if (action === "complete" && affected > 0 && primaryId) {
      await maybeAutoJournal(db, source, primaryId, userId, homeId);
    }

    return json({ ok: true, ...(affected > 0 && plan.hint ? { hint: plan.hint } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mutate-task]", message);
    await captureException("mutate-task", error);
    return json({ error: message }, 500);
  }
});

/**
 * Execute the planned ops in order with the service client, baking in the
 * 23505 → UPDATE-on-(blueprint_id,due_date) recovery. Returns the number of
 * rows changed (drives whether the event fires) and the resolved primary task
 * id (the completed/updated row, for auto-journal).
 */
async function runOps(
  db: ReturnType<typeof serviceClient>,
  ops: WriteOp[],
): Promise<{ affected: number; primaryId: string | null }> {
  let affected = 0;
  let primaryId: string | null = null;
  const capture = (rows: { id?: string }[] | null) => {
    const n = rows?.length ?? 0;
    affected += n;
    if (primaryId == null && rows && rows[0]?.id) primaryId = rows[0].id;
    return n;
  };

  for (const op of ops) {
    if (op.kind === "update_by_id") {
      let q = db.from("tasks").update(op.set).eq("id", op.id);
      for (const [c, v] of Object.entries(op.guardNeq ?? {})) q = q.neq(c, v as never);
      const { data, error } = await q.select("id");
      if (error) throw error;
      capture(data);
    } else if (op.kind === "insert") {
      const { data, error } = await db.from("tasks").insert([op.values]).select("id");
      if (!error) {
        capture(data);
        continue;
      }
      if (!isUniqueViolation(error)) throw error;
      if (op.onConflict) {
        let uq = db
          .from("tasks")
          .update(op.onConflict.set)
          .eq("blueprint_id", op.values.blueprint_id as string)
          .eq("due_date", op.values.due_date as string);
        for (const [c, v] of Object.entries(op.onConflict.guardNeq ?? {})) uq = uq.neq(c, v as never);
        const { data: ud, error: ue } = await uq.select("id");
        if (ue) throw ue;
        capture(ud);
      } else if (op.tolerateConflict) {
        // slot already owned by another surface — no-op, no state change
      } else {
        throw error;
      }
    } else if (op.kind === "delete_by_id") {
      const { data, error } = await db.from("tasks").delete().eq("id", op.id).select("id");
      if (error) throw error;
      capture(data);
    } else if (op.kind === "delete_blueprint") {
      const { data, error } = await db.from("task_blueprints").delete().eq("id", op.id).select("id");
      if (error) throw error;
      capture(data);
    }
  }
  return { affected, primaryId };
}

/** Server port of journalAutoUpdateService.maybeCreateAutoEntry — preference-
 *  gated, idempotent on plant_journals(task_id). Never throws. */
async function maybeAutoJournal(
  db: ReturnType<typeof serviceClient>,
  source: SourceRow,
  taskId: string,
  userId: string,
  homeId: string,
): Promise<void> {
  try {
    const { data: profile } = await db
      .from("user_profiles")
      .select("auto_update_journal_categories")
      .eq("uid", userId)
      .maybeSingle();
    const cats: string[] = profile?.auto_update_journal_categories ?? [];
    if (!shouldAutoCreate(source.type, cats)) return;

    const itemIds = source.inventory_item_ids ?? [];
    let plantNames: string[] = [];
    if (itemIds.length > 0) {
      const { data: items } = await db
        .from("inventory_items")
        .select("id, plant_name, nickname")
        .in("id", itemIds);
      plantNames = (items ?? []).map((i: { plant_name?: string; nickname?: string }) =>
        i.nickname || i.plant_name || "Plant",
      );
    }

    const copy = buildAutoEntryCopy({ title: source.title, type: source.type }, plantNames);
    const inventoryItemId = itemIds.length === 1 ? itemIds[0] : null;

    const { error } = await db.from("plant_journals").insert({
      home_id: homeId,
      subject: copy.subject,
      description: copy.description,
      task_id: taskId,
      inventory_item_id: inventoryItemId,
    });
    if (error && !isUniqueViolation(error)) {
      console.warn("[mutate-task] auto-journal insert failed", error.message);
    }
  } catch (e) {
    console.warn("[mutate-task] auto-journal failed", (e as Error).message);
  }
}
