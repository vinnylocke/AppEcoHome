/**
 * generate-pest-risk — AI-based pest/disease risk insights (gap-fill).
 *
 * The ailments table has no seasonality/temperature data, so risk is inferred by
 * Gemini: for an Evergreen home that tracks pests/diseases AND grows plants they
 * affect, it asks which are a RISING risk this month and what to do. Results land
 * in home_pest_insights (replaced each run) → the /insights feed.
 *
 * Weekly cron (no body → all homes that track pests) + on-demand { homeId } when
 * the user links an ailment to a plant. verify_jwt off (publishable-key callers).
 * See docs/plans/ai-insights-overhaul.md.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/supabaseClient.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";
import { captureException } from "../_shared/sentry.ts";
import { log, warn } from "../_shared/logger.ts";

const FN = "generate-pest-risk";

const PEST_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ailment: { type: "string" },
          plant: { type: "string" },
          body: { type: "string" },
          severity: { type: "integer" },
        },
        required: ["ailment", "body", "severity"],
      },
    },
  },
  required: ["insights"],
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  try {
    const db = serviceClient();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    let body: { homeId?: string } = {};
    try {
      body = await req.json();
    } catch { /* cron */ }

    let homeIds: string[];
    if (body.homeId) {
      homeIds = [body.homeId];
    } else {
      const { data } = await db.from("ailments").select("home_id").in("type", ["pest", "disease"]);
      homeIds = [...new Set((data ?? []).map((a) => a.home_id as string))];
    }
    if (homeIds.length === 0) return json({ homes: 0, insights: 0 });

    let written = 0;
    for (const homeId of homeIds) {
      try {
        // Evergreen gate + a persona for the wording (any entitled member).
        const { data: members } = await db.from("home_members").select("user_id").eq("home_id", homeId);
        const userIds = (members ?? []).map((m) => m.user_id as string);
        if (userIds.length === 0) continue;
        const { data: profs } = await db.from("user_profiles").select("subscription_tier, persona").in("uid", userIds);
        const entitled = (profs ?? []).find((p) => tierAllowsInsights(p.subscription_tier as string | null));
        if (!entitled) continue;
        const persona = (entitled.persona ?? null) as Persona;

        const [{ data: ailments }, { data: inv }] = await Promise.all([
          db.from("ailments").select("name, type, affected_plants").eq("home_id", homeId).in("type", ["pest", "disease"]),
          db.from("inventory_items").select("plant_name").eq("home_id", homeId).eq("status", "Planted"),
        ]);
        const plantNames = (inv ?? []).map((i) => ((i.plant_name as string) ?? "").toLowerCase()).filter(Boolean);

        // Only ailments that affect a plant the gardener is actually growing.
        const relevant = (ailments ?? [])
          .map((a) => {
            const affected = ((a.affected_plants as string[]) ?? []).map((x) => x.toLowerCase());
            const matched = [...new Set(plantNames.filter((pn) => affected.some((af) => af && (pn.includes(af) || af.includes(pn)))))];
            return { name: a.name as string, matched };
          })
          .filter((r) => r.matched.length > 0);

        if (relevant.length === 0 || !apiKey) {
          await db.from("home_pest_insights").delete().eq("home_id", homeId);
          continue;
        }

        const month = new Date().toLocaleDateString("en-GB", { month: "long" });
        const prompt =
          `${personaInstruction(persona)}\n\n` +
          `It is ${month}. The gardener tracks these pests/diseases and is growing plants they affect:\n` +
          relevant.map((r) => `- ${r.name} (affects: ${r.matched.join(", ")})`).join("\n") +
          `\n\nWhich are a RISING risk RIGHT NOW given the season? Return JSON { "insights": [...] } with 0-3 ` +
          `entries (only genuine current risks), each { ailment, plant (the affected plant), body (ONE sentence: ` +
          `the risk + what to do now), severity (1-3) }. If nothing is a notable current risk, return an empty array.`;

        const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
          systemPrompt: "You are Rhozly's garden assistant assessing seasonal pest/disease risk. Be conservative — only flag genuine current risks.",
          responseSchema: PEST_SCHEMA,
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens: 512,
          logContext: { homeId },
        });
        await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], { homeId, functionName: FN, action: "pest_risk", usage });

        let parsed: { insights?: Array<{ ailment?: string; plant?: string; body?: string; severity?: number }> } = {};
        try { parsed = JSON.parse(text); } catch { /* keep empty */ }
        const rows = (parsed.insights ?? [])
          .filter((i) => i.body)
          .slice(0, 3)
          .map((i) => ({
            home_id: homeId,
            ailment_name: i.ailment ?? null,
            body: i.body as string,
            severity: Math.min(3, Math.max(1, i.severity ?? 2)),
            generated_at: new Date().toISOString(),
          }));

        await db.from("home_pest_insights").delete().eq("home_id", homeId);
        if (rows.length) await db.from("home_pest_insights").insert(rows);
        written += rows.length;
      } catch (err) {
        warn(FN, "home_failed", { homeId, error: String(err) });
      }
    }

    log(FN, "complete", { homes: homeIds.length, insights: written });
    return json({ homes: homeIds.length, insights: written });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
