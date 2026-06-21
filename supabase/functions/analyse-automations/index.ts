/**
 * analyse-automations — Pillar B of the automation-intelligence feature.
 *
 * Deterministic. For each active automation it summarises the last 7 days of
 * automation_runs, reads the area's soil_moisture_profiles (Pillar A), runs the
 * pure analyser (_shared/automationSuggestions/analyse.ts), and reconciles the
 * resulting drafts into automation_suggestions (insert new / update existing /
 * dismiss stale). Suggestions are applied one-tap from the UI — never silently.
 *
 * Invoked by the daily `analyse-automations-daily` cron (no body → all) and
 * on-demand with { homeId }. verify_jwt off (cron uses the publishable key).
 *
 * The optional Sage+ AI rewrite of `rationale` → `ai_rationale` is a follow-up.
 */
import { serviceClient } from "../_shared/supabaseClient.ts";
import { log, warn } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { pLimit } from "../_shared/concurrency.ts";
import { FIRED_STATUSES } from "../_shared/runLimit.ts";
import {
  analyseAutomation,
  type AutomationConfig,
  type MoistureEvidence,
  type ProfileLite,
  type RunsSummary,
} from "../_shared/automationSuggestions/analyse.ts";
import { type ConditionNode } from "../_shared/conditionTree.ts";
import { callGeminiCascade, toMessages } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { personaInstruction, type Persona } from "../_shared/persona.ts";
import { tierAllowsInsights } from "../_shared/insightTiers.ts";

const FN = "analyse-automations";
const CONCURRENCY = 8;
const RUN_WINDOW_DAYS = 7;
const SUGGESTION_TTL_DAYS = 14;

interface AutoRow {
  id: string;
  home_id: string;
  area_id: string | null;
  run_limit_count: number | null;
  run_limit_window_hours: number | null;
  duration_seconds: number | null;
  sensor_cooldown_minutes: number | null;
  trigger_logic: ConditionNode | null;
}

/** Highest "soil_moisture < X" / "<= X" threshold in the automation's trigger tree. */
function findMoistureThreshold(node: ConditionNode | null): number | null {
  if (!node) return null;
  if (node.kind === "group") {
    let best: number | null = null;
    for (const c of node.children) {
      const v = findMoistureThreshold(c);
      if (v != null && (best == null || v > best)) best = v;
    }
    return best;
  }
  if (node.kind === "sensor" && node.metric === "soil_moisture" &&
      (node.comparator === "<" || node.comparator === "<=")) {
    return node.value;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const PROSE_SCHEMA = {
  type: "object",
  properties: { rewrites: { type: "array", items: { type: "string" } } },
  required: ["rewrites"],
};

/**
 * Sage+ rewrite of the deterministic rationales into warm, plain prose
 * (one sentence each, numbers kept). Best-effort — on any failure we return []
 * and the deterministic rationale stands. System-attributed AI usage.
 */
async function enrichRationales(
  apiKey: string,
  db: ReturnType<typeof serviceClient>,
  homeId: string,
  automationId: string,
  rationales: string[],
  persona: Persona = null,
): Promise<string[]> {
  try {
    const prompt =
      personaInstruction(persona) + "\n\n" +
      "You are Rhozly, a warm, encouraging gardening assistant. Rewrite each watering-automation " +
      "suggestion below into ONE friendly, plain-English sentence a beginner would understand. Keep " +
      "the specific numbers and the recommended action; do not add new advice. Return JSON " +
      `{ "rewrites": [...] } with one string per suggestion, in the same order.\n\nSuggestions:\n` +
      rationales.map((r, i) => `${i + 1}. ${r}`).join("\n");
    const { text, usage } = await callGeminiCascade(apiKey, FN, toMessages([prompt]), {
      systemPrompt: "Reword gardening automation tips warmly and concisely. Keep every number.",
      responseSchema: PROSE_SCHEMA,
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 512,
      logContext: { homeId, automationId },
    });
    await logAiUsage(db as unknown as Parameters<typeof logAiUsage>[0], {
      userId: null, homeId, functionName: FN, action: "suggestion_prose", usage,
      contextBlock: rationales.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      prompt,
      rawResult: text,
    });
    const parsed = JSON.parse(text) as { rewrites?: unknown };
    return Array.isArray(parsed.rewrites) ? parsed.rewrites.map((x) => String(x)) : [];
  } catch (err) {
    warn(FN, "ai_enrich_failed", { automationId, error: String(err) });
    return [];
  }
}

Deno.serve(async (req) => {
  try {
    const db = serviceClient();
    let body: { homeId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // cron sends '{}' or nothing.
    }

    let q = db
      .from("automations")
      .select("id, home_id, area_id, run_limit_count, run_limit_window_hours, duration_seconds, sensor_cooldown_minutes, trigger_logic")
      .eq("is_active", true);
    if (body.homeId) q = q.eq("home_id", body.homeId);
    const { data: autos, error } = await q;
    if (error) throw error;

    const automations = (autos ?? []) as AutoRow[];
    if (automations.length === 0) return json({ automations: 0, suggestions: 0 });

    // Which homes have AI access (any member with ai_enabled) → eligible for the
    // friendly prose rewrite. Resolved once for all homes in scope.
    // The AI prose rewrite is part of the Evergreen-only insights experience.
    // Resolve which homes have an Evergreen member + a persona for the wording.
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const homeInsights = new Map<string, boolean>();
    const homePersona = new Map<string, Persona>();
    if (geminiApiKey) {
      const homeIds = [...new Set(automations.map((a) => a.home_id))];
      const { data: members } = await db.from("home_members").select("home_id, user_id").in("home_id", homeIds);
      const memberRows = (members ?? []) as Array<{ home_id: string; user_id: string }>;
      const userIds = [...new Set(memberRows.map((m) => m.user_id))];
      if (userIds.length) {
        const { data: profs } = await db.from("user_profiles").select("uid, subscription_tier, persona").in("uid", userIds);
        const byUid = new Map<string, { tier: string | null; persona: Persona }>();
        for (const p of profs ?? []) {
          byUid.set(p.uid as string, { tier: (p.subscription_tier as string | null) ?? null, persona: (p.persona ?? null) as Persona });
        }
        for (const m of memberRows) {
          const info = byUid.get(m.user_id);
          if (info && tierAllowsInsights(info.tier)) {
            homeInsights.set(m.home_id, true);
            if (!homePersona.has(m.home_id)) homePersona.set(m.home_id, info.persona);
          }
        }
      }
    }

    const sinceIso = new Date(Date.now() - RUN_WINDOW_DAYS * 86_400_000).toISOString();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SUGGESTION_TTL_DAYS * 86_400_000).toISOString();
    const limit = pLimit(CONCURRENCY);
    let written = 0;
    let errors = 0;

    await Promise.all(automations.map((a) =>
      limit(async () => {
        try {
          // Runs summary (last 7 days).
          const { data: runRows } = await db
            .from("automation_runs")
            .select("status")
            .eq("automation_id", a.id)
            .gte("triggered_at", sinceIso);
          const rows = runRows ?? [];
          const fired = rows.filter((r) => (FIRED_STATUSES as unknown as string[]).includes(r.status as string)).length;
          const rateLimited = rows.filter((r) => r.status === "skipped_rate_limited").length;
          const runs: RunsSummary = { windowDays: RUN_WINDOW_DAYS, total: rows.length, fired, rateLimited };

          // Area moisture profile (aggregate the area's sensors).
          let profile: ProfileLite | null = null;
          if (a.area_id) {
            const { data: profs } = await db
              .from("soil_moisture_profiles")
              .select("drydown_rate_pct_per_day, retention_class, drydown_by_weather, sample_segments, watering_response")
              .eq("area_id", a.area_id);
            const rated = (profs ?? []).filter((p) =>
              p.drydown_rate_pct_per_day != null && ((p.sample_segments as number) ?? 0) > 0
            );
            if (rated.length > 0) {
              const avg = rated.reduce((s, p) => s + (p.drydown_rate_pct_per_day as number), 0) / rated.length;
              const wr = (rated[0].watering_response ?? {}) as { avgRewetJump?: number | null };
              profile = {
                retentionClass: rated[0].retention_class as ProfileLite["retentionClass"],
                drydownRatePerDay: Math.round(avg * 10) / 10,
                byWeather: (rated[0].drydown_by_weather ?? []) as ProfileLite["byWeather"],
                avgRewetJump: wr.avgRewetJump ?? null,
              };
            }
          }

          const cfg: AutomationConfig = {
            runLimitCount: a.run_limit_count,
            runLimitWindowHours: a.run_limit_window_hours ?? 24,
            durationSeconds: a.duration_seconds,
            sensorCooldownMinutes: a.sensor_cooldown_minutes,
          };

          // Concrete moisture evidence — recent readings vs the watering threshold.
          let evidence: MoistureEvidence | null = null;
          if (a.area_id) {
            const threshold = findMoistureThreshold(a.trigger_logic);
            const { data: sensors } = await db.from("devices")
              .select("id").eq("area_id", a.area_id).eq("device_type", "soil_sensor");
            const sensorIds = (sensors ?? []).map((s) => s.id as string);
            if (sensorIds.length) {
              const { data: rd } = await db.from("device_readings")
                .select("data").in("device_id", sensorIds).gte("recorded_at", sinceIso).limit(2000);
              const moistures: number[] = [];
              for (const r of rd ?? []) {
                const m = (r.data as Record<string, unknown> | null)?.soil_moisture;
                if (typeof m === "number" && Number.isFinite(m)) moistures.push(m);
              }
              if (moistures.length) {
                evidence = {
                  thresholdPct: threshold,
                  totalReadings: moistures.length,
                  lowReadings: threshold != null ? moistures.filter((m) => m < threshold).length : 0,
                  minMoisture: Math.min(...moistures),
                  avgMoisture: moistures.reduce((s, m) => s + m, 0) / moistures.length,
                };
              }
            }
          }
          const drafts = analyseAutomation(cfg, runs, profile, evidence);

          // Structured evidence for the chip's "Details" breakdown.
          const evidenceJson = {
            windowDays: RUN_WINDOW_DAYS,
            rateLimited: runs.rateLimited,
            fired: runs.fired,
            drydownRatePerDay: profile?.drydownRatePerDay ?? null,
            retentionClass: profile?.retentionClass ?? null,
            thresholdPct: evidence?.thresholdPct ?? null,
            totalReadings: evidence?.totalReadings ?? 0,
            lowReadings: evidence?.lowReadings ?? 0,
            minMoisture: evidence?.minMoisture != null ? Math.round(evidence.minMoisture) : null,
            avgMoisture: evidence?.avgMoisture != null ? Math.round(evidence.avgMoisture) : null,
          };

          // Reconcile against existing ACTIVE suggestions for this automation.
          const { data: existing } = await db
            .from("automation_suggestions")
            .select("id, kind")
            .eq("automation_id", a.id)
            .eq("status", "active");
          const existingByKind = new Map<string, string>();
          for (const e of existing ?? []) existingByKind.set(e.kind as string, e.id as string);
          const newKinds = new Set<string>(drafts.map((d) => d.kind));

          // Dismiss active suggestions whose condition no longer holds.
          const staleIds = (existing ?? [])
            .filter((e) => !newKinds.has(e.kind as string))
            .map((e) => e.id as string);
          if (staleIds.length) {
            await db.from("automation_suggestions")
              .update({ status: "dismissed", updated_at: nowIso })
              .in("id", staleIds);
          }

          // Sage+ friendly rewrite (best-effort; deterministic rationale stands otherwise).
          let aiRationales: string[] = [];
          if (geminiApiKey && drafts.length > 0 && homeInsights.get(a.home_id)) {
            aiRationales = await enrichRationales(geminiApiKey, db, a.home_id, a.id, drafts.map((d) => d.rationale), homePersona.get(a.home_id) ?? null);
          }

          for (let i = 0; i < drafts.length; i++) {
            const d = drafts[i];
            const base = {
              automation_id: a.id,
              home_id: a.home_id,
              kind: d.kind,
              field: d.field,
              current_value: d.currentValue,
              proposed_value: d.proposedValue,
              rationale: d.rationale,
              ai_rationale: aiRationales[i] ?? null,
              confidence: d.confidence,
              evidence: { ...evidenceJson, diagnosis: d.diagnosis, alternative: d.alternative },
              expires_at: expiresAt,
              updated_at: nowIso,
            };
            const existingId = existingByKind.get(d.kind);
            if (existingId) {
              await db.from("automation_suggestions").update(base).eq("id", existingId);
            } else {
              await db.from("automation_suggestions").insert({ ...base, status: "active", created_at: nowIso });
            }
            written += 1;
          }
        } catch (err) {
          errors += 1;
          warn(FN, "automation_failed", { automationId: a.id, error: String(err) });
        }
      })
    ));

    log(FN, "analyse_complete", { automations: automations.length, suggestions: written, errors });
    return json({ automations: automations.length, suggestions: written, errors });
  } catch (err) {
    await captureException(FN, err);
    return json({ error: (err as Error).message }, 500);
  }
});
