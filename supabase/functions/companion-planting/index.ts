import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";

const FN = "companion-planting";
const RAPIDAPI_HOST = "verdantly-gardening-api.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export interface CompanionPlant {
  id: string | null;
  name: string;
  scientificName?: string | null;
  reason?: string | null;
}

export interface CompanionPlantsResult {
  beneficial: CompanionPlant[];
  harmful: CompanionPlant[];
  neutral: CompanionPlant[];
}

// ─── Verdantly companion lookup ───────────────────────────────────────────────

async function fetchVerdantlyCompanions(
  verdantlyId: string,
  apiKey: string,
): Promise<CompanionPlantsResult> {
  const res = await fetch(
    `${BASE_URL}/v2/companion-planting/${encodeURIComponent(verdantlyId)}`,
    {
      headers: {
        "X-RapidAPI-Host": RAPIDAPI_HOST,
        "X-RapidAPI-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Verdantly companion API failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  // API may return data wrapped or unwrapped
  const raw = data?.data ?? data;

  const mapItem = (item: any): CompanionPlant => ({
    id: item.plantId ?? item.id ?? null,
    name: item.commonName ?? item.name ?? "Unknown",
    scientificName: item.scientificName ?? null,
    reason: item.description ?? item.reason ?? null,
  });

  return {
    beneficial: Array.isArray(raw.beneficial) ? raw.beneficial.map(mapItem) : [],
    harmful:    Array.isArray(raw.harmful)    ? raw.harmful.map(mapItem)    : [],
    neutral:    Array.isArray(raw.neutral)    ? raw.neutral.map(mapItem)    : [],
  };
}

// ─── AI companion generation ──────────────────────────────────────────────────

const COMPANION_SCHEMA = {
  type: "object",
  properties: {
    beneficial: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id:             { type: "string", nullable: true },
          name:           { type: "string" },
          scientificName: { type: "string", nullable: true },
          reason:         { type: "string", nullable: true },
        },
        required: ["name"],
      },
    },
    harmful: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id:             { type: "string", nullable: true },
          name:           { type: "string" },
          scientificName: { type: "string", nullable: true },
          reason:         { type: "string", nullable: true },
        },
        required: ["name"],
      },
    },
    neutral: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id:             { type: "string", nullable: true },
          name:           { type: "string" },
          scientificName: { type: "string", nullable: true },
          reason:         { type: "string", nullable: true },
        },
        required: ["name"],
      },
    },
  },
  required: ["beneficial", "harmful", "neutral"],
};

async function generateAiCompanions(
  plantName: string,
  geminiKey: string,
): Promise<CompanionPlantsResult> {
  const prompt = `You are a gardening expert. Provide companion planting information for "${plantName}".

Return a JSON object with three arrays:
- beneficial: plants that help ${plantName} grow better (pest deterrence, nitrogen fixing, pollinator attraction, shade provision, etc.)
- harmful: plants that inhibit ${plantName} or compete negatively with it
- neutral: plants that can coexist without significant positive or negative effects

For each plant include:
- name: common name
- scientificName: Latin name (or null if unsure)
- reason: brief explanation of the relationship (1–2 sentences; null for neutral plants)
- id: always null (you are an AI, not a database)

Include 5–10 beneficial plants, 3–6 harmful plants, and 3–6 neutral plants. Focus on commonly grown garden plants.`;

  const { text } = await callGeminiCascade(
    geminiKey,
    FN,
    toMessages([prompt]),
    {
      temperature: 0.3,
      // Generous ceiling: today's thinking models spend "thoughts" tokens
      // against this budget, and the prompt asks for 11–22 companions each
      // with a reason. At 1500 the JSON truncated and JSON.parse threw on
      // every model → persistent "failed to get companion data".
      maxOutputTokens: 8192,
      responseSchema: COMPANION_SCHEMA,
    },
  );

  const parsed = JSON.parse(text) as CompanionPlantsResult;

  // Ensure id is null for all AI results
  const nullId = (item: any): CompanionPlant => ({ ...item, id: null });
  return {
    beneficial: (parsed.beneficial ?? []).map(nullId),
    harmful:    (parsed.harmful    ?? []).map(nullId),
    neutral:    (parsed.neutral    ?? []).map(nullId),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey      = Deno.env.get("VERDANTLY_API_KEY");
  const geminiKey   = Deno.env.get("GEMINI_API_KEY") ?? "";

  const db = createClient(supabaseUrl, serviceKey);

  try {
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const rateLimitErr = await enforceRateLimit(db, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    const { source, verdantly_id, plant_name, ai_enabled } = await req.json();

    if (!plant_name?.trim()) {
      return new Response(JSON.stringify({ error: "plant_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verdantly plant ───────────────────────────────────────────────────────
    if (source === "verdantly" && verdantly_id) {
      if (!apiKey) throw new Error("Missing VERDANTLY_API_KEY");
      log(FN, "verdantly_lookup", { verdantly_id });
      const result = await fetchVerdantlyCompanions(verdantly_id, apiKey);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AI fallback (Perenual, ai, manual) ───────────────────────────────────
    if (ai_enabled) {
      log(FN, "ai_lookup", { plant_name, source });
      const result = await generateAiCompanions(plant_name, geminiKey);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── No AI access ──────────────────────────────────────────────────────────
    return new Response(JSON.stringify({ error: "ai_required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    logError(FN, "unhandled_error", err);
    captureException(err, { fn: FN });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
