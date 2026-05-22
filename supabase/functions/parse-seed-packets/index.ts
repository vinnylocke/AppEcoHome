// parse-seed-packets — Sage+ AI bulk-paste parser for The Nursery.
//
// Accepts a free-text paste of multiple packet descriptions and returns a
// candidate list the client can present for review. The user edits /
// removes rows before committing to a batch insert. This function is
// strictly the "extraction" half — it doesn't touch the database.
//
// Tier gating: Sage / Evergreen. Sprout / Botanist get the client-side
// regex fallback in `src/lib/parseSeedPackets.ts`. The two return the
// same `ParsedSeedPacket` shape so the review UI is identical.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";

const FN = "parse-seed-packets";
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
    packets: {
      type: "ARRAY",
      description:
        "Between 0 and 60 candidate packet rows extracted from the user's text. Skip lines that don't look like seed packets.",
      items: {
        type: "OBJECT",
        properties: {
          common_name: {
            type: "STRING",
            description:
              "Plant common name (e.g. \"Tomato\", \"Sunflower\"). Required.",
          },
          variety: {
            type: "STRING",
            nullable: true,
            description:
              "Variety / cultivar name (e.g. \"Sungold\", \"Russian Giant\"). Null when not stated.",
          },
          vendor: {
            type: "STRING",
            nullable: true,
            description:
              "Vendor or source (e.g. \"Suttons\", \"Real Seeds\", \"Free from neighbour\"). Null when not stated.",
          },
          purchased_on: {
            type: "STRING",
            nullable: true,
            description:
              "Purchase date as ISO YYYY-MM-DD. When only a month/year is given, use the first of the month. Null when not stated.",
          },
          opened_on: {
            type: "STRING",
            nullable: true,
            description:
              "When the packet was opened, ISO YYYY-MM-DD. Null when not stated.",
          },
          sow_by: {
            type: "STRING",
            nullable: true,
            description:
              "Sow-by date, ISO YYYY-MM-DD. When only a month/year is given, use the LAST day of that month so the packet is treated as good through the whole month. Null when not stated.",
          },
          quantity_remaining: {
            type: "STRING",
            nullable: true,
            description:
              "Free-text quantity hint (e.g. \"~30 seeds\", \"half a packet\"). Null when not stated.",
          },
          notes: {
            type: "STRING",
            nullable: true,
            description: "Any other text the user included for this packet. Null when none.",
          },
        },
        required: ["common_name"],
      },
    },
  },
  required: ["packets"],
};

export interface ParsedSeedPacket {
  common_name: string;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!ISO_DATE_RE.test(value)) return null;
  // Reject obvious garbage years.
  const y = Number(value.slice(0, 4));
  if (!Number.isFinite(y) || y < 1980 || y > 2100) return null;
  return value;
}

function safeText(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalisePackets(raw: unknown): ParsedSeedPacket[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { packets?: unknown }).packets;
  if (!Array.isArray(arr)) return [];
  const out: ParsedSeedPacket[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const commonName = safeText(r.common_name, 120);
    if (!commonName) continue;
    out.push({
      common_name: commonName,
      variety: safeText(r.variety, 120),
      vendor: safeText(r.vendor, 120),
      purchased_on: safeIso(r.purchased_on),
      opened_on: safeIso(r.opened_on),
      sow_by: safeIso(r.sow_by),
      quantity_remaining: safeText(r.quantity_remaining, 80),
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

    const today = new Date().toISOString().split("T")[0];

    const prompt = `You are extracting seed packet records from a gardener's free-text paste.

Today's date: ${today}.

Each line in the paste is meant to describe ONE seed packet. The format is loose — examples:

  "Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)"
  "Sunflower Russian Giant - Sainsbury's, opened May 2024"
  "Beetroot 'Boltardy' / Real Seeds / sow by Dec 2027 / opened Mar 2025"
  "30 x Pak Choi seeds from neighbour"

Return ONE row per packet you can confidently extract. Skip lines that look like headers, comments, or unrelated text.

For each row, fill ONLY the fields you can extract from the line itself. Use null for everything that isn't stated — DO NOT guess.

Field rules:
- common_name: the plant species name (e.g. "Tomato", "Pak Choi"). Required. If the line just says "Sungold tomato", common_name is "Tomato".
- variety: the cultivar / variety in quotes or after the species name. Null when the line only names the species.
- vendor: brand / seller / source. "Free from neighbour" or "Allotment swap" count as vendors.
- purchased_on / opened_on / sow_by: ISO YYYY-MM-DD. When a month-year is given (e.g. "May 2024"):
  * purchased_on, opened_on → first day of the month (2024-05-01)
  * sow_by → last day of the month (2024-05-31) so the packet is good through the whole month.
  When a year-only is given for sow_by, use Dec 31 of that year.
- quantity_remaining: any free-text hint about how many seeds remain ("~30 seeds", "half a packet", "30 seeds"). Null when absent.
- notes: any leftover descriptive text from the line that doesn't fit the other fields. Null when nothing extra.

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
    const packets = normalisePackets(parsed);

    log(FN, "result", {
      homeId,
      userId,
      candidate_count: packets.length,
    });

    return new Response(
      JSON.stringify({ packets }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return new Response(JSON.stringify({ error: message, packets: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
