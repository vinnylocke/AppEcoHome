import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import {
  buildAnalysisPrompt,
  ANALYSIS_RESPONSE_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  type AnalysisContext,
} from "./prompt.ts";

const FN = "analyse-plant-end-of-life";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { instance_id } = await req.json();
    if (!instance_id || typeof instance_id !== "string") {
      throw new Error("instance_id is required");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = user?.id ?? null;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const guardErr = await guardAiByUser(supabase, userId);
    if (guardErr) return guardErr;
    const rateErr = await enforceRateLimit(serviceDb, userId, FN);
    if (rateErr) return rateErr;

    log(FN, "request_received", { instance_id });

    // Gather all context we know about the instance via RLS-scoped supabase
    // (so we never read another user's home's data).
    const { data: instance, error: instanceErr } = await supabase
      .from("inventory_items")
      .select(
        "id, home_id, plant_name, nickname, identifier, plant_id, area_id, location_id, planted_at, ended_at, end_summary, created_at",
      )
      .eq("id", instance_id)
      .maybeSingle();
    if (instanceErr || !instance) {
      throw new Error("Instance not found or inaccessible.");
    }

    // Days alive — from planted_at when present, else from created_at.
    const startDate =
      (instance.planted_at && new Date(instance.planted_at)) ||
      new Date(instance.created_at);
    const endDate = instance.ended_at ? new Date(instance.ended_at) : new Date();
    const daysAlive =
      Math.max(
        0,
        Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );

    // Journal entries for this instance — oldest first so the prompt reads
    // chronologically.
    const { data: journalRows } = await supabase
      .from("plant_journals")
      .select("subject, description, created_at")
      .eq("inventory_item_id", instance_id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Tasks tied to this instance.
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("title, type, status, due_date, completed_at")
      .contains("inventory_item_ids", [instance_id])
      .order("due_date", { ascending: false })
      .limit(50);

    // Linked ailments via the plant_instance_ailments junction table.
    const { data: ailmentLinks } = await supabase
      .from("plant_instance_ailments")
      .select("linked_at, ailments(name, type)")
      .eq("plant_instance_id", instance_id)
      .limit(20);
    const ailments = (ailmentLinks ?? []).map((l: any) => ({
      name: l.ailments?.name ?? "Unknown",
      type: l.ailments?.type ?? null,
      linked_at: l.linked_at ?? null,
    }));

    // Area context — uses the real area columns (light_intensity_lux,
    // medium_ph, growing_medium, water_movement).
    let areaName: string | null = null;
    let areaContext: AnalysisContext["areaContext"] = {};
    if (instance.area_id) {
      const { data: areaRow } = await supabase
        .from("areas")
        .select("name, light_intensity_lux, medium_ph, growing_medium, water_movement")
        .eq("id", instance.area_id)
        .maybeSingle();
      if (areaRow) {
        areaName = areaRow.name ?? null;
        areaContext = {
          lux: (areaRow as any).light_intensity_lux ?? null,
          ph: (areaRow as any).medium_ph ?? null,
          soil: (areaRow as any).growing_medium ?? null,
          waterMovement: (areaRow as any).water_movement ?? null,
        };
      }
    }

    let locationContext: AnalysisContext["locationContext"] = {};
    if (instance.location_id) {
      const { data: locRow } = await supabase
        .from("locations")
        .select("placement")
        .eq("id", instance.location_id)
        .maybeSingle();
      if (locRow) {
        locationContext = { placement: locRow.placement ?? null };
      }
    }
    // Postcode lives on `homes`, not `locations`.
    if (instance.home_id) {
      const { data: homeRow } = await supabase
        .from("homes")
        .select("postcode")
        .eq("id", instance.home_id)
        .maybeSingle();
      if (homeRow?.postcode) {
        locationContext = { ...locationContext, postcode: homeRow.postcode };
      }
    }

    // Recent weather summary — `weather_snapshots` stores a single jsonb
    // blob per home; surface it raw if it's recent.
    let weatherSummary: string | null = null;
    const { data: weatherRow } = await supabase
      .from("weather_snapshots")
      .select("data, updated_at")
      .eq("home_id", instance.home_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (weatherRow) {
      const updated = new Date(weatherRow.updated_at);
      const ageHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24 * 14) {
        const compact = JSON.stringify(weatherRow.data).slice(0, 800);
        weatherSummary = `Snapshot from ${updated.toISOString().slice(0, 10)}: ${compact}`;
      }
    }

    const ctx: AnalysisContext = {
      plantName:
        instance.nickname ||
        instance.identifier ||
        instance.plant_name ||
        "this plant",
      daysAlive,
      endSummary: instance.end_summary ?? null,
      areaName,
      areaContext,
      locationContext,
      journalEntries: (journalRows ?? []).map((r: any) => ({
        subject: r.subject,
        description: r.description ?? null,
        created_at: r.created_at,
      })),
      tasks: (taskRows ?? []).map((r: any) => ({
        title: r.title,
        type: r.type,
        status: r.status,
        due_date: r.due_date ?? null,
        completed_at: r.completed_at ?? null,
      })),
      ailments,
      weatherSummary,
    };

    const userPrompt = buildAnalysisPrompt(ctx);
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: userPrompt }] }],
      {
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        temperature: 0.4,
        maxOutputTokens: 1500,
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
      },
    );

    const parsed = JSON.parse(rawText) as {
      likely_causes: string[];
      prevention_next_time: string[];
      affirmation: string;
    };

    // Persist the analysis as a closing journal entry so it stays with the
    // instance forever (visible from both the instance modal + global journal).
    await serviceDb.from("plant_journals").insert({
      home_id: instance.home_id,
      inventory_item_id: instance.id,
      subject: "Lifecycle analysis",
      description: JSON.stringify(parsed, null, 2),
    });

    await logAiUsage(serviceDb, {
      userId,
      functionName: FN,
      action: "end_of_life_analysis",
      usage,
    });

    log(FN, "result", {
      instance_id,
      causes: parsed.likely_causes?.length ?? 0,
      prevention: parsed.prevention_next_time?.length ?? 0,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({
        likely_causes: [
          "We couldn't complete the analysis automatically — your plant's records are still safe in the global journal.",
        ],
        prevention_next_time: [
          "Try opening this plant in the global journal to review the full history and spot patterns yourself.",
        ],
        affirmation:
          "Every plant teaches us something — the records you kept are still here when you're ready to revisit them.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
