import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { fetchAreaRotationBlock } from "../_shared/rotationContext.ts";
import { luxBandLabel } from "../_shared/luxBand.ts";
import {
  buildSuggestPrompt,
  SUGGEST_RESPONSE_SCHEMA,
  SUGGEST_SYSTEM_PROMPT,
} from "./prompt.ts";

const FN = "suggest-rotation-plants";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { areaId, homeId } = await req.json();
    if (!areaId || typeof areaId !== "string") {
      throw new Error("areaId is required");
    }
    if (!homeId || typeof homeId !== "string") {
      throw new Error("homeId is required");
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

    log(FN, "request_received", { areaId, homeId });

    // Pull the area context + rotation block + owned plants in parallel.
    const [areaRes, homeRes, rotationBlock, inventoryRes] = await Promise.all([
      supabase
        .from("areas")
        .select("name, light_intensity_lux, growing_medium, medium_ph, water_movement")
        .eq("id", areaId)
        .maybeSingle(),
      supabase
        .from("homes")
        .select("lat, country")
        .eq("id", homeId)
        .maybeSingle(),
      fetchAreaRotationBlock(supabase, homeId, areaId),
      supabase
        .from("inventory_items")
        .select("plant_name")
        .eq("home_id", homeId),
    ]);

    if (areaRes.error || !areaRes.data) {
      throw new Error("Area not found or inaccessible");
    }

    const area = areaRes.data;
    const home = homeRes?.data ?? null;
    const ownedPlants = Array.from(
      new Set(((inventoryRes?.data ?? []) as any[]).map((r) => r.plant_name).filter(Boolean)),
    );

    const userPrompt = buildSuggestPrompt({
      areaName: area.name ?? "this area",
      hemisphere: home?.lat != null ? (home.lat >= 0 ? "Northern" : "Southern") : null,
      locationHint: home?.country ?? null,
      areaContext: {
        sunlight: luxBandLabel(area.light_intensity_lux),
        soil: area.growing_medium ?? null,
        ph: area.medium_ph ?? null,
        waterMovement: area.water_movement ?? null,
      },
      rotation: rotationBlock,
      ownedPlants,
    });

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: userPrompt }] }],
      {
        systemPrompt: SUGGEST_SYSTEM_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 4000,
        responseSchema: SUGGEST_RESPONSE_SCHEMA,
      },
    );

    const parsed = JSON.parse(rawText) as {
      suggestions: Array<Record<string, unknown>>;
    };

    await logAiUsage(serviceDb, {
      userId,
      functionName: FN,
      action: "suggest_rotation_plants",
      usage,
      contextBlock: userPrompt,
      prompt: userPrompt,
      rawResult: rawText,
    });

    log(FN, "result", {
      areaId,
      suggestion_count: parsed.suggestions?.length ?? 0,
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
        suggestions: [],
        error: err.message ?? "Couldn't generate suggestions.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
