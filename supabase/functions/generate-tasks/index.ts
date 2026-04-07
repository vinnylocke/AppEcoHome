import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Optional: Accept a specific blueprint ID to generate tasks immediately upon creation
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
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 14); // 🚀 The 14-Day Rolling Window

    // 2. Loop through blueprints and project future tasks
    for (const bp of blueprints || []) {
      const { data: lastTask } = await supabase
        .from("tasks")
        .select("due_date")
        .eq("blueprint_id", bp.id)
        .order("due_date", { ascending: false })
        .limit(1)
        .single();

      let nextDate = lastTask ? new Date(lastTask.due_date) : new Date();
      if (lastTask) {
        nextDate.setDate(nextDate.getDate() + bp.frequency_days); // Step forward
      }

      const bpEndDate = bp.end_date ? new Date(bp.end_date) : null;

      while (nextDate <= maxDate) {
        if (bpEndDate && nextDate > bpEndDate) break;

        tasksToInsert.push({
          home_id: bp.home_id,
          blueprint_id: bp.id,
          title: bp.title,
          description: bp.description,
          type: bp.task_type,
          due_date: nextDate.toISOString().split("T")[0], // YYYY-MM-DD
          location_id: bp.location_id,
          area_id: bp.area_id,
          inventory_item_id: bp.inventory_item_id,
        });

        nextDate.setDate(nextDate.getDate() + bp.frequency_days);
      }
    }

    // 3. Batch Insert (FIXED)
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
