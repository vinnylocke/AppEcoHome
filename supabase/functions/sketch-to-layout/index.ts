// Sketch → Layout edge fn.
//
// The user uploads/snaps a hand-drawn TOP-DOWN garden sketch. This fn:
//   1. Verifies the caller (requireAuth) is a member of the home
//      (requireHomeMembership) and that the home has AI (guardAiByHome) at
//      Sage+ tier — then rate-limits.
//   2. Stores the sketch in the private `garden-sketches` bucket (audit + the
//      wizard shows it under the shape overlay).
//   3. Runs ONE Gemini Vision call (Pro cascade) with DETECTION_SCHEMA and
//      hardens the result through validateDetection (normalized 0..1 geometry,
//      closed vocabulary).
//   4. Returns 200 { detection, sketch_url } synchronously — a single vision
//      pass, so no 202/waitUntil needed (that's only for the N-image overhaul).
//
// The WIZARD (not this fn) sets the real scale and writes garden_layouts +
// garden_shapes client-side, so RLS + the offline queue behave exactly like the
// editor's own insert path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import {
  callGeminiCascade,
  toMessages,
  VISION_DIAGNOSIS_MODELS,
} from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import {
  DETECTION_SCHEMA,
  validateDetection,
} from "../_shared/sketchDetection.ts";

const FN = "sketch-to-layout";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Signed-URL lifetime for the stored sketch. Long-lived so the editor can
// "re-open original" well after creation (the bucket stays private; access is
// only ever via this signed URL). ~1 year.
const SKETCH_URL_TTL_SEC = 60 * 60 * 24 * 365;

function buildDetectionPrompt(): string {
  return `You are reading a hand-drawn TOP-DOWN sketch of a garden. Identify each distinct region the gardener has drawn and classify it.

Return JSON matching the schema:
- garden_outline: the sketch's overall proportions. width_ratio and height_ratio describe the drawing's aspect (e.g. a landscape sketch might be width_ratio 1.0, height_ratio 0.7). These are RELATIVE only — never real measurements.
- shapes: one entry per distinct region you can identify.

For every shape:
- detected_kind: EXACTLY one of: raised_bed, planter_box, round_planter, oval_bed, l_shape_bed, greenhouse, shed, path, fence, wall, pond, tree, lawn, boundary, unknown. Use "unknown" when you cannot tell — do NOT guess a specific kind.
- geometry: NORMALIZED coordinates where (0,0) is the TOP-LEFT of the sketch and (1,1) is the BOTTOM-RIGHT. Pick the type that best fits the region:
    - "rect" — rectangular bed/structure: give x, y (top-left corner) and w, h (width, height), all 0..1.
    - "ellipse" — oval region: give x, y (top-left of its bounding box) and w, h.
    - "circle" — round region (round planter, pond, tree canopy): give cx, cy (centre) and r (radius), all 0..1.
    - "polygon" — irregular or L-shaped region: give points[] (3 or more) tracing the outline, each { x, y } 0..1.
- label_guess: any text written on or beside the region ("Bed 1", "shed", "veg"). null if none.
- confidence: 0..1 — how sure you are of the kind AND the geometry.

RULES:
- Do NOT invent real-world measurements. Only relative position and size (0..1).
- Return every distinct region, but do not double-count — one shape per region.
- Prefer "unknown" over a wrong guess.
- Ignore arrows, legends, and annotation text that aren't garden regions.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY env vars.");
    }
    const db = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const body = await req.json().catch(() => ({}));
    const homeId: string | undefined = typeof body.homeId === "string" ? body.homeId : undefined;
    const sketchBase64: string | undefined = typeof body.sketchBase64 === "string" ? body.sketchBase64 : undefined;
    const mimeType: string = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";

    if (!homeId) return jsonError("homeId is required", 400);
    if (!sketchBase64) return jsonError("sketchBase64 is required", 400);

    // ── Auth chain (order matters). ──────────────────────────────
    // 1. Caller must be a member of this home — guardAiByHome only checks the
    //    OWNER's tier, so without this a non-member could burn a paid call on
    //    someone else's home (bug-audit-2026-07-10 edge-auth family).
    const membershipErr = await requireHomeMembership(db, homeId, userId);
    if (membershipErr) return membershipErr;

    // 2. Home must have AI enabled (tier gate, fails closed).
    const aiGuard = await guardAiByHome(db, homeId);
    if (aiGuard) return aiGuard;

    // 3. Sage+ only (explicit — the vision call is Pro-cost).
    const { data: profile } = await db
      .from("user_profiles")
      .select("subscription_tier")
      .eq("uid", userId)
      .maybeSingle();
    const tier = (profile?.subscription_tier as string | null) ?? "sprout";
    if (tier !== "sage" && tier !== "evergreen") {
      return jsonError("Sketch to Layout is a Sage+ feature", 403);
    }

    // 4. Per-user hourly rate limit.
    const rateLimitErr = await enforceRateLimit(db, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    // ── Store the sketch (private bucket, signed URL back to the wizard). ──
    const sketchBytes = Uint8Array.from(atob(sketchBase64), (c) => c.charCodeAt(0));
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const sketchPath = `${homeId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await db.storage
      .from("garden-sketches")
      .upload(sketchPath, sketchBytes, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadErr) throw new Error(`sketch upload failed: ${uploadErr.message}`);
    const { data: signed } = await db.storage
      .from("garden-sketches")
      .createSignedUrl(sketchPath, SKETCH_URL_TTL_SEC);
    const sketchUrl = signed?.signedUrl ?? "";

    // ── One Gemini Vision detection pass. ────────────────────────
    const promptText = buildDetectionPrompt();
    const { text: rawText, usage } = await callGeminiCascade(
      apiKey, FN,
      toMessages([
        promptText,
        { inlineData: { data: sketchBase64, mimeType } },
      ]),
      {
        responseSchema: DETECTION_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 8192,
        models: VISION_DIAGNOSIS_MODELS,
      },
    );

    let parsed: unknown = null;
    let parseOk = true;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parseOk = false;
    }
    const detection = parseOk ? validateDetection(parsed) : null;

    await logAiUsage(db, {
      homeId,
      userId,
      functionName: FN,
      action: "sketch_detection",
      usage,
      prompt: promptText,
      rawResult: rawText,
      status: detection ? "ok" : "error",
      error: detection ? null : "detection unreadable",
    });

    log(FN, "detection_complete", {
      home_id: homeId,
      tier,
      shape_count: detection?.shapes.length ?? 0,
      readable: !!detection,
    });

    // 200 either way: on an unreadable sketch we still return the stored URL so
    // the wizard can show "we couldn't read that" and offer a blank layout. The
    // AI call was made + metered regardless.
    return new Response(JSON.stringify({
      detection,     // ValidatedDetection | null
      sketch_url: sketchUrl,
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "fatal", { error: err?.message });
    await captureException(FN, err);
    return jsonError(err?.message ?? "unknown", 500);
  }
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
