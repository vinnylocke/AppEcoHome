import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";

const FN = "generate-tasks";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper for safe timezone math
const parseSafeDate = (dateStr: string) =>
  new Date(`${dateStr.split("T")[0]}T12:00:00Z`);

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const targetBlueprintId = body.blueprint_id;
    log(FN, "request_received", { blueprintId: targetBlueprintId ?? "all" });

    // 1. Get Blueprints
    let query = supabase
      .from("task_blueprints")
      .select("*")
      .eq("is_recurring", true);

    if (targetBlueprintId) query = query.eq("id", targetBlueprintId);

    const { data: blueprints, error: bpError } = await query;
    if (bpError) throw bpError;

    log(FN, "blueprints_loaded", { count: blueprints?.length ?? 0, targetBlueprintId: targetBlueprintId ?? "all" });

    const tasksToInsert = [];

    // 🚀 THE FIX: Cap the physical task generation strictly at TODAY. Let ghosts handle the future.
    const todayStr = new Date().toISOString().split("T")[0];
    const maxDate = parseSafeDate(todayStr);

    // 2. Loop through blueprints and project tasks UP TO TODAY ONLY
    for (const bp of blueprints || []) {
      const { data: lastTask } = await supabase
        .from("tasks")
        .select("due_date")
        .eq("blueprint_id", bp.id)
        .order("due_date", { ascending: false })
        .limit(1)
        .single();

      const startStr = bp.start_date || bp.created_at.split("T")[0];
      let nextDate: Date;
      if (lastTask) {
        nextDate = parseSafeDate(lastTask.due_date);
        nextDate.setDate(nextDate.getDate() + bp.frequency_days);
      } else {
        // No prior tasks: start from bp.start_date but clamp to today.
        // Avoids backfilling overdue tasks when a blueprint has a past start_date
        // (e.g. user backdated their planting). If start_date is in the future
        // (seasonal blueprint not yet started), nextDate stays in the future and
        // the while-loop below produces nothing — correct behaviour.
        const fromStart = parseSafeDate(startStr);
        nextDate = fromStart < maxDate ? maxDate : fromStart;
      }

      const bpEndDate = bp.end_date ? parseSafeDate(bp.end_date) : null;

      // Loop will naturally IGNORE future seasons because nextDate > maxDate!
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

    // 3. Batch Insert
    if (tasksToInsert.length > 0) {
      for (const task of tasksToInsert) {
        const { error } = await supabase.from("tasks").insert(task);

        // Postgres Error 23505 means "Duplicate Key" (our unique date rule).
        // We safely ignore it. If it's a different error, we log it.
        if (error && error.code !== "23505") {
          warn(FN, "insert_failed", { code: error.code, message: error.message, task: task.title, dueDate: task.due_date });
        }
      }
    }

    log(FN, "complete", { inserted: tasksToInsert.length });

    return new Response(
      JSON.stringify({ message: `Generated ${tasksToInsert.length} tasks.` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
