// Planner — Garden Overhaul edge fn.
//
// Admin uploads a garden photo + describes likes/dislikes/wants;
// this fn runs:
//   1. Vision + blueprint pass (one Gemini Vision call using the
//      Pro cascade). Returns photo_analysis + blueprint +
//      concept_prompts[].
//   2. N parallel Imagen 4 calls — one per concept_prompts entry —
//      to generate "after" concept images. Each call uploads to
//      Supabase Storage + logs cost to ai_usage_log.
//   3. Inserts plans row (kind='overhaul') + plan_overhaul_inputs +
//      plan_overhaul_concepts rows.
//
// HTTP returns 202 with { plan_id } as soon as the row exists; the
// long-running work runs in EdgeRuntime.waitUntil. Client polls
// plan_overhaul_concepts to know when images have landed.
//
// Sage+ only via guardAiByHome + a hardcoded check on the resolved
// tier. Rate-limited via enforceRateLimit (tunable through
// system_rate_limit_overrides). All Gemini + Imagen cost logged to
// ai_usage_log so the audit page sees accurate per-call cost.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { guardAiByHome } from "../_shared/aiGuard.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import {
  callGeminiCascade,
  generateGeminiFlashImage,
  toMessages,
  VISION_DIAGNOSIS_MODELS,
} from "../_shared/gemini.ts";
import {
  estimateGeminiCostUsd,
  estimateImagenCostUsd,
} from "../_shared/geminiCost.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { buildGardenContext, type GardenContextSnapshot } from "../_shared/gardenContext.ts";

const FN = "generate-garden-overhaul";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CONCEPTS = 4;
const DEFAULT_CONCEPTS = 3;
// We use gemini-2.5-flash-image (not Imagen 4) so concepts are
// TRANSFORMATIONS of the user's actual photo rather than generic
// text-to-image mockups. The model accepts the photo as a reference
// input and produces images that retain the garden's existing
// structure (pathways, fencing, trees) while applying the
// requested aesthetic transformation. ~$0.039/image.
const CONCEPT_IMAGE_MODEL = "gemini-2.5-flash-image";

const OVERHAUL_SCHEMA = {
  type: "OBJECT",
  properties: {
    photo_analysis: {
      type: "OBJECT",
      properties: {
        current_conditions: { type: "STRING" },
        plants_visible:     { type: "ARRAY", items: { type: "STRING" } },
        layout_notes:       { type: "STRING" },
        problems_to_address: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["current_conditions", "layout_notes"],
    },
    blueprint: {
      type: "OBJECT",
      properties: {
        project_overview: {
          type: "OBJECT",
          properties: {
            title:       { type: "STRING" },
            summary:     { type: "STRING" },
            difficulty:  { type: "STRING" },
            maintenance: { type: "STRING" },
            timeline:    { type: "STRING" },
          },
          required: ["title", "summary"],
        },
        plant_list: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              common_name:     { type: "STRING" },
              scientific_name: { type: "STRING" },
              role:            { type: "STRING" },
              quantity:        { type: "NUMBER" },
              spacing_cm:      { type: "NUMBER" },
              notes:           { type: "STRING" },
            },
            required: ["common_name", "role"],
          },
        },
        maintenance_schedule: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              task:           { type: "STRING" },
              frequency:      { type: "STRING" },
              best_months:    { type: "ARRAY", items: { type: "STRING" } },
              detail:         { type: "STRING" },
            },
            required: ["task", "frequency"],
          },
        },
        prep_steps: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
      },
      required: ["project_overview", "plant_list"],
    },
    concept_prompts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          aesthetic: { type: "STRING" },
          prompt:    { type: "STRING" },
        },
        required: ["aesthetic", "prompt"],
      },
    },
  },
  required: ["photo_analysis", "blueprint", "concept_prompts"],
};

function buildOverhaulPrompt(input: {
  likes: string;
  dislikes: string;
  wants: string;
  aesthetic: string | null;
  conceptCount: number;
  gardenContextBlock: string;
  hasHighlights: boolean;
}): string {
  return `You are a senior landscape designer redesigning a real garden. The user has uploaded a photo of their CURRENT garden and described what they want changed.

═══════════════════════════════════════════════════════════════
USER INPUT:
═══════════════════════════════════════════════════════════════
What they LIKE about the garden:
${input.likes || "(not specified)"}

What they DISLIKE:
${input.dislikes || "(not specified)"}

What they WANT to add or change:
${input.wants || "(not specified)"}

Preferred aesthetic: ${input.aesthetic ?? "open to suggestions"}

═══════════════════════════════════════════════════════════════
GARDENER + GARDEN CONTEXT (verbatim from app data):
═══════════════════════════════════════════════════════════════
${input.gardenContextBlock || "(no context available)"}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Return JSON matching the schema with THREE sections:

1. \`photo_analysis\` — what you literally see in the photo:
   - current_conditions: visible state (overgrown, neglected, neat, hardscape vs planting, etc)
   - plants_visible: any plants you can identify from the photo
   - layout_notes: existing structure (pathways, beds, fencing, focal points)
   - problems_to_address: issues visible in the photo that the user might want to fix

2. \`blueprint\` — the redesign plan (same shape as our normal planner):
   - project_overview: title (e.g. "Modern Wildlife Garden"), summary, difficulty (Easy/Medium/Hard), maintenance level, realistic timeline
   - plant_list: 8-15 plants with role (focal / fill / ground cover / edible / climber), quantity, spacing_cm, brief notes. PRIORITISE plants that:
     • Match the user's climate, hardiness zone, hemisphere (from the context above)
     • Honour their likes/wants
     • Avoid what they dislike
     • Complement their existing plants (don't suggest duplicates of what's already there)
   - maintenance_schedule: 5-10 recurring tasks with frequency + best_months (use hemisphere-appropriate months) + detail
   - prep_steps: ordered list of preparation tasks before planting (clearing, soil prep, hardscape changes)

3. \`concept_prompts\` — exactly ${input.conceptCount} text prompts for a multimodal image-editing model that will RECEIVE THE ORIGINAL PHOTO as input and TRANSFORM it. Each prompt:
   - Has a distinct \`aesthetic\` label (e.g. "Modern minimalist", "Cottage abundance", "Wildlife haven", "Productive potager")
   - Is 1-3 sentences phrased AS AN EDIT INSTRUCTION on the existing photo. Start with "Transform this garden into…" or "Modify this scene to…" — NOT "A garden with…". The model already has the photo; the prompt describes what to CHANGE.
   - Explicitly tells the model to KEEP recognisable structural elements visible in the photo (existing pathways, fencing, walls, mature trees, the camera angle, lighting direction). The result should look like the SAME garden after a renovation — not a different garden.
   - Describes the new planting style, colour palette, and mood. Photorealistic, eye-level, natural daylight.${input.hasHighlights ? `
   - **MUST address the user's highlighted regions:** the photo has BRIGHT RED brush strokes painted over specific areas the user wants redesigned. Each concept prompt MUST tell the image model to: (a) focus the visible changes inside those red regions, (b) preserve the rest of the garden verbatim, AND (c) NOT render the red strokes themselves in the output — they are user annotations indicating intent, not part of the garden.` : ""}
   - Example: "Transform this garden into a wildlife haven. Keep the existing pathway and back fence. Replace the lawn with naturalistic meadow planting — cornflowers, ox-eye daisies, ornamental grasses. Add a small wildlife pond in the foreground. Photorealistic, eye-level garden photo, soft summer daylight."${input.hasHighlights ? `
   - Example with highlights: "Transform ONLY the areas marked in red on this photo. Inside the red regions: replace the lawn with a low-maintenance gravel garden interspersed with drought-tolerant perennials (lavender, sedum, fescue grasses). Leave every other part of the garden — pathways, fencing, mature trees — exactly as shown. Do not render the red brush strokes in the output; they are user annotations. Photorealistic, eye-level garden photo, soft summer daylight."` : ""}

CRITICAL:
- DO NOT recommend plants that won't survive the user's hardiness zone.
- DO NOT suggest things explicitly listed in their "dislikes".
- The concept prompts must produce IMAGES OF A TRANSFORMED GARDEN, not abstract art or schematics.
- If the user gave no preference info, default to a moderate wildlife-friendly cottage garden suitable for their climate.${input.hasHighlights ? `
- The photo has the user's bright red highlights baked in. The image model needs explicit instruction in EVERY concept prompt to (a) focus changes in the red regions, (b) preserve unmarked regions, and (c) not render the red strokes themselves.` : ""}`;
}

interface CandidateConcept {
  aesthetic: string;
  prompt: string;
  image_url: string | null;
  imagen_model: string;
  cost_usd: number;
  error: string | null;
}

/**
 * Long-running gather + Gemini + Imagen pipeline. Runs in
 * EdgeRuntime.waitUntil so the HTTP response returns immediately.
 */
async function backgroundGenerate(
  db: any,
  apiKey: string,
  planId: string,
  input: {
    homeId: string;
    userId: string;
    photoBase64: string;
    mimeType: string;
    /** Optional — the photo with the user's red highlight strokes
     *  baked in. When present, this is the image sent to gemini-
     *  2.5-flash-image as its reference (instead of the original)
     *  and the concept prompts are biased toward respecting the
     *  marked regions. */
    annotatedPhotoBase64: string | null;
    annotatedMimeType: string | null;
    likes: string;
    dislikes: string;
    wants: string;
    aesthetic: string | null;
    conceptCount: number;
    contextSnapshot: GardenContextSnapshot;
    contextBlock: string;
  },
): Promise<void> {
  try {
    log(FN, "background_start", { plan_id: planId, has_highlights: !!input.annotatedPhotoBase64 });

    // ── Step 1 — Gemini Vision + blueprint call ──────────────────
    const promptText = buildOverhaulPrompt({
      likes: input.likes,
      dislikes: input.dislikes,
      wants: input.wants,
      aesthetic: input.aesthetic,
      conceptCount: input.conceptCount,
      gardenContextBlock: input.contextBlock,
      hasHighlights: !!input.annotatedPhotoBase64,
    });

    // For the Vision pass: send the ORIGINAL photo (so the model can
    // see the clean garden without red overlays confusing its
    // plant identification + structural analysis).
    const { text: rawText, usage } = await callGeminiCascade(
      apiKey, FN,
      toMessages([
        promptText,
        { inlineData: { data: input.photoBase64, mimeType: input.mimeType } },
      ]),
      {
        responseSchema: OVERHAUL_SCHEMA,
        temperature: 0.5,
        maxOutputTokens: 8192,
        models: VISION_DIAGNOSIS_MODELS,
        logContext: { plan_id: planId },
      },
    );

    const visionCostUsd = estimateGeminiCostUsd(usage.model, {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      cachedContentTokenCount: usage.cachedContentTokenCount,
      thoughtsTokenCount: usage.thoughtsTokenCount,
    });
    await logAiUsage(db, {
      homeId: input.homeId,
      userId: input.userId,
      functionName: FN,
      action: "vision_blueprint",
      usage,
    });

    let parsed: {
      photo_analysis: any;
      blueprint: any;
      concept_prompts: Array<{ aesthetic: string; prompt: string }>;
    };
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new Error(`Vision response parse failed: ${(err as Error).message}`);
    }
    const conceptPrompts = Array.isArray(parsed.concept_prompts)
      ? parsed.concept_prompts.slice(0, input.conceptCount)
      : [];
    if (conceptPrompts.length === 0) {
      throw new Error("AI returned no concept prompts");
    }

    // Persist the blueprint onto the plan row so the result view
    // can render the project overview / plant list / maintenance.
    await db
      .from("plans")
      .update({
        ai_blueprint: parsed.blueprint,
        description: parsed.blueprint?.project_overview?.summary
          ?? input.wants
          ?? "Garden overhaul",
        name: parsed.blueprint?.project_overview?.title ?? "Garden Overhaul",
      })
      .eq("id", planId);

    const plantCount = Array.isArray(parsed.blueprint?.plant_list)
      ? parsed.blueprint.plant_list.length
      : 0;
    log(FN, "vision_succeeded", {
      plan_id: planId,
      vision_cost_usd: visionCostUsd,
      concept_count: conceptPrompts.length,
      plant_count: plantCount,
    });
    if (plantCount === 0) {
      // The schema asks for 8–15 plants. Gemini occasionally returns an
      // empty array anyway — when it does the user opens Phase 2 of
      // Plan Staging to a blank Shed. PlanStaging shows a guidance
      // empty-state in that case; we surface it loudly in logs so we
      // can spot the failure rate.
      warn(FN, "ai_returned_empty_plant_list", { plan_id: planId });
    }

    // ── Step 2 — N parallel image transformations ───────────────
    // gemini-2.5-flash-image accepts the user's photo as a
    // reference input and returns a transformed version. Concept
    // prompts (from Step 1) are written as edit instructions
    // rather than text-to-image prompts.
    //
    // When the user painted highlights in step 2 of the wizard, we
    // feed THAT image (with red strokes baked in) to the model so it
    // sees the visual guidance directly. The prompts include explicit
    // instructions to not render the strokes themselves in the output.
    const referencePhoto = input.annotatedPhotoBase64
      ? { base64: input.annotatedPhotoBase64, mimeType: input.annotatedMimeType ?? "image/jpeg" }
      : { base64: input.photoBase64, mimeType: input.mimeType };

    const conceptResults: CandidateConcept[] = await Promise.all(
      conceptPrompts.map(async (cp): Promise<CandidateConcept> => {
        try {
          const result = await generateGeminiFlashImage(
            apiKey,
            cp.prompt,
            referencePhoto,
            { timeoutMs: 60_000 },
          );
          // Upload to garden-overhaul-concepts bucket.
          const fileName = `${planId}/${crypto.randomUUID()}.png`;
          const binary = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
          const { error: uploadErr } = await db.storage
            .from("garden-overhaul-concepts")
            .upload(fileName, binary, {
              contentType: result.mimeType,
              cacheControl: "31536000",
              upsert: false,
            });
          if (uploadErr) {
            return {
              aesthetic: cp.aesthetic, prompt: cp.prompt, image_url: null,
              imagen_model: result.model, cost_usd: estimateImagenCostUsd(result.model, 1),
              error: `upload failed: ${uploadErr.message}`,
            };
          }
          const { data: pub } = db.storage
            .from("garden-overhaul-concepts")
            .getPublicUrl(fileName);
          return {
            aesthetic: cp.aesthetic,
            prompt: cp.prompt,
            image_url: pub.publicUrl,
            imagen_model: result.model,
            cost_usd: estimateImagenCostUsd(result.model, 1),
            error: null,
          };
        } catch (err) {
          return {
            aesthetic: cp.aesthetic,
            prompt: cp.prompt,
            image_url: null,
            imagen_model: CONCEPT_IMAGE_MODEL,
            cost_usd: 0,
            error: (err as Error).message,
          };
        }
      }),
    );

    // Log each Imagen call's cost individually so the audit page
    // sees them as discrete line items.
    for (const c of conceptResults) {
      if (c.error || !c.image_url) continue;
      await logAiUsage(db, {
        homeId: input.homeId,
        userId: input.userId,
        functionName: FN,
        action: `imagen:${c.aesthetic.toLowerCase().replace(/\s+/g, "_")}`,
        imageCount: 1,
        imageCostUsd: c.cost_usd,
        imagenModel: c.imagen_model,
      });
    }

    // Insert concept rows for the ones that succeeded.
    const successful = conceptResults.filter((c) => c.image_url && !c.error);
    if (successful.length > 0) {
      await db.from("plan_overhaul_concepts").insert(
        successful.map((c) => ({
          plan_id: planId,
          image_url: c.image_url,
          prompt: c.prompt,
          aesthetic: c.aesthetic,
          imagen_model: c.imagen_model,
          cost_usd: c.cost_usd,
        })),
      );
    }

    log(FN, "background_complete", {
      plan_id: planId,
      concepts_succeeded: successful.length,
      concepts_failed: conceptResults.length - successful.length,
      total_image_cost_usd: successful.reduce((s, c) => s + c.cost_usd, 0),
      total_vision_cost_usd: visionCostUsd,
    });

    // If every Imagen call failed, mark the plan failed so the UI
    // surfaces the issue clearly.
    if (successful.length === 0) {
      await db
        .from("plans")
        .update({
          status: "Failed",
          description: `Image generation failed: ${conceptResults[0]?.error ?? "unknown"}`,
        })
        .eq("id", planId);
    }
  } catch (err: any) {
    await captureException(FN, err);
    logError(FN, "background_failed", { plan_id: planId, error: err?.message });
    await db
      .from("plans")
      .update({
        status: "Failed",
        description: String(err?.message ?? "Overhaul generation failed").slice(0, 500),
      })
      .eq("id", planId);
  }
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
    const photoBase64: string | undefined = typeof body.photoBase64 === "string" ? body.photoBase64 : undefined;
    const mimeType: string = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    // Optional — when present, this is the user's photo with red
    // highlight strokes painted on top. Used as the image reference
    // for the Imagen step (replaces the original photo) so the model
    // sees the visual guidance directly.
    const annotatedPhotoBase64: string | null = typeof body.annotatedPhotoBase64 === "string"
      ? body.annotatedPhotoBase64
      : null;
    // Annotated images are always JPEG from the highlighter (it
    // composites to canvas.toDataURL("image/jpeg")). Don't trust the
    // client — hardcode the mime.
    const annotatedMimeType: string = "image/jpeg";
    const likes: string = typeof body.likes === "string" ? body.likes : "";
    const dislikes: string = typeof body.dislikes === "string" ? body.dislikes : "";
    const wants: string = typeof body.wants === "string" ? body.wants : "";
    const aesthetic: string | null = typeof body.aesthetic === "string" ? body.aesthetic : null;
    // When set, regenerate the existing plan in-place rather than
    // creating a new plan row. Used by the in-staging "Regenerate
    // with feedback" flow.
    const regeneratePlanId: string | null = typeof body.regeneratePlanId === "string"
      ? body.regeneratePlanId
      : null;
    const conceptCount = Math.max(
      1,
      Math.min(MAX_CONCEPTS, typeof body.conceptCount === "number" ? Math.floor(body.conceptCount) : DEFAULT_CONCEPTS),
    );

    if (!homeId) return jsonError("homeId is required", 400);
    if (!photoBase64) return jsonError("photoBase64 is required", 400);
    if (!likes.trim() && !dislikes.trim() && !wants.trim()) {
      return jsonError("At least one of likes / dislikes / wants is required", 400);
    }

    // Tier gate.
    const aiGuard = await guardAiByHome(db, homeId);
    if (aiGuard) return aiGuard;
    const { data: profile } = await db
      .from("user_profiles")
      .select("subscription_tier")
      .eq("uid", userId)
      .maybeSingle();
    const tier = (profile?.subscription_tier as string | null) ?? "sprout";
    if (tier !== "sage" && tier !== "evergreen") {
      return jsonError("Garden Overhaul is a Sage+ feature", 403);
    }

    // Rate limit (uses system_rate_limit_overrides table + TIER_LIMITS fallback).
    const rateLimitErr = await enforceRateLimit(db, userId, FN);
    if (rateLimitErr) return rateLimitErr;

    // ── Upload the original photo to private storage. ────────────
    const photoBytes = Uint8Array.from(atob(photoBase64), (c) => c.charCodeAt(0));
    const photoExt = mimeType.includes("png") ? "png" : "jpg";
    const photoPath = `${homeId}/${crypto.randomUUID()}.${photoExt}`;
    const { error: photoUploadErr } = await db.storage
      .from("garden-overhaul-photos")
      .upload(photoPath, photoBytes, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (photoUploadErr) throw new Error(`photo upload failed: ${photoUploadErr.message}`);
    // Signed URL good for 7 days — enough for the user to look back
    // at it from the result view; we don't need the photo public.
    const { data: signed } = await db.storage
      .from("garden-overhaul-photos")
      .createSignedUrl(photoPath, 60 * 60 * 24 * 7);
    const photoUrl = signed?.signedUrl ?? "";

    // ── Optionally upload the annotated photo too. ──────────────
    // We keep it separate so the result view can show the user's
    // markings while the "before" photo stays clean.
    let annotatedPhotoUrl: string | null = null;
    if (annotatedPhotoBase64) {
      try {
        const annotatedBytes = Uint8Array.from(atob(annotatedPhotoBase64), (c) => c.charCodeAt(0));
        const annotatedPath = `${homeId}/${crypto.randomUUID()}-annotated.jpg`;
        const { error: annotatedUploadErr } = await db.storage
          .from("garden-overhaul-photos")
          .upload(annotatedPath, annotatedBytes, {
            contentType: annotatedMimeType,
            cacheControl: "31536000",
            upsert: false,
          });
        if (!annotatedUploadErr) {
          const { data: annotatedSigned } = await db.storage
            .from("garden-overhaul-photos")
            .createSignedUrl(annotatedPath, 60 * 60 * 24 * 7);
          annotatedPhotoUrl = annotatedSigned?.signedUrl ?? null;
        } else {
          log(FN, "annotated_upload_failed", { error: annotatedUploadErr.message });
        }
      } catch (err) {
        log(FN, "annotated_upload_threw", { error: (err as Error).message });
      }
    }

    // ── Build garden context snapshot. ───────────────────────────
    const { block: contextBlock, snapshot: contextSnapshot } =
      await buildGardenContext(db, homeId);

    // ── Insert plans row + plan_overhaul_inputs row immediately
    //    so the UI sees the new plan appear right away. If
    //    regenerating, reuse the existing plan row (and overwrite
    //    its inputs row + wipe stale concepts) instead.
    let planId: string;
    if (regeneratePlanId) {
      // Verify the plan belongs to this home (auth + ownership check).
      const { data: existing } = await db
        .from("plans")
        .select("id, home_id, kind")
        .eq("id", regeneratePlanId)
        .maybeSingle();
      if (!existing || existing.home_id !== homeId || existing.kind !== "overhaul") {
        return jsonError("Plan not found or not an overhaul plan", 404);
      }
      planId = regeneratePlanId;

      await db.from("plans")
        .update({
          name: "Garden Overhaul (regenerating…)",
          description: "Re-analysing photo with your feedback…",
          status: "Draft",
          ai_blueprint: null,
          cover_image_url: null,
          staging_state: {},
        })
        .eq("id", planId);

      // Wipe stale concepts + replace inputs row.
      await db.from("plan_overhaul_concepts").delete().eq("plan_id", planId);
      await db.from("plan_overhaul_inputs").delete().eq("plan_id", planId);
      await db.from("plan_overhaul_inputs").insert({
        plan_id: planId,
        original_photo_url: photoUrl,
        annotated_photo_url: annotatedPhotoUrl,
        likes, dislikes, wants, aesthetic,
        context_used: contextSnapshot,
      });
      log(FN, "regenerate_received", { plan_id: planId, tier, concept_count: conceptCount, has_highlights: !!annotatedPhotoUrl });
    } else {
      const { data: planRow, error: planErr } = await db
        .from("plans")
        .insert({
          home_id: homeId,
          name: "Garden Overhaul (generating…)",
          description: "Analysing photo + drafting redesign…",
          status: "Draft",
          kind: "overhaul",
        })
        .select("id")
        .single();
      if (planErr || !planRow) throw planErr ?? new Error("Failed to insert plan");
      planId = planRow.id;

      await db.from("plan_overhaul_inputs").insert({
        plan_id: planId,
        original_photo_url: photoUrl,
        annotated_photo_url: annotatedPhotoUrl,
        likes, dislikes, wants, aesthetic,
        context_used: contextSnapshot,
      });

      log(FN, "submit_received", { plan_id: planId, tier, concept_count: conceptCount, has_highlights: !!annotatedPhotoUrl });
    }

    // ── Kick off background work. ────────────────────────────────
    // @ts-expect-error EdgeRuntime is only available at runtime.
    EdgeRuntime.waitUntil(backgroundGenerate(db, apiKey, planId, {
      homeId, userId,
      photoBase64, mimeType,
      annotatedPhotoBase64, annotatedMimeType: annotatedPhotoBase64 ? annotatedMimeType : null,
      likes, dislikes, wants, aesthetic,
      conceptCount,
      contextSnapshot, contextBlock,
    }));

    return new Response(JSON.stringify({
      plan_id: planId,
      status: "Draft",
      message: "Generating overhaul — analysing photo, drafting blueprint, generating concept images. Poll the plan + plan_overhaul_concepts rows.",
    }), {
      status: 202,
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
