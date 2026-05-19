import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const FN = "export-user-data";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR-aligned user data export.
 * Returns a JSON archive of every row the caller owns or is a member of —
 * profile, homes they belong to, plants, tasks, plans, journals, ailments,
 * doctor sessions, and bookmarks.
 *
 * The client triggers a file download.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    // Limit to 3 exports per hour to discourage abuse — each export is a fair
    // amount of DB work.
    const rl = await enforceRateLimit(supabase, userId, FN, 3);
    if (rl) return rl;

    // Resolve every home the user belongs to.
    const { data: memberships } = await supabase
      .from("home_members")
      .select("home_id, role")
      .eq("user_id", userId);
    const homeIds = (memberships ?? []).map((m: any) => m.home_id);

    const homeFilter = homeIds.length > 0 ? homeIds : ["00000000-0000-0000-0000-000000000000"];

    const [
      profile, homes, locations, areas, plants, inventoryItems,
      blueprints, tasks, plans, journals, ailments, plantAilments,
      doctorSessions, guideBookmarks, planPhotos, shoppingLists, shoppingItems,
    ] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("uid", userId).maybeSingle(),
      supabase.from("homes").select("*").in("id", homeFilter),
      supabase.from("locations").select("*").in("home_id", homeFilter),
      supabase.from("areas").select("*, locations!inner(home_id)").in("locations.home_id", homeFilter),
      supabase.from("plants").select("*").in("home_id", homeFilter),
      supabase.from("inventory_items").select("*").in("home_id", homeFilter),
      supabase.from("task_blueprints").select("*").in("home_id", homeFilter),
      supabase.from("tasks").select("*").in("home_id", homeFilter),
      supabase.from("plans").select("*").in("home_id", homeFilter),
      supabase.from("plant_journals").select("*").in("home_id", homeFilter),
      supabase.from("ailments").select("*").in("home_id", homeFilter),
      supabase.from("plant_instance_ailments").select("*").in("home_id", homeFilter),
      supabase.from("plant_doctor_sessions").select("*").eq("user_id", userId),
      supabase.from("guide_bookmarks").select("*").eq("user_id", userId),
      supabase.from("plan_photos").select("*").in("home_id", homeFilter),
      supabase.from("shopping_lists").select("*").in("home_id", homeFilter),
      supabase.from("shopping_list_items").select("*, shopping_lists!inner(home_id)").in("shopping_lists.home_id", homeFilter),
    ]);

    const archive = {
      _format:        "rhozly-export-v1",
      _generated_at:  new Date().toISOString(),
      _user_id:       userId,
      profile:        profile.data ?? null,
      memberships:    memberships ?? [],
      homes:          homes.data ?? [],
      locations:      locations.data ?? [],
      areas:          areas.data ?? [],
      plants:         plants.data ?? [],
      inventory_items: inventoryItems.data ?? [],
      task_blueprints: blueprints.data ?? [],
      tasks:          tasks.data ?? [],
      plans:          plans.data ?? [],
      plan_photos:    planPhotos.data ?? [],
      plant_journals: journals.data ?? [],
      ailments:       ailments.data ?? [],
      plant_instance_ailments: plantAilments.data ?? [],
      doctor_sessions: doctorSessions.data ?? [],
      guide_bookmarks: guideBookmarks.data ?? [],
      shopping_lists:  shoppingLists.data ?? [],
      shopping_list_items: shoppingItems.data ?? [],
    };

    log(FN, "success", { userId, home_count: homeIds.length });

    return new Response(JSON.stringify(archive, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="rhozly-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (err: any) {
    logError(FN, "unhandled", { error: err?.message ?? String(err) });
    captureException(err, { fn: FN });
    return new Response(
      JSON.stringify({ error: err?.message ?? "Failed to export data." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
