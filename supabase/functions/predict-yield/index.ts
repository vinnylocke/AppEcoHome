import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { buildYieldPrompt } from "../_shared/yieldPrompt.ts";
import { log, warn } from "../_shared/logger.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const FN = "predict-yield";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { instance_id, home_id } = await req.json();
    if (!instance_id || !home_id) {
      return new Response(
        JSON.stringify({ error: "instance_id and home_id are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const guardErr = await guardAiByHome(db, home_id);
    if (guardErr) return guardErr;

    const { data: ownerMember } = await db.from("home_members").select("user_id").eq("home_id", home_id).eq("role", "owner").limit(1).maybeSingle();
    const userId = ownerMember?.user_id ?? null;

    if (userId) {
      const rateLimitErr = await enforceRateLimit(db, userId, FN);
      if (rateLimitErr) return rateLimitErr;
    }

    // Fetch all context in parallel
    const [
      { data: item },
      { data: yieldRows },
      { data: snapshot },
    ] = await Promise.all([
      db
        .from("inventory_items")
        .select("plant_id, planted_at, expected_harvest_date, nickname")
        .eq("id", instance_id)
        .single(),
      db
        .from("yield_records")
        .select("value, unit, harvested_at")
        .eq("instance_id", instance_id)
        .order("harvested_at", { ascending: false })
        .limit(20),
      db
        .from("weather_snapshots")
        .select("data")
        .eq("home_id", home_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!item) {
      return new Response(
        JSON.stringify({ error: "Instance not found" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Fetch plant species
    const { data: plant } = await db
      .from("plants")
      .select("common_name, cycle, watering, care_level, sunlight")
      .eq("id", item.plant_id)
      .single();

    // Build weather summary string from snapshot if available
    let weatherSummary: string | null = null;
    if (snapshot?.data) {
      try {
        const daily: any[] = snapshot.data.daily ?? [];
        const next7 = daily.slice(0, 7);
        weatherSummary = next7
          .map(
            (d: any) =>
              `${d.date}: max ${d.maxTempC}°C, rain ${d.precipMm ?? 0}mm`,
          )
          .join("; ");
      } catch {
        // ignore malformed snapshot
      }
    }

    const prompt = buildYieldPrompt({
      commonName: plant?.common_name ?? item.nickname ?? "Unknown plant",
      plantedAt: item.planted_at ?? null,
      expectedHarvestDate: item.expected_harvest_date ?? null,
      cycle: plant?.cycle ?? null,
      watering: plant?.watering ?? null,
      careLevel: plant?.care_level ?? null,
      sunlight: Array.isArray(plant?.sunlight)
        ? plant.sunlight.join(", ")
        : (plant?.sunlight ?? null),
      pastYields: (yieldRows ?? []) as Array<{
        value: number;
        unit: string;
        harvested_at: string;
      }>,
      weatherSummary,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const { text: raw, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
      responseMimeType: "application/json",
    });

    // Strip markdown fences if present, then extract the JSON object
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Gemini occasionally wraps JSON in prose — extract the first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON object found in Gemini response");
      result = JSON.parse(match[0]);
    }

    await logAiUsage(db, { homeId: home_id, userId, functionName: FN, action: "yield_prediction", usage });
    log(FN, "prediction_complete", { instance_id, confidence: result.confidence });

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    warn(FN, "error", { message: err.message });
    return new Response(
      JSON.stringify({ error: "Internal error", detail: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
