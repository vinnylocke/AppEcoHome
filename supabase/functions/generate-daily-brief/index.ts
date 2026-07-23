// Garden Brain Phase 2 — the Daily Brief generator.
//
// Daily cron (04:30 UTC, after the 03:45 adaptive-care reconcile) or on-demand:
//   {}                                    → all activity-filtered homes (cron)
//   { homeId }                            → one home (targeted/testing)
//   { homeId, regenerate: true, feedback? } → authenticated member, Sage+ only,
//                                             rate-limited; feedback threads into
//                                             the prompt (regenerate-with-feedback).
//
// Every eligible home gets a DETERMINISTIC brief (assembleBrief — ranked items,
// template summary). Sage/Evergreen owners additionally get the AI voice: the
// tier's model ladder REWRITES summary + item reasons but can never add items;
// any AI failure falls back to the deterministic payload, so a brief always
// exists. All AI calls are metered via logAiUsage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { requireHomeMembership } from "../_shared/requireHomeMembership.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { extractJsonObject } from "../_shared/extractJson.ts";
import { buildUserContext, renderContextBlock } from "../_shared/userContext.ts";
import { modelsForTier } from "../agent-chat/chatModels.ts";
import { isOverdue, effectiveDueDate } from "../_shared/dashboardStats.ts";
import { assembleBrief, buildBriefVoicePrompt, buildWindowSignals, type BriefSignals, type BriefPayload, type WindowBlueprintInput } from "../_shared/dailyBrief.ts";
import type { Persona } from "../_shared/persona.ts";

const FN = "generate-daily-brief";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AI_TIERS = new Set(["sage", "evergreen"]);
const ACTIONABLE = new Set(["tighten_watering", "stretch_watering", "stress_risk", "create_watering_routine"]);

// deno-lint-ignore no-explicit-any
async function gatherSignals(db: any, homeId: string, ownerId: string, today: string): Promise<BriefSignals> {
  const dayMs = 86_400_000;
  const in3 = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * dayMs).toISOString().split("T")[0];
  const since24h = new Date(Date.now() - dayMs).toISOString();
  const since3d = new Date(Date.now() - 3 * dayMs).toISOString();
  const since7d = new Date(Date.now() - 7 * dayMs).toISOString();

  const [
    { data: pendingTasks },
    { data: careRows },
    { data: alerts },
    { data: windowBps },
    { data: failedRuns },
    { data: lowBattery },
    { data: insights },
    { data: completions },
    { data: photoConcerns },
    { data: resolvedWindows },
  ] = await Promise.all([
    db.from("tasks")
      .select("id, title, status, due_date, next_check_at, window_end_date")
      .eq("home_id", homeId).eq("status", "Pending").lte("due_date", today),
    db.from("care_adjustments")
      .select("id, kind, status, evidence, verification, area_id, areas(name)")
      .eq("home_id", homeId)
      .or(`status.eq.proposed,and(status.in.(verified_good,verified_mixed),verified_at.gte.${since7d})`),
    db.from("weather_alerts")
      .select("type, message, is_active, ends_at, locations!inner(home_id)")
      .eq("locations.home_id", homeId).eq("is_active", true).gte("ends_at", new Date().toISOString()),
    // All recurring window blueprints for the home — deliberately NOT filtered
    // by literal start/end date: an 'annual' blueprint's stored dates are last
    // year's template, so the date filter would hide next year's window.
    // gatherSignals rolls each into its current occurrence below (Track B, B3).
    db.from("task_blueprints")
      .select("id, title, task_type, start_date, end_date, recurrence_kind, recurs_until")
      .eq("home_id", homeId).eq("is_recurring", true).eq("is_archived", false)
      .in("task_type", ["Harvesting", "Harvest", "Pruning"])
      .not("end_date", "is", null),
    db.from("automation_runs")
      .select("status, triggered_at, automations!inner(name, home_id)")
      .eq("automations.home_id", homeId).eq("status", "failed").gte("triggered_at", since24h),
    db.from("devices")
      .select("name, battery_percent")
      .eq("home_id", homeId).eq("is_active", true).lt("battery_percent", 20),
    db.from("user_insights")
      .select("insight_text, created_at")
      .eq("user_id", ownerId).eq("is_significant", true).is("dismissed_at", null)
      .gte("created_at", since3d).limit(3),
    db.from("user_events")
      .select("created_at")
      .eq("user_id", ownerId).eq("event_type", "task_completed").gte("created_at", since7d),
    // Phase 3: yesterday's photo `concern` observations feed the brief.
    db.from("photo_observations")
      .select("id, findings, inventory_items(plant_name, nickname)")
      .eq("home_id", homeId).eq("health", "concern").gte("created_at", since24h),
    // Blueprints whose CURRENT-season window task is already resolved
    // (Completed/Skipped) and still covers today — used to drop finished
    // windows from the `windows` signal (mirrors dashboardStats' DONE-set
    // suppression). The window_end_date >= today gate scopes it to this year's
    // cycle, so a past completed window can't hide next year's open one.
    db.from("tasks")
      .select("blueprint_id")
      .eq("home_id", homeId)
      .in("status", ["Completed", "Skipped"])
      .not("blueprint_id", "is", null)
      .not("window_end_date", "is", null)
      .in("type", ["Harvesting", "Harvest", "Pruning"])
      .lte("due_date", today)
      .gte("window_end_date", today),
  ]);

  const tasks = (pendingTasks ?? []) as Array<{ title: string; due_date: string; next_check_at: string | null; window_end_date: string | null; status: string }>;
  const overdue = tasks.filter((t) => isOverdue(t, today));
  const dueToday = tasks.filter((t) => effectiveDueDate(t) === today && !isOverdue(t, today));

  const care = (careRows ?? []) as Array<{ id: string; kind: string; status: string; evidence: Record<string, unknown>; verification: Record<string, unknown> | null; areas: { name: string | null } | null }>;
  const proposals = care.filter((c) => c.status === "proposed" && ACTIONABLE.has(c.kind));
  const verifications = care
    .filter((c) => c.status === "verified_good" || c.status === "verified_mixed")
    .map((c) => ({
      status: c.status as "verified_good" | "verified_mixed",
      inRangePct: typeof c.verification?.inRangePct === "number" ? (c.verification.inRangePct as number) : undefined,
    }));
  const onTrackAreas = care
    .filter((c) => c.status === "proposed" && c.kind === "in_range")
    .map((c) => c.areas?.name ?? "An area");

  // Consecutive completion days ending today/yesterday.
  const daysWithCompletion = new Set(
    ((completions ?? []) as Array<{ created_at: string }>).map((e) => e.created_at.split("T")[0]),
  );
  let streak = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * dayMs).toISOString().split("T")[0];
    if (daysWithCompletion.has(d)) streak += 1;
    else if (i > 0) break; // allow "today has no completion yet" at i=0
  }

  // Blueprint ids whose current-season window the user has already resolved —
  // drop them from the windows signal so a finished window stops nagging.
  const resolvedWindowBlueprintIds = new Set(
    ((resolvedWindows ?? []) as Array<{ blueprint_id: string }>).map((r) => r.blueprint_id),
  );

  // Roll each window blueprint into its current occurrence + drop resolved ones
  // (Track B, B3 — see buildWindowSignals). `in3` is today + 3 days.
  const windowsSignal = buildWindowSignals(
    (windowBps ?? []) as WindowBlueprintInput[],
    resolvedWindowBlueprintIds,
    today,
    in3,
  );

  return {
    todayStr: today,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    topTaskTitles: [...overdue, ...dueToday].slice(0, 3).map((t) => t.title),
    careProposals: proposals.map((p) => ({
      id: p.id,
      kind: p.kind,
      headline: (p.evidence?.headline as string) ?? "A watering suggestion is waiting",
      detail: (p.evidence?.detail as string) ?? "",
    })),
    photoFlags: ((photoConcerns ?? []) as Array<{ id: string; findings: string; inventory_items: { plant_name: string | null; nickname: string | null } | null }>)
      .map((o) => ({
        observationId: o.id,
        plantName: o.inventory_items?.nickname || o.inventory_items?.plant_name || "A plant",
        findings: o.findings,
      })),
    verifications,
    onTrackAreas,
    weatherAlerts: ((alerts ?? []) as Array<{ type: string; message: string }>).map((a) => ({ type: a.type, message: a.message })),
    windows: windowsSignal,
    failedAutomations: ((failedRuns ?? []) as Array<{ automations: { name: string } }>).map((r) => ({ name: r.automations?.name ?? "automation" })),
    lowBatteryDevices: ((lowBattery ?? []) as Array<{ name: string; battery_percent: number }>).map((d) => ({ name: d.name, battery: d.battery_percent })),
    insightTitles: ((insights ?? []) as Array<{ insight_text: string }>).map((i) =>
      i.insight_text.length > 90 ? `${i.insight_text.slice(0, 87)}…` : i.insight_text),
    completionStreakDays: streak,
  };
}

/** Rewrite summary + item reasons in the head-gardener voice. Items can only be
 *  REPHRASED (same count/order) — validation falls back to deterministic. The
 *  system prompt lives in _shared/dailyBrief.ts (buildBriefVoicePrompt) so the
 *  Deno tests can assert its contract; it collapses persona two-way (null ⇒
 *  "new") per docs/plans/home-redesign-two-postures.md §6 decision (b). */
// deno-lint-ignore no-explicit-any
async function aiVoice(
  db: any,
  apiKey: string,
  ownerId: string,
  homeId: string,
  tier: string,
  persona: Persona,
  deterministic: BriefPayload,
  feedback: string | null,
): Promise<{ payload: BriefPayload; model: string } | null> {
  try {
    const uctx = await buildUserContext(db, { userId: ownerId, homeId });
    const envBlock = renderContextBlock(uctx, ["identity", "location", "weather", "behaviour"]);
    const { data: gb } = await db.from("garden_brief").select("goals, time_per_week").eq("home_id", homeId).maybeSingle();
    const goalsLine = gb?.goals?.length ? `The home's stated goals: ${gb.goals.join(", ")}.` : "";

    const system = buildBriefVoicePrompt({ persona, goalsLine, feedback });

    const user = `${envBlock}\n\nDeterministic brief JSON:\n${JSON.stringify({ summary: deterministic.summary, items: deterministic.items.map((i) => ({ title: i.title, reason: i.reason })), goodNews: deterministic.goodNews })}`;

    const t0 = Date.now();
    const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([user]), {
      systemPrompt: system,
      models: modelsForTier(tier),
      temperature: 0.4,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
    });
    const parsed = extractJsonObject(text) as { summary?: string; items?: Array<{ title?: string; reason?: string }> };
    if (!parsed?.summary || !Array.isArray(parsed.items) || parsed.items.length !== deterministic.items.length) {
      warn(FN, "ai_shape_mismatch", { homeId });
      await logAiUsage(db, { functionName: FN, action: "daily_brief", usage, durationMs: Date.now() - t0, status: "fallback", userId: ownerId, homeId, prompt: user.slice(0, 4000), rawResult: text.slice(0, 4000) });
      return null;
    }
    const payload: BriefPayload = {
      ...deterministic,
      summary: parsed.summary,
      items: deterministic.items.map((it, i) => ({
        ...it,
        title: parsed.items![i].title?.trim() || it.title,
        reason: parsed.items![i].reason?.trim() || it.reason,
      })),
    };
    await logAiUsage(db, { functionName: FN, action: "daily_brief", usage, durationMs: Date.now() - t0, status: "ok", userId: ownerId, homeId, contextBlock: envBlock.slice(0, 4000), prompt: user.slice(0, 4000), rawResult: text.slice(0, 4000) });
    return { payload, model: usage.model };
  } catch (err) {
    warn(FN, "ai_voice_failed", { homeId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const body = await req.json().catch(() => ({}));
    const onlyHomeId: string | null = body?.homeId ?? null;
    const regenerate: boolean = body?.regenerate === true;
    const feedback: string | null = typeof body?.feedback === "string" ? body.feedback.slice(0, 500) : null;
    const today = new Date().toISOString().split("T")[0];

    // ── On-demand (targeted) call: authenticated member of the home. ─────────
    // Any { homeId } call — regenerate or not — must be an authenticated member,
    // otherwise an anon caller (verify_jwt=false) could burn Gemini + overwrite
    // any home's brief (bug-audit-2026-07-10 #3). The no-body {} cron sweep
    // below stays open (the standard verify_jwt=false cron path).
    if (onlyHomeId) {
      // cast: this fn's createClient(@2) is a newer supabase-js than the auth
      // helpers pin (@2.39.3) — a .d.ts-only mismatch, identical at runtime.
      const authDb = db as unknown as Parameters<typeof requireAuth>[1];
      const auth = await requireAuth(req, authDb);
      if (auth instanceof Response) return auth;
      const callerId = auth.user.id;
      const memErr = await requireHomeMembership(authDb, onlyHomeId, callerId);
      if (memErr) return memErr;

      // Regenerate additionally requires Sage+ and is rate-limited.
      if (regenerate) {
        const { data: prof } = await db.from("user_profiles").select("subscription_tier").eq("uid", callerId).maybeSingle();
        if (!AI_TIERS.has(prof?.subscription_tier ?? "")) return json({ error: "Regenerate is available on Sage and Evergreen" }, 403);
        const limited = await enforceRateLimit(db, callerId, FN);
        if (limited) return limited;
      }
    } else if (regenerate) {
      // regenerate with no homeId is meaningless.
      return json({ error: "homeId required" }, 400);
    }

    // ── Home set. ─────────────────────────────────────────────────────────────
    let homeIds: string[] = [];
    if (onlyHomeId) {
      homeIds = [onlyHomeId];
    } else {
      // Cron: homes whose members were active in the last 7 days (cost gate).
      const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: activeUsers } = await db.from("user_events").select("user_id").gte("created_at", since7d).limit(5000);
      const activeSet = [...new Set(((activeUsers ?? []) as Array<{ user_id: string }>).map((u) => u.user_id))];
      if (activeSet.length === 0) return json({ success: true, homes: 0 });
      const { data: memberRows } = await db.from("home_members").select("home_id, user_id").in("user_id", activeSet);
      homeIds = [...new Set(((memberRows ?? []) as Array<{ home_id: string }>).map((m) => m.home_id))];
    }

    let generated = 0, aiVoiced = 0;
    for (const homeId of homeIds) {
      const { data: owner } = await db.from("home_members").select("user_id").eq("home_id", homeId).eq("role", "owner").limit(1).maybeSingle();
      if (!owner) continue;
      const { data: prof } = await db.from("user_profiles").select("subscription_tier, persona").eq("uid", owner.user_id).maybeSingle();
      const tier = prof?.subscription_tier ?? "sprout";
      const persona = (prof?.persona ?? null) as Persona;

      const signals = await gatherSignals(db, homeId, owner.user_id, today);
      const deterministic = assembleBrief(signals);

      let payload = deterministic;
      let generatedBy = "deterministic";
      let model: string | null = null;
      if (AI_TIERS.has(tier) && apiKey) {
        const ai = await aiVoice(db, apiKey, owner.user_id, homeId, tier, persona, deterministic, feedback);
        if (ai) { payload = ai.payload; generatedBy = "ai"; model = ai.model; aiVoiced += 1; }
      }

      const { error: upErr } = await db.from("daily_briefs").upsert({
        home_id: homeId, brief_date: today, payload, tier, model, generated_by: generatedBy, created_at: new Date().toISOString(),
      }, { onConflict: "home_id, brief_date" });
      if (upErr) { warn(FN, "brief_upsert_failed", { homeId, error: upErr.message }); continue; }
      generated += 1;
    }

    log(FN, "complete", { homes: homeIds.length, generated, aiVoiced, regenerate });
    return json({ success: true, homes: homeIds.length, generated, aiVoiced });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err);
    return json({ error: message }, 500);
  }
});
