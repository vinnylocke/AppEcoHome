/**
 * insights-feed — the unified AI Insights page backend (Parts 4 + 5).
 *
 * Aggregates every stored insight source for the signed-in user/home into one
 * normalized, ranked feed, and returns a persona-aware AI summary of the lot
 * (cached by content hash). Evergreen-gated (the whole insights experience) via
 * tierAllowsInsights — mirrors FEATURE_GATES.ai_insights.
 *
 * See docs/plans/ai-insights-overhaul.md.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";
import { aggregateInsights } from "../_shared/insightSources.ts";
import { captureException } from "../_shared/sentry.ts";
import { log } from "../_shared/logger.ts";

const FN = "insights-feed";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    if (!tierAllowsInsights(tier)) return json({ locked: true, summary: null, insights: [] });

    const insights = await aggregateInsights(
      db as unknown as Parameters<typeof aggregateInsights>[0],
      userId,
      homeId,
    );

    // ── Persona-aware AI summary, cached by the insight-set hash ──
    // The version prefix invalidates summaries cached before the multi-part /
    // token-cap fix (those were truncated); bump it whenever the summary
    // generation changes so stale cached text regenerates once.
    const SUMMARY_CACHE_VERSION = "v2";
    let summary: string | null = null;
    if (insights.length > 0) {
      const basedOn = `${SUMMARY_CACHE_VERSION}|` + insights.map((i) => i.id).sort().join("|");
      const { data: cached } = await db
        .from("ai_insight_summaries")
        .select("summary, based_on")
        .eq("user_id", userId)
        .maybeSingle();
      if (cached && cached.based_on === basedOn) {
        summary = cached.summary as string;
      } else {
        try {
          const prompt =
            `${personaInstruction(persona)}\n\n` +
            "Give a 2-3 sentence overview of the gardener's current insights below — lead with what most " +
            "needs attention, group naturally, stay warm and concrete. Plain text, no markdown.\n\nInsights:\n" +
            insights.slice(0, 12).map((i, n) => `${n + 1}. [${i.category}] ${i.title}: ${i.body}`).join("\n");
          const { text, usage } = await callGeminiCascade(Deno.env.get("GEMINI_API_KEY")!, FN, toMessages([prompt]), {
            systemPrompt: "You are Rhozly's garden assistant writing a quick overview of a gardener's insights.",
            temperature: 0.4,
            maxOutputTokens: 1024,
            logContext: { userId, homeId },
          });
          summary = text.trim();
          await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
            userId, homeId, functionName: FN, action: "insights_summary", usage,
            contextBlock: insights.slice(0, 12).map((i, n) => `${n + 1}. [${i.category}] ${i.title}: ${i.body}`).join("\n"),
            prompt,
            rawResult: text,
          });
          await db.from("ai_insight_summaries").upsert({
            user_id: userId, home_id: homeId, summary, based_on: basedOn, persona, generated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        } catch (_err) {
          // Summary stays null; the feed still returns.
        }
      }
    }

    log(FN, "feed", { userId, count: insights.length, summarised: !!summary });
    return json({ locked: false, summary, insights, persona });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
