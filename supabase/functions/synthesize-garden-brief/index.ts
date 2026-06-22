/**
 * synthesize-garden-brief — drafts a Head Gardener "Garden Brief" (goals +
 * constraints) for the signed-in user's home from their quiz answers, stored
 * preferences, current plants, behaviour and climate.
 *
 * Returns a DRAFT for the user to confirm/edit — it never writes garden_brief
 * itself (the client upserts the row on confirm). Evergreen-gated via
 * tierAllowsInsights — mirrors FEATURE_GATES.head_gardener.
 *
 * See docs/plans/head-gardener-ai-manager.md.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { extractJsonObject } from "../_shared/extractJson.ts";
import { captureException } from "../_shared/sentry.ts";
import { log } from "../_shared/logger.ts";

const FN = "synthesize-garden-brief";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Enum vocabulary — keep in sync with src/constants/gardenBrief.ts.
const GOALS = [
  "grow_your_own", "year_round_colour", "attract_wildlife", "low_maintenance",
  "container_only", "family_safe", "calm_retreat", "privacy_screening",
];
const STYLES = ["cottage", "modern_minimal", "tropical", "mediterranean", "wild_natural", "kitchen_veg"];
const TIMES = ["under_1h", "1_3h", "3_7h", "7h_plus"];
const EXPERIENCE = ["beginner", "improving", "confident", "expert"];
const BUDGET = ["budget", "moderate", "premium"];

const SCHEMA = {
  type: "object",
  properties: {
    goals: { type: "array", items: { type: "string", enum: GOALS } },
    time_per_week: { type: "string", enum: TIMES },
    budget_tier: { type: "string", enum: BUDGET },
    experience_level: { type: "string", enum: EXPERIENCE },
    styles: { type: "array", items: { type: "string", enum: STYLES } },
    ai_summary: { type: "string" },
  },
  required: ["goals", "experience_level", "styles", "ai_summary"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    const { data: profile } = await db
      .from("user_profiles")
      .select("home_id, subscription_tier, persona")
      .eq("uid", userId)
      .maybeSingle();
    const homeId = (profile?.home_id as string | null) ?? null;
    const tier = (profile?.subscription_tier as string | null) ?? null;
    const persona = (profile?.persona ?? null) as Persona;

    if (!tierAllowsInsights(tier)) return json({ locked: true, draft: null });
    if (!homeId) return json({ locked: false, draft: null });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ locked: false, draft: null });

    const ctx = await buildUserContext(
      db as unknown as Parameters<typeof buildUserContext>[0],
      { userId, homeId },
    );
    const block = renderContextBlock(ctx, ["location", "garden", "preferences", "behaviour"]);

    const prompt =
      `${personaInstruction(persona)}\n\n${block}\n\n` +
      `You are this gardener's head gardener. From EVERYTHING above, draft their "Garden Brief" — ` +
      `the goals and constraints you'll manage their garden toward. Choose only from the allowed values:\n` +
      `- "goals": the 2-4 that genuinely fit (allowed: ${GOALS.join(", ")}).\n` +
      `- "styles": 1-3 they lean toward (allowed: ${STYLES.join(", ")}).\n` +
      `- "time_per_week": realistic weekly effort (allowed: ${TIMES.join(", ")}).\n` +
      `- "budget_tier": only if inferable, else omit (allowed: ${BUDGET.join(", ")}).\n` +
      `- "experience_level": (allowed: ${EXPERIENCE.join(", ")}).\n` +
      `- "ai_summary": 2-3 sentences, FIRST PERSON as their head gardener, summarising what they want ` +
      `from their garden and how you'll approach it. Warm and concrete; ground every choice in the context. ` +
      `Plain text, no markdown.\n\nReturn JSON matching the schema.`;

    const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
      systemPrompt: "You are Rhozly's head gardener drafting a personalised brief for THIS gardener. Be specific and grounded; never invent facts not supported by the context.",
      responseSchema: SCHEMA,
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 1024,
      logContext: { userId, homeId },
    });

    await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
      userId, homeId, functionName: FN, action: "synthesize_brief", usage,
      contextBlock: block, prompt, rawResult: text,
    });

    let parsed: Record<string, unknown> = {};
    try { parsed = (extractJsonObject(text) ?? {}) as Record<string, unknown>; } catch { /* keep empty → client falls back to manual */ }

    const draft = {
      goals: parsed.goals ?? [],
      styles: parsed.styles ?? [],
      time_per_week: parsed.time_per_week ?? null,
      budget_tier: parsed.budget_tier ?? null,
      experience_level: parsed.experience_level ?? null,
      ai_summary: parsed.ai_summary ?? null,
      derived_from: {
        source: "ai_synthesis",
        preferences: ctx.preferences.length,
        inventory: ctx.inventory.length,
        areas: ctx.areas.length,
      },
    };

    log(FN, "drafted", { userId, homeId, goals: (draft.goals as unknown[]).length });
    return json({ locked: false, draft, persona });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
