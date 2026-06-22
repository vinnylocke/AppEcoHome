/**
 * head-gardener-chat — "Ask your Head Gardener": a grounded conversation about the
 * whole garden.
 *
 * Grounds every reply in the Garden Brief, the latest Estate Report, the full
 * gardener context and the open continuity log, speaking in the manager's voice.
 * Read/advise-only for now (action tools land in a follow-up). Captures any
 * like/dislike the gardener expresses into planner_preferences so the manager keeps
 * learning. Evergreen-gated via tierAllowsInsights — mirrors FEATURE_GATES.head_gardener.
 *
 * See docs/plans/head-gardener-ai-manager.md.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/requireAuth.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { loadPreferences, savePreferences, type PreferenceRow } from "../_shared/preferences.ts";
import { captureException } from "../_shared/sentry.ts";
import { log } from "../_shared/logger.ts";

const FN = "head-gardener-chat";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    detected_preferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity_type: { type: "string" },
          entity_name: { type: "string" },
          sentiment: { type: "string", enum: ["positive", "negative"] },
          reason: { type: "string" },
        },
        required: ["entity_type", "entity_name", "sentiment"],
      },
    },
  },
  required: ["reply"],
};

interface ChatMessage { role: "user" | "assistant"; content: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authResult = await requireAuth(req, db);
    if (authResult instanceof Response) return authResult;
    const userId = authResult.user.id;

    let body: { messages?: ChatMessage[] } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const messages = (body.messages ?? []).filter((m) => m && typeof m.content === "string").slice(-12);
    if (messages.length === 0) return json({ reply: "What would you like to know about your garden?", savedPreferences: 0 });

    const { data: profile } = await db
      .from("user_profiles")
      .select("home_id, subscription_tier, persona, first_name")
      .eq("uid", userId)
      .maybeSingle();
    const homeId = (profile?.home_id as string | null) ?? null;
    const tier = (profile?.subscription_tier as string | null) ?? null;
    const persona = (profile?.persona ?? null) as Persona;
    const firstName = (profile?.first_name as string | null) ?? "there";

    if (!tierAllowsInsights(tier)) return json({ locked: true, reply: null });
    if (!homeId) return json({ locked: false, reply: "Add a home and a few plants and I'll be able to help.", savedPreferences: 0 });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ locked: false, reply: null });

    // ── Grounding context (built once into the system prompt) ──
    const ctx = await buildUserContext(
      db as unknown as Parameters<typeof buildUserContext>[0],
      { userId, homeId },
    );
    const block = renderContextBlock(ctx, ["identity", "location", "garden", "tasks", "preferences", "behaviour", "weather"]);

    const { data: brief } = await db.from("garden_brief").select("goals, styles, time_per_week, experience_level, notes, ai_summary").eq("home_id", homeId).maybeSingle();
    const briefBlock = brief
      ? `GARDEN BRIEF: goals [${(brief.goals as string[] | null)?.join(", ") || "—"}]; styles [${(brief.styles as string[] | null)?.join(", ") || "—"}]; time ${brief.time_per_week ?? "—"}; experience ${brief.experience_level ?? "—"}.` +
        (brief.notes ? ` Their note: ${brief.notes}.` : "") + (brief.ai_summary ? ` Your read: ${brief.ai_summary}` : "")
      : "GARDEN BRIEF: not set yet.";

    const { data: reportRow } = await db.from("garden_manager_reports").select("report").eq("home_id", homeId).maybeSingle();
    const report = (reportRow?.report ?? null) as { headline?: string; sections?: Array<{ title?: string; recommendation?: string }> } | null;
    const reportBlock = report
      ? `YOUR LATEST REPORT: ${report.headline ?? ""}\n` +
        (report.sections ?? []).slice(0, 4).map((s) => `- ${s.title}: ${s.recommendation ?? ""}`).join("\n")
      : "YOUR LATEST REPORT: none generated yet.";

    const { data: openLog } = await db
      .from("garden_manager_log").select("title").eq("home_id", homeId).eq("status", "open")
      .order("created_at", { ascending: false }).limit(6);
    const logBlock = (openLog ?? []).length
      ? `OPEN ITEMS YOU FLAGGED: ${(openLog ?? []).map((l: { title: string }) => l.title).join("; ")}.`
      : "OPEN ITEMS: none.";

    const systemPrompt =
      `You are ${firstName}'s personal head gardener — warm, knowledgeable, opinionated, talking with them directly.\n` +
      `${personaInstruction(persona)}\n\n${block}\n\n${briefBlock}\n\n${reportBlock}\n\n${logBlock}\n\n` +
      `Answer their question grounded in EVERYTHING above. Be specific to THEIR garden, plants, areas, climate and season — never generic. ` +
      `Use UK gardening conventions. You can recommend new plants/tasks, but never claim they own plants they don't. ` +
      `If they express a like or dislike (a plant, style, feature, wildlife, maintenance level, colour), capture it in "detected_preferences". ` +
      `Keep "reply" conversational and concise. Return JSON matching the schema.`;

    const geminiMessages = messages.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    const { text, usage } = await callGeminiCascade(apiKey, FN, geminiMessages, {
      systemPrompt,
      temperature: 0.6,
      maxOutputTokens: 1000,
      responseSchema: CHAT_SCHEMA,
      responseMimeType: "application/json",
      logContext: { userId, homeId },
    });

    await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
      userId, homeId, functionName: FN, action: "chat", usage,
      contextBlock: systemPrompt, prompt: JSON.stringify(messages), rawResult: text,
    });

    let parsed: { reply?: string; detected_preferences?: Array<{ entity_type: string; entity_name: string; sentiment: string; reason?: string }> } = {};
    try { parsed = JSON.parse(text); } catch { /* keep empty */ }

    // Persist any newly-expressed preferences (deduped against what we already know).
    let savedPreferences = 0;
    const detected = (parsed.detected_preferences ?? []).filter((p) => p.entity_type && p.entity_name && (p.sentiment === "positive" || p.sentiment === "negative"));
    if (detected.length > 0) {
      const existing = await loadPreferences(db, { userId, homeId });
      const seen = new Set(existing.map((e) => `${e.entity_type.toLowerCase()}:${e.entity_name.toLowerCase()}`));
      const rows: PreferenceRow[] = detected
        .filter((p) => !seen.has(`${p.entity_type.toLowerCase()}:${p.entity_name.toLowerCase()}`))
        .map((p) => ({ home_id: homeId, user_id: userId, entity_type: p.entity_type, entity_name: p.entity_name, sentiment: p.sentiment, reason: p.reason ?? null }));
      if (rows.length) savedPreferences = await savePreferences(db, rows);
    }

    log(FN, "replied", { userId, homeId, savedPreferences });
    return json({ locked: false, reply: parsed.reply ?? "", savedPreferences });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
