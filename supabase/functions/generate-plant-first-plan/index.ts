/**
 * generate-plant-first-plan — the "plant-first" planner.
 *
 * The user picks a set of plants (from their Shed or by searching library / API /
 * AI). This function asks Gemini to ARRANGE those plants: how many areas to split
 * them across, which plants pair well together (companions), and the maintenance
 * tasks per group — honouring the chosen `areaMode` (existing areas only / existing
 * + new / all-new).
 *
 * Grounding (per product requirement): the FULL gardener context via
 * `buildUserContext` (location/season/climate, their areas + conditions, current
 * plants, quiz + swipe + chat preferences, behaviour, weather) PLUS their past AI
 * feedback (👍/👎 + comments) so it learns what they liked/disliked. The whole
 * context + prompt + raw result + cost are written to `ai_usage_log` via
 * `logAiUsage`.
 *
 * Sage+ (guardAiByUser) + rate-limited. Client inserts the resulting plan with
 * kind='plant-first'. See docs/plans/plant-first-planner.md.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { guardAiByUser } from "../_shared/aiGuard.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { buildUserContext, renderContextBlock, type ContextSection } from "../_shared/userContext.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { normalisePlantFirstBlueprint } from "../_shared/plantFirstBlueprint.ts";
import { extractPreferencesFromFeedback, savePreferences, ENTITY_TYPES } from "../_shared/preferences.ts";

const FN = "generate-plant-first-plan";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AreaMode = "existing" | "existing_plus_new" | "new";

interface SelectedPlant {
  name: string;
  scientific_name?: string | null;
  source?: string; // 'shed' | 'library' | 'api' | 'ai'
  inventory_item_id?: string | null;
}

const PFP_SCHEMA = {
  type: "OBJECT",
  properties: {
    project_overview: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        summary: { type: "STRING" },
        estimated_difficulty: { type: "STRING" },
      },
      required: ["title", "summary", "estimated_difficulty"],
    },
    areas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          area_name: { type: "STRING" },
          existing_area_id: { type: "STRING", nullable: true },
          is_new: { type: "BOOLEAN" },
          suggested_sunlight: { type: "STRING", nullable: true },
          suggested_medium: { type: "STRING", nullable: true },
          pairing_summary: { type: "STRING" },
          plants: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                common_name: { type: "STRING" },
                scientific_name: { type: "STRING", nullable: true },
                quantity: { type: "INTEGER" },
                role: { type: "STRING" },
                companion_note: { type: "STRING" },
              },
              required: ["common_name", "quantity", "role", "companion_note"],
            },
          },
          preparation_tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                task_index: { type: "INTEGER" },
                title: { type: "STRING" },
                description: { type: "STRING" },
                depends_on_index: { type: "INTEGER", nullable: true },
              },
              required: ["task_index", "title", "description"],
            },
          },
          maintenance_tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                frequency_days: { type: "INTEGER" },
                seasonality: { type: "STRING" },
              },
              required: ["title", "description", "frequency_days", "seasonality"],
            },
          },
        },
        required: ["area_name", "is_new", "pairing_summary", "plants", "preparation_tasks", "maintenance_tasks"],
      },
    },
  },
  required: ["project_overview", "areas"],
};

/** Recent 👍/👎 the user left on AI outputs — a learning signal for the plan. */
async function buildFeedbackBlock(
  // deno-lint-ignore no-explicit-any
  db: any,
  userId: string,
): Promise<string> {
  try {
    const { data } = await db
      .from("ai_feedback")
      .select("function_name, action, rating, comment, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as Array<{ function_name: string; action: string | null; rating: number; comment: string | null }>;
    if (rows.length === 0) return "";
    const fmt = (r: typeof rows[number]) =>
      `${r.function_name}${r.action ? `/${r.action}` : ""}${r.comment ? `: "${r.comment}"` : ""}`;
    const liked = rows.filter((r) => r.rating === 1);
    const disliked = rows.filter((r) => r.rating === -1);
    const lines = ["\nPAST AI FEEDBACK (learn from what they liked / disliked):"];
    if (liked.length) lines.push(`👍 Liked (${liked.length}): ${liked.slice(0, 8).map(fmt).join("; ")}`);
    if (disliked.length) lines.push(`👎 Disliked (${disliked.length}): ${disliked.slice(0, 8).map(fmt).join("; ")}`);
    return lines.length > 1 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

const AREA_MODE_RULES: Record<AreaMode, string> = {
  existing:
    "Assign EVERY plant group to one of the user's EXISTING areas listed above (set " +
    "`existing_area_id` to that area's id and `is_new` to false). Do NOT invent new areas. " +
    "Match each group to the area whose conditions (light/medium) suit those plants best.",
  existing_plus_new:
    "PREFER the user's existing areas where their conditions suit the plants (set " +
    "`existing_area_id` + `is_new`=false). Only propose a NEW area (`is_new`=true, " +
    "`existing_area_id`=null, with suggested_sunlight/medium) when none of the existing areas fit.",
  new:
    "Design ALL-NEW areas from scratch based purely on the plants' needs (every area " +
    "`is_new`=true, `existing_area_id`=null, with suggested_sunlight + suggested_medium). " +
    "Ignore the user's existing areas.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const homeId: string = body.homeId;
    const plants: SelectedPlant[] = Array.isArray(body.plants) ? body.plants : [];
    const notes: string = (body.notes ?? "").toString();
    const areaMode: AreaMode = ["existing", "existing_plus_new", "new"].includes(body.areaMode)
      ? body.areaMode
      : "existing_plus_new";
    // Regenerate-with-feedback (same pattern as the landscape planner).
    const isRegeneration: boolean = !!body.isRegeneration;
    const feedback: string = (body.feedback ?? "").toString();
    const previousBlueprint = body.previousBlueprint ?? null;

    if (!homeId || plants.length === 0) {
      return new Response(JSON.stringify({ error: "homeId and at least one plant are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const authToken = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser(authToken);
    const userId = user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceDb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const memberErr = await requireHomeMembership(serviceDb, homeId, userId);
    if (memberErr) return memberErr;
    const guardErr = await guardAiByUser(supabase, userId);
    if (guardErr) return guardErr;
    const rateErr = await enforceRateLimit(supabase, userId, FN);
    if (rateErr) return rateErr;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    // ── Full gardener context + feedback signals + persona ──
    const ctx = await buildUserContext(serviceDb, { userId, homeId });
    const sections: ContextSection[] = ["identity", "location", "garden", "preferences", "behaviour", "weather"];
    const contextBlock = renderContextBlock(ctx, sections);
    const feedbackBlock = await buildFeedbackBlock(serviceDb, userId);

    const { data: prof } = await serviceDb
      .from("user_profiles").select("persona").eq("uid", userId).maybeSingle();
    const persona = ((prof?.persona ?? null) as Persona);

    // Existing areas (with ids) — only meaningful when the mode can reuse them.
    const existingAreasBlock = areaMode !== "new" && ctx.areas.length > 0
      ? "USER'S EXISTING AREAS (assign by id where they fit):\n" +
        ctx.areas.map((a) =>
          `  - id=${a.id} | ${a.name} | ${a.isOutside ? "outdoor" : "indoor"} | ${a.growingMedium ?? "unknown medium"}${a.mediumPh ? ` | pH ${a.mediumPh}` : ""}`,
        ).join("\n")
      : "USER'S EXISTING AREAS: (not used in this mode)";

    // If they chose "existing" but have no areas, fall back to "new".
    const effectiveMode: AreaMode =
      areaMode === "existing" && ctx.areas.length === 0 ? "new" : areaMode;

    const plantsBlock = plants
      .map((p, i) =>
        `  ${i + 1}. ${p.name}${p.scientific_name ? ` (${p.scientific_name})` : ""}${p.source === "shed" ? " [already in their Shed]" : ""}`)
      .join("\n");

    const systemPrompt =
      `${personaInstruction(persona)}\n\n` +
      `You are Rhozly's planting designer. The gardener has CHOSEN a specific set of plants ` +
      `and wants you to arrange them into a practical plan. Use ALL of the gardener context ` +
      `below — their location/season/climate, current garden, stated likes/dislikes and past ` +
      `AI feedback — to make personalised, horticulturally-sound decisions.\n\n` +
      `${contextBlock}\n${feedbackBlock}\n\n${existingAreasBlock}\n\n` +
      `RULES:\n` +
      `1. Group the chosen plants into a sensible number of areas by their growing needs ` +
      `(light, medium, water) and how well they COMPANION together — keep beneficial ` +
      `companions together and separate antagonistic ones. Explain each grouping in ` +
      `\`pairing_summary\` and each plant's \`companion_note\`.\n` +
      `2. AREA MODE — ${AREA_MODE_RULES[effectiveMode]}\n` +
      `3. Respect their stated DISLIKES and what they reacted negatively to in past feedback.\n` +
      `4. \`preparation_tasks\` are one-off setup chores per area (sequential via ` +
      `\`depends_on_index\`); do NOT put planting itself here. \`maintenance_tasks\` are the ` +
      `recurring care chores for that group (watering, feeding, pruning) with frequency_days ` +
      `+ seasonality.\n` +
      `5. Only use the plants the user chose — do not add new species. Quantities should be ` +
      `realistic for a home garden.`;

    let promptText = "";
    if (isRegeneration && feedback) {
      promptText +=
        `URGENT REGENERATION: the user REJECTED your previous plan. Apply this feedback ` +
        `STRICTLY and override any conflicting earlier choices.\n\n` +
        `USER FEEDBACK: "${feedback}"\n\n` +
        (previousBlueprint
          ? `PREVIOUS REJECTED PLAN (do NOT repeat what they disliked):\n${JSON.stringify(previousBlueprint).slice(0, 4000)}\n\n`
          : "") +
        `----\n`;
    }
    promptText +=
      `Plan name idea / notes from the gardener: ${notes || "(none)"}\n\n` +
      `CHOSEN PLANTS to arrange:\n${plantsBlock}\n\n` +
      `Return the plan as JSON matching the schema: a project_overview and an \`areas\` array, ` +
      `each area with its plants (+ companion_note), pairing_summary, preparation_tasks and ` +
      `maintenance_tasks.`;

    log(FN, "request", { userId, homeId, plantCount: plants.length, areaMode: effectiveMode, isRegeneration });

    const { text: rawText, usage } = await callGeminiCascade(
      apiKey,
      FN,
      [{ role: "user", parts: [{ text: promptText }] }],
      { systemPrompt, temperature: 0.4, maxOutputTokens: 3000, responseSchema: PFP_SCHEMA },
    );

    const blueprint = normalisePlantFirstBlueprint(JSON.parse(rawText));

    await logAiUsage(serviceDb, {
      homeId,
      userId,
      functionName: FN,
      action: isRegeneration ? "regenerate_plant_first_plan" : "plant_first_plan",
      usage,
      contextBlock: `${contextBlock}\n${feedbackBlock}\n\n${existingAreasBlock}\n\nMode: ${effectiveMode}\nChosen plants:\n${plantsBlock}`,
      prompt: `${systemPrompt}\n\n${promptText}`,
      rawResult: rawText,
    });

    log(FN, "result", {
      title: blueprint.project_overview?.title,
      areaCount: blueprint.areas.length,
      plantCount: blueprint.areas.reduce((n, a) => n + a.plants.length, 0),
    });

    // Persist preferences mined from the rejection feedback (regeneration) or the
    // initial notes, so future plans + other AI reflect the user's evolving taste.
    const textToMine = isRegeneration ? feedback : notes;
    if (textToMine && textToMine.trim()) {
      try {
        const extracted = await extractPreferencesFromFeedback(apiKey, textToMine, FN);
        const valid = new Set<string>(ENTITY_TYPES);
        const rows = extracted
          .filter((p) => valid.has(p.entity_type) && (p.sentiment === "positive" || p.sentiment === "negative") && p.entity_name?.trim())
          .map((p) => ({
            home_id: homeId,
            user_id: userId,
            entity_type: p.entity_type,
            entity_name: p.entity_name.trim(),
            sentiment: p.sentiment,
            reason: p.reason?.trim() || null,
          }));
        const saved = await savePreferences(serviceDb, rows);
        if (saved > 0) log(FN, "preferences_saved", { count: saved });
      } catch (e) {
        warn(FN, "pref_persist_failed", { error: String(e) });
      }
    }

    // ── Cover image (best-effort, free via pollinations) ──
    let coverImageUrl =
      "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=800";
    try {
      const imagePrompt =
        `A beautiful planted garden: ${blueprint.project_overview?.title ?? "mixed planting"}. ` +
        `photorealistic, professional garden photography, lush, sunny day`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=600&height=400&nologo=true`;
      const imgRes = await fetch(url);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const fileName = `plan_${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await serviceDb.storage
          .from("guide-images")
          .upload(fileName, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
        if (!upErr) {
          const { data: pub } = serviceDb.storage.from("guide-images").getPublicUrl(fileName);
          let finalUrl = pub.publicUrl;
          if (finalUrl.includes("kong:8000")) finalUrl = finalUrl.replace("http://kong:8000", "http://127.0.0.1:54321");
          coverImageUrl = finalUrl;
        }
      }
    } catch (imgErr) {
      warn(FN, "cover_image_failed", { error: String(imgErr) });
    }

    return new Response(JSON.stringify({ blueprint, cover_image_url: coverImageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logError(FN, "error", { error: (error as Error).message });
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
