// parse-plant-list — Sage+ AI bulk-paste parser for The Shed.
//
// UX review 2026-06-15 item 4.1. Accepts a free-text paste of multiple
// plant descriptions and returns a candidate list the client can present
// for review. The user edits / removes rows before committing to a batch
// `saveToShed` per row. Strictly the "extraction" half — never touches
// the plants / inventory_items tables.
//
// Tier gating: Sage / Evergreen (`ai_enabled = true`). Sprout / Botanist
// get the client-side regex fallback in `src/lib/parsePlantList.ts`. The
// two return the same `ParsedPlant` shape so the review UI is identical.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";

const FN = "parse-plant-list";
const MAX_INPUT_CHARS = 8000;
const MAX_CANDIDATES = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PARSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    plants: {
      type: "ARRAY",
      description:
        "Between 0 and 60 candidate plant rows extracted from the user's text. Skip lines that don't look like plant entries.",
      items: {
        type: "OBJECT",
        properties: {
          common_name: {
            type: "STRING",
            description:
              "Plant common name (e.g. \"Tomato\", \"Pak Choi\", \"Rose\"). Required. The species, not the variety.",
          },
          variety: {
            type: "STRING",
            nullable: true,
            description:
              "Variety / cultivar name (e.g. \"Sungold\", \"Hidcote\", \"Munstead Wood\"). Null when not stated.",
          },
          quantity: {
            type: "INTEGER",
            nullable: true,
            description:
              "Number of plants the gardener wants. Extract from \"x3\", \"12 plants\", \"(4 pots)\", \"6 off\" etc. Null when not stated. Cap at 999.",
          },
          notes: {
            type: "STRING",
            nullable: true,
            description:
              "Any leftover text from the line — supplier, intent (\"hedging\"), colour mix, etc. Null when none.",
          },
        },
        required: ["common_name"],
      },
    },
  },
  required: ["plants"],
};

export interface ParsedPlant {
  common_name: string;
  variety: string | null;
  quantity: number | null;
  notes: string | null;
}

function safeText(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function safeQuantity(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > 999) return null;
  return Math.round(value);
}

function normalisePlants(raw: unknown): ParsedPlant[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { plants?: unknown }).plants;
  if (!Array.isArray(arr)) return [];
  const out: ParsedPlant[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const commonName = safeText(r.common_name, 120);
    if (!commonName) continue;
    out.push({
      common_name: commonName,
      variety: safeText(r.variety, 120),
      quantity: safeQuantity(r.quantity),
      notes: safeText(r.notes, 400),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { homeId, text } = await req.json();
    if (!homeId) throw new Error("homeId is required.");
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("text is required.");
    }
    if (text.length > MAX_INPUT_CHARS) {
      return new Response(
        JSON.stringify({
          error: `Paste too long (${text.length} chars, max ${MAX_INPUT_CHARS}). Split into smaller batches.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const memberErr = await requireHomeMembership(serviceDb, homeId, userId);
    if (memberErr) return memberErr;

    const guardErr = await guardAiByHome(supabase, homeId);
    if (guardErr) return guardErr;

    const rateLimitErr = await enforceRateLimit(supabase, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    log(FN, "request_received", {
      homeId,
      userId,
      text_length: text.length,
      line_count: text.split("\n").length,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `You are extracting plant entries from a gardener's free-text paste.

Each line is meant to describe ONE plant the gardener wants to add to their Shed (their plant catalogue). The format is loose — examples:

  "Tomato Sungold x3"
  "Lavender 'Hidcote' (12 plants, from RHS Wisley)"
  "Pak Choi"
  "Rose \\"Munstead Wood\\" x2"
  "Calendula - hedging, mixed colours"
  "6 off French Bean Cobra"

Return ONE row per plant you can confidently extract. Skip lines that look like headers, comments, section labels, or unrelated text.

For each row, fill ONLY the fields you can extract from the line itself. Use null for everything that isn't stated — DO NOT guess.

Field rules:
- common_name: the species (e.g. "Tomato", "Pak Choi", "Rose", "French Bean"). Required.
  * Treat compound names as one common_name: "Pak Choi", "Brussels Sprout", "Sweet Pea", "Swiss Chard", "Globe Artichoke" — these are species, not variety.
  * "Tomato Sungold" → common_name "Tomato", variety "Sungold". NOT "Tomato Sungold".
- variety: the cultivar / variety in quotes or after the species name. Null when the line only names the species.
- quantity: integer count. Recognise "x3", "3x", "12 plants", "(4 pots)", "6 off", "qty: 5". Null when no count is given. Cap at 999.
- notes: any leftover descriptive text from the line — supplier ("from RHS Wisley"), intent ("hedging"), colour ("mixed"), etc. Null when nothing extra.

OUTPUT: JSON only, matching the schema. No prose, no markdown.

THE PASTE:
${text}`;

    const { text: rawText, usage } = await callGeminiCascade(
      apiKey,
      FN,
      toMessages([prompt]),
      {
        responseSchema: PARSE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 4096,
        logContext: { text_length: text.length },
      },
    );

    await logAiUsage(supabase, {
      homeId,
      userId,
      functionName: FN,
      action: "parse",
      usage,
    });

    const parsed = JSON.parse(rawText);
    const plants = normalisePlants(parsed);

    log(FN, "result", {
      homeId,
      userId,
      candidate_count: plants.length,
    });

    return new Response(
      JSON.stringify({ plants }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
