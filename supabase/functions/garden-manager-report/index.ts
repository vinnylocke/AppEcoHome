/**
 * garden-manager-report — the Head Gardener "Estate Report": a standing, goal-by-goal
 * management breakdown of the whole home.
 *
 * Synthesises the Garden Brief (goals + constraints), the full gardener context,
 * deterministic goal-gap facts (gapAnalysis), the raw insight feed (insightSources)
 * and the continuity log into one persona-aware report — cached in
 * garden_manager_reports by a content hash, regenerated on demand (bust) or when the
 * inputs change. Evergreen-gated via tierAllowsInsights — mirrors FEATURE_GATES.head_gardener.
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
import { aggregateInsights } from "../_shared/insightSources.ts";
import { analyseGaps, type GapFact, type PlantFact } from "../_shared/gapAnalysis.ts";
import { diffGapLog, gapKey, gapTitle, type OpenLogEntry } from "../_shared/managerLog.ts";
import { captureException } from "../_shared/sentry.ts";
import { log, warn } from "../_shared/logger.ts";

const FN = "garden-manager-report";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Internal links the report may deep-link to. Anything else is dropped → null.
const ALLOWED_LINK_ROOTS = new Set([
  "dashboard", "shed", "schedule", "planner", "doctor", "profile", "management",
  "watchlist", "visualiser", "lightsensor", "guides", "shopping", "insights",
  "manager", "integrations", "weekly",
]);
function safeLink(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/")) return null;
  const root = v.slice(1).split(/[/?#]/)[0];
  return ALLOWED_LINK_ROOTS.has(root) ? v : null;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    greeting: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          goal: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          severity: { type: "integer" },
          recommendation: { type: "string" },
          link: { type: "string" },
        },
        required: ["title", "body"],
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          goal: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          suggestion: { type: "string" },
          link: { type: "string" },
        },
        required: ["title", "detail"],
      },
    },
    yearPlan: {
      type: "object",
      properties: {
        thisMonth: { type: "array", items: { type: "string" } },
        thisSeason: { type: "array", items: { type: "string" } },
        comingUp: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["headline", "greeting", "sections"],
};

interface FollowUp { logId: string; title: string; status: string; note: string | null }

/** Load the home's planted items + the plant metadata gapAnalysis needs. */
// deno-lint-ignore no-explicit-any
async function loadPlantFacts(db: any, homeId: string): Promise<PlantFact[]> {
  const { data: inv } = await db
    .from("inventory_items")
    .select("plant_name, plants(flowering_season, harvest_season, is_edible, flowers, attracts, is_toxic_pets, is_toxic_humans)")
    .eq("home_id", homeId)
    .eq("status", "Planted")
    .limit(60);
  return (inv ?? []).map((r: { plant_name?: string; plants?: Record<string, unknown> | null }) => {
    const p = (r.plants ?? {}) as Record<string, unknown>;
    return {
      name: (r.plant_name as string) ?? "A plant",
      floweringSeasons: asStringArray(p.flowering_season),
      harvestSeasons: asStringArray(p.harvest_season),
      isEdible: !!p.is_edible,
      flowers: !!p.flowers,
      attracts: asStringArray(p.attracts),
      toxicPets: !!p.is_toxic_pets,
      toxicHumans: !!p.is_toxic_humans,
    };
  });
}

/**
 * Reconcile the continuity log against the freshly-computed gaps (deterministic):
 * close entries whose gap is gone, open entries for newly-detected gaps.
 */
// deno-lint-ignore no-explicit-any
async function reconcileGapLog(db: any, homeId: string, userId: string, gapFacts: GapFact[]): Promise<void> {
  const currentKeys = gapFacts.map((g) => gapKey(g.goal, g.code));
  const { data: openRows } = await db
    .from("garden_manager_log")
    .select("id, target_id")
    .eq("home_id", homeId).eq("kind", "gap").eq("status", "open");
  const { closeIds, openKeys } = diffGapLog(currentKeys, (openRows ?? []) as OpenLogEntry[]);

  if (closeIds.length) {
    await db.from("garden_manager_log").update({
      status: "acted",
      resolved_at: new Date().toISOString(),
      outcome_note: "This gap has closed — nice work.",
    }).in("id", closeIds);
  }
  if (openKeys.length) {
    const byKey = new Map(gapFacts.map((g) => [gapKey(g.goal, g.code), g]));
    const rows = openKeys.map((k) => {
      const g = byKey.get(k)!;
      return {
        home_id: homeId, user_id: userId, kind: "gap",
        title: gapTitle(g.code), body: g.detail, goal: g.goal,
        target_kind: "gap", target_id: k, status: "open",
      };
    });
    await db.from("garden_manager_log").insert(rows);
  }
}

interface FollowUpRow { id: string; title: string; status: string; outcome_note: string | null }
/** Recent open/acted log entries → follow-ups the manager can speak to. */
// deno-lint-ignore no-explicit-any
async function loadFollowUps(db: any, homeId: string): Promise<FollowUp[]> {
  const { data } = await db
    .from("garden_manager_log")
    .select("id, title, status, outcome_note, created_at")
    .eq("home_id", homeId)
    .in("status", ["open", "acted"])
    .order("created_at", { ascending: false })
    .limit(8);
  return (data ?? []).map((r: FollowUpRow) => ({
    logId: r.id, title: r.title, status: r.status, note: r.outcome_note ?? null,
  }));
}

/** Core generation — reused by the on-demand path here and the weekly cron. */
// deno-lint-ignore no-explicit-any
export async function generateManagerReport(
  db: any,
  apiKey: string,
  opts: { userId: string; homeId: string; persona: Persona; bust?: boolean },
): Promise<{ report: Record<string, unknown>; cached: boolean }> {
  const { userId, homeId, persona, bust } = opts;

  const { data: brief } = await db.from("garden_brief").select("*").eq("home_id", homeId).maybeSingle();
  const goals = (brief?.goals as string[] | null) ?? [];

  const ctx = await buildUserContext(
    db as unknown as Parameters<typeof buildUserContext>[0],
    { userId, homeId },
  );
  const block = renderContextBlock(ctx, ["identity", "location", "garden", "tasks", "preferences", "behaviour", "weather"]);

  const plantFacts = await loadPlantFacts(db, homeId);
  const insights = await aggregateInsights(db as unknown as Parameters<typeof aggregateInsights>[0], userId, homeId);

  const gapFacts: GapFact[] = analyseGaps({
    goals,
    plants: plantFacts,
    areaCount: ctx.areas.length,
    plantedCount: plantFacts.length,
    postponeRate: ctx.behaviour.postponeRate,
    timePerWeek: (brief?.time_per_week as string | null) ?? null,
  });

  // Content hash — regenerate only when something the report depends on changes.
  // (Follow-ups are derived from the gap set, so they don't enter the hash.)
  const basedOn = [
    (brief?.updated_at as string) ?? "no-brief",
    goals.slice().sort().join(","),
    ctx.inventory.map((i) => i.id).sort().join(","),
    insights.map((i) => i.id).sort().join("|"),
    ctx.currentMonth,
    gapFacts.map((g) => g.code).sort().join(","),
  ].join("§");

  const { data: cachedRow } = await db
    .from("garden_manager_reports")
    .select("report, based_on")
    .eq("home_id", homeId)
    .maybeSingle();
  if (!bust && cachedRow && cachedRow.based_on === basedOn) {
    return { report: cachedRow.report as Record<string, unknown>, cached: true };
  }

  // Regenerating → reconcile the continuity log first (close gaps that have gone,
  // open fresh ones), then read back the follow-ups the report will speak to.
  await reconcileGapLog(db, homeId, userId, gapFacts);
  const followUps = await loadFollowUps(db, homeId);

  const briefBlock = brief
    ? `GARDEN BRIEF (what they want — manage toward this):\n` +
      `- Goals: ${goals.join(", ") || "none set"}\n` +
      `- Styles: ${(brief.styles as string[] | null)?.join(", ") || "—"}\n` +
      `- Time: ${brief.time_per_week ?? "—"} | Experience: ${brief.experience_level ?? "—"} | Budget: ${brief.budget_tier ?? "—"}\n` +
      (brief.notes ? `- Their note: ${brief.notes}\n` : "") +
      (brief.ai_summary ? `- Your prior read: ${brief.ai_summary}\n` : "")
    : "GARDEN BRIEF: not set yet — infer goals gently from their plants + preferences.";

  const gapBlock = gapFacts.length
    ? "GROUNDED GAPS (factual — narrate these; do NOT invent gaps beyond them):\n" +
      gapFacts.map((g, n) => `${n + 1}. [${g.goal}] ${g.detail}`).join("\n")
    : "GROUNDED GAPS: none detected against their goals.";

  const insightBlock = insights.length
    ? "RAW SIGNALS (from the wider app — weave in only what matters):\n" +
      insights.slice(0, 10).map((i, n) => `${n + 1}. [${i.category}] ${i.title}: ${i.body}`).join("\n")
    : "RAW SIGNALS: none right now.";

  const followBlock = followUps.length
    ? "OPEN/RECENT FOLLOW-UPS (reference naturally in the greeting if relevant):\n" +
      followUps.map((f) => `- "${f.title}" (${f.status})${f.note ? ` — ${f.note}` : ""}`).join("\n")
    : "FOLLOW-UPS: none yet.";

  const prompt =
    `${personaInstruction(persona)}\n\n${block}\n\n${briefBlock}\n\n${gapBlock}\n\n${insightBlock}\n\n${followBlock}\n\n` +
    `You are this gardener's head gardener writing their standing Estate Report. Speak in the FIRST PERSON as their manager. Produce JSON:\n` +
    `- "headline": one line — the honest state of their garden right now.\n` +
    `- "greeting": 2-3 warm sentences. If there's a relevant follow-up, acknowledge it (e.g. praise something they did).\n` +
    `- "sections": ONE per active goal that's worth commenting on (use the goal id in "goal"). Each: a short narrative "body" grounded in THEIR plants/areas/season, a one-line "recommendation", a "severity" 1-3, and a "link" to the most relevant app route if useful (one of: /shed /schedule /planner /watchlist /management /shopping /weekly — else omit).\n` +
    `- "gaps": narrate each grounded gap above into title + detail + a concrete "suggestion" (and "link" if useful). Do not add gaps that aren't in the grounded list.\n` +
    `- "yearPlan": near-term actions for THIS gardener — "thisMonth" (2-4), "thisSeason" (1-3), "comingUp" (1-3) — grounded in their season (${ctx.currentSeason}, ${ctx.currentMonth}), hemisphere (${ctx.hemisphere}), goals and what they grow.\n` +
    `Be specific and concrete; never invent plants or facts not supported above. Plain text in every field, no markdown.`;

  const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
    systemPrompt: "You are Rhozly's head gardener producing a personalised, grounded management report for ONE gardener's whole home. Warm, specific, first-person; never fabricate.",
    responseSchema: REPORT_SCHEMA,
    responseMimeType: "application/json",
    temperature: 0.35,
    maxOutputTokens: 1400,
    logContext: { userId, homeId },
  });

  await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
    userId, homeId, functionName: FN, action: "manager_report", usage,
    contextBlock: `${block}\n\n${briefBlock}\n\n${gapBlock}`, prompt, rawResult: text,
  });

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch { /* keep empty → minimal report */ }

  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
  const yearPlanRaw = (parsed.yearPlan ?? {}) as Record<string, unknown>;

  const report = {
    headline: (parsed.headline as string) ?? "Here's where your garden stands.",
    greeting: (parsed.greeting as string) ?? "",
    sections: sections.map((s) => {
      const o = s as Record<string, unknown>;
      return {
        goal: (o.goal as string) ?? null,
        title: (o.title as string) ?? "",
        body: (o.body as string) ?? "",
        severity: typeof o.severity === "number" ? Math.min(3, Math.max(1, o.severity)) : 1,
        recommendation: (o.recommendation as string) ?? null,
        link: safeLink(o.link),
      };
    }),
    gaps: gaps.map((g) => {
      const o = g as Record<string, unknown>;
      return {
        goal: (o.goal as string) ?? null,
        title: (o.title as string) ?? "",
        detail: (o.detail as string) ?? "",
        suggestion: (o.suggestion as string) ?? null,
        link: safeLink(o.link),
      };
    }),
    yearPlan: {
      thisMonth: asStringArray(yearPlanRaw.thisMonth).slice(0, 4),
      thisSeason: asStringArray(yearPlanRaw.thisSeason).slice(0, 3),
      comingUp: asStringArray(yearPlanRaw.comingUp).slice(0, 3),
    },
    followUps,
    generatedAt: new Date().toISOString(),
    persona: persona ?? null,
  };

  await db.from("garden_manager_reports").upsert({
    home_id: homeId, report, persona, based_on: basedOn, generated_at: new Date().toISOString(),
  }, { onConflict: "home_id" });

  return { report, cached: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: { bust?: boolean; cron?: boolean } = {};
    try { body = await req.json(); } catch { /* no body (cron may post {}) */ }

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    // ── Weekly cron path — regenerate every Evergreen home (reconciles the log
    //    first, then refreshes the report when its inputs changed). Mirrors the
    //    trust model of generate-grow-suggestions (verify_jwt = false). ──
    if (body.cron) {
      if (!apiKey) return json({ homes: 0, generated: 0 });
      const { data: homes } = await db.from("homes").select("id");
      let generated = 0;
      for (const h of homes ?? []) {
        const homeId = h.id as string;
        try {
          const { data: members } = await db.from("home_members").select("user_id").eq("home_id", homeId);
          const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id as string);
          if (!userIds.length) continue;
          const { data: profs } = await db.from("user_profiles").select("uid, subscription_tier, persona").in("uid", userIds);
          const entitled = (profs ?? []).find((p: { subscription_tier: string | null }) => tierAllowsInsights(p.subscription_tier));
          if (!entitled) continue;
          await generateManagerReport(db, apiKey, {
            userId: entitled.uid as string, homeId, persona: (entitled.persona ?? null) as Persona, bust: false,
          });
          generated++;
        } catch (e) { warn(FN, "home_failed", { homeId, error: String(e) }); }
      }
      log(FN, "cron_complete", { homes: (homes ?? []).length, generated });
      return json({ homes: (homes ?? []).length, generated });
    }

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

    if (!tierAllowsInsights(tier)) return json({ locked: true, report: null });
    if (!homeId) return json({ locked: false, report: null });
    if (!apiKey) return json({ locked: false, report: null });

    const { report, cached } = await generateManagerReport(db, apiKey, { userId, homeId, persona, bust: !!body.bust });
    log(FN, "served", { userId, homeId, cached });
    return json({ locked: false, report, cached });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
