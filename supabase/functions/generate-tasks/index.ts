import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { projectAnnualWindows } from "../_shared/annualWindows.ts";

const FN = "generate-tasks";

// Seasonal window task types — the frontend ghost engine owns these as ONE
// window task per blueprint, so the cron must NOT materialise them daily.
// Mirror of `src/lib/windowTasks.ts` (Deno can't import from src/) — keep in
// sync. Pruning joined Harvesting/Harvest here in 2026-07.
const SEASONAL_WINDOW_TYPES = new Set(["Harvesting", "Harvest", "Pruning"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper for safe timezone math
const parseSafeDate = (dateStr: string) =>
  new Date(`${dateStr.split("T")[0]}T12:00:00Z`);

// Postgres insert size cap — keep batches well under the 1MB statement limit.
const INSERT_CHUNK = 500;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = serviceClient();

    const body = await req.json().catch(() => ({}));
    const targetBlueprintId = body.blueprint_id;
    log(FN, "request_received", { blueprintId: targetBlueprintId ?? "all" });

    // 1. Load active blueprints. Archived blueprints must never materialise
    // (the frontend ghost engine filters them; the cron re-creating tasks for
    // a soft-deleted schedule was the "archived blueprint keeps watering"
    // bug). No last-task lookup any more: occurrences are projected straight
    // from the start_date grid below, so the previous unbounded tasks scan
    // (silently truncated at PostgREST's max_rows=1000, which restarted old
    // blueprints from today) is gone entirely.
    let bpQuery = supabase
      .from("task_blueprints")
      .select("*")
      .eq("is_recurring", true)
      .eq("is_archived", false);
    if (targetBlueprintId) bpQuery = bpQuery.eq("id", targetBlueprintId);

    const { data: blueprints, error: bpError } = await bpQuery;
    if (bpError) throw bpError;

    log(FN, "blueprints_loaded", {
      count: blueprints?.length ?? 0,
      targetBlueprintId: targetBlueprintId ?? "all",
    });

    const tasksToInsert: Array<Record<string, unknown>> = [];

    // Materialize at least 7 days ahead from today.
    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const sevenDaysAhead = new Date(now);
    sevenDaysAhead.setUTCDate(now.getUTCDate() + 7);
    const maxDate = parseSafeDate(sevenDaysAhead.toISOString().split("T")[0]);

    // 2. Loop through blueprints and project tasks. Pure JS — no DB calls
    // inside the loop now that last_task is precomputed.
    let harvestSkipped = 0;
    for (const bp of blueprints || []) {
      // ── Seasonal window blueprints (Harvesting/Harvest + Pruning) follow
      // Wave-20's window model: a single task per blueprint at start_date
      // with window_end_date populated, emitted by the frontend ghost engine
      // and materialised only when the user interacts. Daily cron
      // materialisation here produces duplicate non-window tasks that appear
      // alongside the canonical window task across the visible window (the
      // "after-skipping-it-doubled-up" bug; for pruning it was a task every
      // day of the season). Skip them entirely.
      if (SEASONAL_WINDOW_TYPES.has(bp.task_type) && bp.end_date) {
        harvestSkipped += 1;
        continue;
      }
      const freq = bp.frequency_days as number;
      if (!freq || freq <= 0) continue;

      // Project strictly on the start_date grid (start + k·freq), the same
      // phase the frontend ghost engine uses. Anchoring on the last existing
      // task drifted the grid after a postpone, and clamping to today put new
      // blueprints off-grid — both made the cron and the ghost engine emit
      // the same schedule on different days (double-frequency duplicates).
      // Dates that already have a task (incl. postponed originals) are
      // dropped by the unique_blueprint_date constraint at insert time.
      const todayMs = parseSafeDate(todayStr).getTime();
      const stepMs = freq * 86_400_000;
      const pausedUntilMs = bp.paused_until
        ? parseSafeDate(bp.paused_until).getTime()
        : null;
      const maxMs = maxDate.getTime();

      // Materialise one frequency grid, anchored at `anchorStr`, over the 7-day
      // horizon and bounded by `windowEndStr` (null = unbounded). Factored out
      // so an 'annual' seasonal-frequency routine runs the grid once per
      // projected year's window — re-anchored at each season's start — instead
      // of dying at the literal (single-year) end_date.
      const materialiseGrid = (anchorStr: string, windowEndStr: string | null) => {
        const startMs = parseSafeDate(anchorStr).getTime();
        const endMs = windowEndStr ? parseSafeDate(windowEndStr).getTime() : null;
        const cyclesToSkip = Math.max(0, Math.ceil((todayMs - startMs) / stepMs));
        let nextMs = startMs + cyclesToSkip * stepMs;

        while (nextMs <= maxMs) {
          if (endMs !== null && nextMs > endMs) break;

          // Occurrences inside a pause window are skipped permanently; the
          // grid resumes at the first occurrence on/after paused_until.
          if (pausedUntilMs !== null && nextMs < pausedUntilMs) {
            nextMs += stepMs;
            continue;
          }

          tasksToInsert.push({
            home_id: bp.home_id,
            blueprint_id: bp.id,
            title: bp.title,
            description: bp.description,
            type: bp.task_type,
            due_date: new Date(nextMs).toISOString().split("T")[0],
            location_id: bp.location_id,
            area_id: bp.area_id,
            // Carry the blueprint's ownership/visibility + plan link
            // (bug-audit-2026-07-10 #5). Without these the row takes the DB
            // defaults (scope='home', created_by=NULL, plan_id=NULL), so the cron
            // leaked every PERSONAL routine home-wide nightly and plan-linked
            // routines vanished from plan views.
            scope: bp.scope ?? "home",
            created_by: bp.created_by ?? null,
            assigned_to: bp.assigned_to ?? null,
            plan_id: bp.plan_id ?? null,
            // Prefer the array column (set by automationEngine); fall back to the
            // legacy singular column so older blueprints still work.
            inventory_item_ids: bp.inventory_item_ids?.length
              ? bp.inventory_item_ids
              : bp.inventory_item_id
                ? [bp.inventory_item_id]
                : null,
          });

          nextMs += stepMs;
        }
      };

      const recurrenceKind = bp.recurrence_kind ?? "once";
      const startStr = bp.start_date || bp.created_at.split("T")[0];
      if ((recurrenceKind === "annual" || recurrenceKind === "lifecycle_capped") && bp.end_date) {
        // Roll the season template into the occurrence(s) overlapping the 7-day
        // horizon and materialise within each year's window.
        const maxDateStr = maxDate.toISOString().split("T")[0];
        const windows = projectAnnualWindows(
          String(bp.start_date).slice(0, 10), String(bp.end_date).slice(0, 10),
          todayStr, maxDateStr, todayStr, { recursUntil: bp.recurs_until },
        );
        for (const w of windows) materialiseGrid(w.start, w.end);
      } else {
        // 'once' (or no end_date) — a single grid from the template start; the
        // terminal end_date break stays for genuinely capped routines.
        materialiseGrid(startStr, bp.end_date ? String(bp.end_date).slice(0, 10) : null);
      }
    }

    // 3. Batch insert in chunks. Duplicate-key errors (23505) are expected
    // when a manual task already exists for the same (blueprint_id, due_date)
    // — we swallow them and continue. Anything else gets logged.
    let inserted = 0;
    let duplicates = 0;
    for (let i = 0; i < tasksToInsert.length; i += INSERT_CHUNK) {
      const chunk = tasksToInsert.slice(i, i + INSERT_CHUNK);
      const { error, count } = await supabase
        .from("tasks")
        .insert(chunk, { count: "exact" });

      if (!error) {
        inserted += count ?? chunk.length;
        continue;
      }

      // A batch with even one duplicate fails the whole chunk. Fall back to
      // per-row inserts for this chunk so the duplicates don't take down the
      // non-duplicate rows alongside them.
      if (error.code === "23505") {
        for (const task of chunk) {
          const { error: singleErr } = await supabase.from("tasks").insert(task);
          if (!singleErr) {
            inserted += 1;
          } else if (singleErr.code === "23505") {
            duplicates += 1;
          } else {
            warn(FN, "insert_failed", {
              code: singleErr.code,
              message: singleErr.message,
              task: task.title,
              dueDate: task.due_date,
            });
          }
        }
      } else {
        warn(FN, "batch_insert_failed", {
          code: error.code,
          message: error.message,
          chunkSize: chunk.length,
        });
      }
    }

    log(FN, "complete", { projected: tasksToInsert.length, inserted, duplicates, harvestSkipped });

    return new Response(
      JSON.stringify({
        message: `Generated ${inserted} tasks (${duplicates} duplicates skipped).`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
