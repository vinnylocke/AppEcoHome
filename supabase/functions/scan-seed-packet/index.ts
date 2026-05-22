// scan-seed-packet — Sage+ Gemini Vision OCR for The Nursery.
//
// Accepts one (or two — front + back) packet photos, returns a
// `ParsedSeedPacket`-shaped object plus a confidence signal. The client
// pre-fills its review form with whatever was extracted; the user edits
// anything off, then saves through the normal `createSeedPacket` path.
//
// Defensive normalisation in `_shared/scanSeedPacket.ts` rejects garbage
// dates, trims strings to safe lengths, and downgrades confidence when
// the packet object is malformed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import {
  SCAN_PACKET_SCHEMA,
  buildScanPrompt,
  normaliseScanResult,
} from "../_shared/scanSeedPacket.ts";

const FN = "scan-seed-packet";
const MAX_BASE64_CHARS = 2_500_000; // ~1.8 MB raw image — well above the 800px @ 70% JPEG client compression target

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripDataUrl(b64: unknown): string | null {
  if (typeof b64 !== "string" || !b64.trim()) return null;
  return b64.replace(/^data:[^;]+;base64,/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      homeId,
      imageBase64,
      mimeType,
      extraImageBase64,
      extraMimeType,
    } = body ?? {};

    if (!homeId) throw new Error("homeId is required.");
    const raw = stripDataUrl(imageBase64);
    if (!raw) throw new Error("imageBase64 is required.");
    if (raw.length > MAX_BASE64_CHARS) {
      return new Response(
        JSON.stringify({
          error: `Image too large (${raw.length} chars, max ${MAX_BASE64_CHARS}). Compress to ~800px wide JPEG first.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const rawExtra = stripDataUrl(extraImageBase64);

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
      base64_chars: raw.length,
      has_extra_image: !!rawExtra,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = buildScanPrompt();
    const primaryMime = (mimeType as string | undefined) ?? "image/jpeg";

    // Single user message with the prompt text + one or two image parts.
    // Gemini accepts multiple inlineData parts in the same content.
    const parts: Array<Record<string, unknown>> = [
      { text: prompt },
      { inlineData: { data: raw, mimeType: primaryMime } },
    ];
    if (rawExtra) {
      const extraMime = (extraMimeType as string | undefined) ?? "image/jpeg";
      parts.push({ inlineData: { data: rawExtra, mimeType: extraMime } });
    }

    const messages: Array<{ role: "user"; parts: Array<Record<string, unknown>> }> = [
      { role: "user", parts },
    ];

    const { text: rawText, usage } = await callGeminiCascade(
      apiKey,
      FN,
      messages,
      {
        responseSchema: SCAN_PACKET_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 1024,
        logContext: { base64_chars: raw.length },
      },
    );

    await logAiUsage(supabase, {
      homeId,
      userId,
      functionName: FN,
      action: "scan",
      usage,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
    const result = normaliseScanResult(parsed);

    log(FN, "result", {
      homeId,
      userId,
      confidence: result.confidence,
      unreadable: !!result.unreadable,
      has_packet: !!result.packet,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return new Response(
      JSON.stringify({ error: message, packet: null, confidence: "low", unreadable: true }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
