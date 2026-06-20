/**
 * generate-grow-suggestions — AI "what to grow this week + tasks you might be
 * missing" (gap-fill).
 *
 * Uses the full gardener context (buildUserContext: areas + conditions, current
 * plants, quiz/swipe/chat preferences, top task types, season, weather) + draft
 * plans, and asks Gemini (persona-aware) for timely plant suggestions (this week,
 * per area where it fits) and common care tasks they may be missing. Results land
 * in home_grow_suggestions (replaced each run) → the /insights feed. Evergreen-
 * gated. Weekly cron + on-demand { homeId }. See docs/plans/ai-insights-overhaul.md.
 */
import { serviceClient } from "../_shared/supabaseClient.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { captureException } from "../_shared/sentry.ts";
import { log, warn } from "../_shared/logger.ts";

const FN = "generate-grow-suggestions";

const SCHEMA = {
  type: "object",
  properties: {
    plants: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, reason: { type: "string" }, area: { type: "string" } },
        required: ["name", "reason"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: { task: { type: "string" }, reason: { type: "string" } },
        required: ["task", "reason"],
      },
    },
  },
  required: ["plants", "tasks"],
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
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
      const { data } = await db.from("homes").select("id");
      homeIds = (data ?? []).map((h) => h.id as string);
    }
    if (!apiKey || homeIds.length === 0) return json({ homes: 0, suggestions: 0 });

    let written = 0;
    for (const homeId of homeIds) {
      try {
        // Evergreen gate + an entitled member's userId + persona for the context.
        const { data: members } = await db.from("home_members").select("user_id").eq("home_id", homeId);
        const userIds = (members ?? []).map((m) => m.user_id as string);
        if (userIds.length === 0) continue;
        const { data: profs } = await db.from("user_profiles").select("uid, subscription_tier, persona").in("uid", userIds);
        const entitled = (profs ?? []).find((p) => tierAllowsInsights(p.subscription_tier as string | null));
        if (!entitled) continue;
        const persona = (entitled.persona ?? null) as Persona;
        const ctxUserId = entitled.uid as string;

        const ctx = await buildUserContext(
          db as unknown as Parameters<typeof buildUserContext>[0],
          { userId: ctxUserId, homeId },
        );
        if (ctx.areas.length === 0 && ctx.preferences.length === 0 && ctx.inventory.length === 0) {
          await db.from("home_grow_suggestions").delete().eq("home_id", homeId);
          continue;
        }
        const block = renderContextBlock(ctx, ["location", "garden", "tasks", "preferences", "behaviour", "weather"]);

        const { data: drafts } = await db.from("plans").select("name").eq("home_id", homeId).eq("status", "Draft").limit(5);
        const draftPlans = (drafts ?? []).map((d) => d.name as string).filter(Boolean);

        const prompt =
          `${personaInstruction(persona)}\n\n${block}\n\n` +
          (draftPlans.length ? `Draft plans on the go: ${draftPlans.join(", ")}.\n\n` : "") +
          `Based on ALL of the above, suggest:\n` +
          `(A) "plants": 2-4 plants to sow or plant THIS WEEK that suit this gardener — weigh their preferences ` +
          `(likes/dislikes), what they already grow, their areas + conditions (light, medium, pH, indoor/outdoor), the ` +
          `climate/season/weather, and any draft plans. Where one area clearly fits, name it in "area".\n` +
          `(B) "tasks": 1-3 common seasonal care tasks they may be MISSING right now (e.g. pruning, mowing, feeding, ` +
          `mulching, dividing) — judge from their most-active task types + season + what they grow. Only genuinely ` +
          `useful ones.\n\nReturn JSON matching the schema. Empty arrays are fine if nothing's worth suggesting.`;

        const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
          systemPrompt: "You are Rhozly's garden assistant suggesting timely planting + care for THIS gardener. Be specific, seasonal and personalised; don't just repeat what they already grow.",
          responseSchema: SCHEMA,
          responseMimeType: "application/json",
          temperature: 0.5,
          maxOutputTokens: 700,
          logContext: { homeId },
        });
        await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
          userId: ctxUserId, homeId, functionName: FN, action: "grow_suggestions", usage,
        });

        let parsed: {
          plants?: Array<{ name?: string; reason?: string; area?: string }>;
          tasks?: Array<{ task?: string; reason?: string }>;
        } = {};
        try {
          parsed = JSON.parse(text);
        } catch { /* keep empty */ }

        const nowIso = new Date().toISOString();
        const rows: Array<Record<string, unknown>> = [];
        for (const p of (parsed.plants ?? []).slice(0, 4)) {
          if (!p.name || !p.reason) continue;
          rows.push({ home_id: homeId, kind: "plant", title: p.name, body: p.reason, area_name: p.area ?? null, severity: 1, generated_at: nowIso });
        }
        for (const t of (parsed.tasks ?? []).slice(0, 3)) {
          if (!t.task || !t.reason) continue;
          rows.push({ home_id: homeId, kind: "task", title: t.task, body: t.reason, area_name: null, severity: 2, generated_at: nowIso });
        }

        await db.from("home_grow_suggestions").delete().eq("home_id", homeId);
        if (rows.length) await db.from("home_grow_suggestions").insert(rows);
        written += rows.length;
      } catch (err) {
        warn(FN, "home_failed", { homeId, error: String(err) });
      }
    }

    log(FN, "complete", { homes: homeIds.length, suggestions: written });
    return json({ homes: homeIds.length, suggestions: written });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
