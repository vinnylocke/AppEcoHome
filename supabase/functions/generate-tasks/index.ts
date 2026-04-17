import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    // 1. Get Blueprints
    let query = supabase
      .from("task_blueprints")
      .select("*")
      .eq("is_recurring", true);

    if (targetBlueprintId) query = query.eq("id", targetBlueprintId);

    const { data: blueprints, error: bpError } = await query;
    if (bpError) throw bpError;

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

      // 🚀 THE FIX: If there are no previous tasks, start exactly on the blueprint's start_date!
      const startStr = bp.start_date || bp.created_at.split("T")[0];
      let nextDate = lastTask
        ? parseSafeDate(lastTask.due_date)
        : parseSafeDate(startStr);

      if (lastTask) {
        nextDate.setDate(nextDate.getDate() + bp.frequency_days); // Step forward from the last task
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
          due_date: nextDate.toISOString().split("T")[0], // Safe YYYY-MM-DD extraction
          location_id: bp.location_id,
          area_id: bp.area_id,
          inventory_item_id: bp.inventory_item_id,
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
          console.error("Failed to insert generated task:", error);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Generated ${tasksToInsert.length} tasks.` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
