// manual-refresh-ai-plant
//
// Sage+ "Refresh now" button on Plant Edit Modal for global AI plants.
// Re-runs Gemini against the same care-guide schema, diffs the result against
// the row's current care_guide_data, and applies changes if any.
//
// Rate-limited to ONE call per (user, plant) per 7 days via the
// ai_plant_manual_refresh_log table.
//
// Tier-gated: profile.ai_enabled must be true.
//
// Auth: requires a valid user JWT. Cost lands against the user's AI quota
// (unlike the stale-check cron in Wave 4, which uses a system sentinel).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { diffCareGuide } from "../_shared/aiPlantCatalogue.ts";

const FN = "manual-refresh-ai-plant";
const RATE_LIMIT_DAYS = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CARE_GUIDE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plantData: {
      type: "OBJECT",
      properties: {
        common_name:       { type: "STRING" },
        scientific_name:   { type: "ARRAY", items: { type: "STRING" } },
        description:       { type: "STRING" },
        plant_type:        { type: "STRING" },
        cycle:             { type: "STRING" },
        care_level:        { type: "STRING" },
        growth_rate:       { type: "STRING" },
        maintenance:       { type: "STRING" },
        watering_min_days: { type: "NUMBER" },
        watering_max_days: { type: "NUMBER" },
        sunlight:          { type: "ARRAY", items: { type: "STRING" } },
        flowering_season:  {
          type: "ARRAY",
          description: "Seasons in which the plant flowers. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        harvest_season:    {
          type: "ARRAY",
          description: "Seasons in which the plant is ready to harvest. Each element MUST be one of: 'Spring', 'Summer', 'Autumn', 'Winter'.",
          items: { type: "STRING", enum: ["Spring", "Summer", "Autumn", "Winter"] },
        },
        pruning_month:     {
          type: "ARRAY",
          description: "Abbreviated month names. Each element MUST be one of: 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'.",
          items: { type: "STRING", enum: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
        },
        propagation:       { type: "ARRAY", items: { type: "STRING" } },
        attracts:          { type: "ARRAY", items: { type: "STRING" } },
        is_toxic_pets:     { type: "BOOLEAN" },
        is_toxic_humans:   { type: "BOOLEAN" },
        indoor:            { type: "BOOLEAN" },
        is_edible:         { type: "BOOLEAN" },
      },
      required: ["common_name", "scientific_name", "description", "plant_type", "cycle", "care_level", "watering_min_days", "watering_max_days", "sunlight"],
    },
  },
  required: ["plantData"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const callerUserId = authResult.user.id;

    const body = await req.json().catch(() => ({}));
    const plantId = Number(body.plantId);
    if (!plantId || !Number.isFinite(plantId)) {
      return new Response(JSON.stringify({ error: "plantId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verify the target is a global AI plant.
    const { data: plant, error: plantErr } = await supabase
      .from("plants")
      .select("id, source, home_id, common_name, scientific_name, care_guide_data, freshness_version, last_freshness_check_at")
      .eq("id", plantId)
      .maybeSingle();
    if (plantErr || !plant) {
      return new Response(JSON.stringify({ error: "plant_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (plant.source !== "ai" || plant.home_id !== null) {
      return new Response(JSON.stringify({ error: "not_a_global_ai_plant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Tier gate: caller profile must have ai_enabled = true.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("ai_enabled")
      .eq("uid", callerUserId)
      .maybeSingle();
    if (!profile?.ai_enabled) {
      return new Response(JSON.stringify({ error: "ai_tier_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Rate limit: at most one refresh per (user, plant) per 7 days.
    const cutoff = new Date(Date.now() - RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: rateErr } = await supabase
      .from("ai_plant_manual_refresh_log")
      .select("refreshed_at")
      .eq("user_id", callerUserId)
      .eq("plant_id", plantId)
      .gt("refreshed_at", cutoff)
      .limit(1);
    if (rateErr) {
      warn(FN, "rate-limit-check-failed", { error: rateErr.message });
      // Fail open — don't block a refresh because the log table glitched.
    } else if (recent && recent.length > 0) {
      const nextEligible = new Date(new Date(recent[0].refreshed_at).getTime() + RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000);
      return new Response(JSON.stringify({
        error: "rate_limited",
        retry_after: nextEligible.toISOString(),
      }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Generate via Gemini.
    const commonName = plant.common_name;
    const prompt = `Generate a comprehensive botanical care guide for "${commonName}". Return all fields accurately. STRICT formatting rules:
- flowering_season + harvest_season: only one or more of "Spring", "Summer", "Autumn", "Winter". Never months.
- pruning_month: only abbreviated month names ("Jan", "Feb", ... "Dec"). Never full names. Never seasons.`;
    const { text: rawText, usage } = await callGeminiCascade(
      apiKey, FN, toMessages([prompt]),
      { responseSchema: CARE_GUIDE_SCHEMA, temperature: 0.2, logContext: { plantId } },
    );
    let newData: any = JSON.parse(rawText);
    if (!newData.plantData) newData = { plantData: newData };

    // 5. Diff vs current.
    const diff = diffCareGuide(plant.care_guide_data, newData);
    const nowIso = new Date().toISOString();

    if (diff.changed) {
      const newVersion = (plant.freshness_version ?? 1) + 1;

      // Insert revision audit row first.
      await supabase.from("plant_care_revisions").insert({
        plant_id: plantId,
        version: newVersion,
        source: "manual_refresh",
        care_guide_data: newData,
        changed_fields: diff.fieldNames,
        diff_summary: diff.perField,
        triggered_by: callerUserId,
      });

      // Bump the plant row.
      const { error: updErr } = await supabase
        .from("plants")
        .update({
          care_guide_data: newData,
          updated_care_fields: diff.fieldNames,
          freshness_version: newVersion,
          last_freshness_check_at: nowIso,
          last_care_generated_at: nowIso,
        })
        .eq("id", plantId);
      if (updErr) throw new Error(`plants update failed: ${updErr.message}`);
    } else {
      // No changes — still reset the freshness clock.
      await supabase.from("plants").update({ last_freshness_check_at: nowIso }).eq("id", plantId);
    }

    // 6. Record the refresh attempt against the rate-limit log (regardless of
    //    whether anything changed — both spent a Gemini call).
    await supabase.from("ai_plant_manual_refresh_log").insert({
      user_id: callerUserId,
      plant_id: plantId,
      refreshed_at: nowIso,
    });

    // 7. Log AI usage against the user (their quota, not system).
    await logAiUsage(supabase, {
      homeId: null,
      userId: callerUserId,
      functionName: FN,
      action: "manual_refresh",
      usage,
    });

    log(FN, "result", {
      plantId,
      changed: diff.changed,
      changedFields: diff.fieldNames,
      newVersion: diff.changed ? (plant.freshness_version ?? 1) + 1 : plant.freshness_version,
    });

    return new Response(JSON.stringify({
      changed: diff.changed,
      changed_fields: diff.fieldNames,
      diff_summary: diff.perField,
      freshness_version: diff.changed ? (plant.freshness_version ?? 1) + 1 : plant.freshness_version,
      last_freshness_check_at: nowIso,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err, {});
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
