import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "generate-tasks";

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

    // 1. Load blueprints + last task per blueprint in parallel.
    // The lastTask lookup uses DISTINCT ON so we get one row per
    // blueprint_id in a single query instead of N+1 sequential reads.
    let bpQuery = supabase
      .from("task_blueprints")
      .select("*")
      .eq("is_recurring", true);
    if (targetBlueprintId) bpQuery = bpQuery.eq("id", targetBlueprintId);

    let lastTasksQuery = supabase
      .from("tasks")
      .select("blueprint_id, due_date")
      .not("blueprint_id", "is", null);
    if (targetBlueprintId) lastTasksQuery = lastTasksQuery.eq("blueprint_id", targetBlueprintId);

    const [
      { data: blueprints, error: bpError },
      { data: allBlueprintTasks, error: ltError },
    ] = await Promise.all([bpQuery, lastTasksQuery]);

    if (bpError) throw bpError;
    if (ltError) throw ltError;

    // Build blueprint_id → max(due_date) map in JS (single pass)
    const lastTaskByBp = new Map<string, string>();
    for (const t of allBlueprintTasks ?? []) {
      const existing = lastTaskByBp.get(t.blueprint_id as string);
      if (!existing || (t.due_date as string) > existing) {
        lastTaskByBp.set(t.blueprint_id as string, t.due_date as string);
      }
    }

    log(FN, "blueprints_loaded", {
      count: blueprints?.length ?? 0,
      withLastTask: lastTaskByBp.size,
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
    for (const bp of blueprints || []) {
      const startStr = bp.start_date || bp.created_at.split("T")[0];
      const lastDate = lastTaskByBp.get(bp.id);

      let nextDate: Date;
      if (lastDate) {
        nextDate = parseSafeDate(lastDate);
        nextDate.setDate(nextDate.getDate() + bp.frequency_days);
      } else {
        // No prior tasks: start from bp.start_date but clamp to today.
        const fromStart = parseSafeDate(startStr);
        const today = parseSafeDate(todayStr);
        nextDate = fromStart < today ? today : fromStart;
      }

      const bpEndDate = bp.end_date ? parseSafeDate(bp.end_date) : null;

      while (nextDate <= maxDate) {
        if (bpEndDate && nextDate > bpEndDate) break;

        tasksToInsert.push({
          home_id: bp.home_id,
          blueprint_id: bp.id,
          title: bp.title,
          description: bp.description,
          type: bp.task_type,
          due_date: nextDate.toISOString().split("T")[0],
          location_id: bp.location_id,
          area_id: bp.area_id,
          // Prefer the array column (set by automationEngine); fall back to the
          // legacy singular column so older blueprints still work.
          inventory_item_ids: bp.inventory_item_ids?.length
            ? bp.inventory_item_ids
            : bp.inventory_item_id
              ? [bp.inventory_item_id]
              : null,
        });

        nextDate.setDate(nextDate.getDate() + bp.frequency_days);
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

    log(FN, "complete", { projected: tasksToInsert.length, inserted, duplicates });

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
