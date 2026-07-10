// Garden Brain Phase 3 — nightly photo-timeline scan.
//
// Daily cron (04:00 UTC, before the 04:30 Daily Brief) or on-demand
// { homeId }. For each Sage/Evergreen home with recent member activity:
// analyse up to MAX_PHOTOS_PER_HOME new plant-linked journal photos with a
// SCHEMA-ENFORCED vision call (flash ladder — passive monitoring must be
// cheap; the Pro ladder stays reserved for on-demand Plant Doctor), validate
// against the closed action vocabulary, store photo_observations, and apply
// high-confidence growth-stage corrections. `concern` rows feed the brief.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade, DEFAULT_MODELS, type GeminiMessage } from "../_shared/gemini.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { extractJsonObject } from "../_shared/extractJson.ts";
import {
  buildPhotoPrompt,
  MAX_IMAGE_BYTES,
  PHOTO_OBSERVATION_SCHEMA,
  selectPhotos,
  shouldApplyStage,
  validateObservation,
  type CandidatePhoto,
} from "../_shared/scanJournalPhotos.ts";

const FN = "scan-journal-photos";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ELIGIBLE_TIERS = new Set(["sage", "evergreen"]);

async function fetchImageBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null; // size guard
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { base64: btoa(binary), mimeType };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) {
      log(FN, "no_api_key_skip", {});
      return new Response(JSON.stringify({ success: true, skipped: "no api key" }), { headers: corsHeaders });
    }
    const body = await req.json().catch(() => ({}));
    const onlyHomeId: string | null = body?.homeId ?? null;
    const todayIso = new Date().toISOString();

    // ── Home set (mirror Phase 2: activity-filtered on the cron path). ──────
    let homeIds: string[] = [];
    if (onlyHomeId) {
      homeIds = [onlyHomeId];
    } else {
      const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: activeUsers } = await db.from("user_events").select("user_id").gte("created_at", since7d).limit(5000);
      const activeSet = [...new Set(((activeUsers ?? []) as Array<{ user_id: string }>).map((u) => u.user_id))];
      if (activeSet.length === 0) return new Response(JSON.stringify({ success: true, homes: 0 }), { headers: corsHeaders });
      const { data: memberRows } = await db.from("home_members").select("home_id, user_id").in("user_id", activeSet);
      homeIds = [...new Set(((memberRows ?? []) as Array<{ home_id: string }>).map((m) => m.home_id))];
    }

    let homesProcessed = 0, photosAnalysed = 0, stagesApplied = 0, concerns = 0;

    for (const homeId of homeIds) {
      // Tier gate — owner (same rule as Phases 1–2).
      const { data: owner } = await db.from("home_members").select("user_id").eq("home_id", homeId).eq("role", "owner").limit(1).maybeSingle();
      if (!owner) continue;
      const { data: prof } = await db.from("user_profiles").select("subscription_tier").eq("uid", owner.user_id).maybeSingle();
      if (!ELIGIBLE_TIERS.has(prof?.subscription_tier ?? "")) continue;
      homesProcessed += 1;

      // Candidate photos: plant-linked journals in the window, not yet observed.
      const sinceWindow = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [{ data: journals }, { data: observed }] = await Promise.all([
        db.from("plant_journals")
          .select("id, inventory_item_id, image_url, created_at")
          .eq("home_id", homeId)
          .not("image_url", "is", null)
          .not("inventory_item_id", "is", null)
          .gte("created_at", sinceWindow),
        db.from("photo_observations").select("journal_id").eq("home_id", homeId).gte("created_at", sinceWindow),
      ]);
      const observedSet = new Set(((observed ?? []) as Array<{ journal_id: string }>).map((o) => o.journal_id));
      const candidates: CandidatePhoto[] = ((journals ?? []) as Array<{ id: string; inventory_item_id: string | null; image_url: string | null; created_at: string }>)
        .map((j) => ({
          journal_id: j.id,
          inventory_item_id: j.inventory_item_id,
          image_url: j.image_url,
          created_at: j.created_at,
          alreadyObserved: observedSet.has(j.id),
        }));
      const selected = selectPhotos(candidates, todayIso);
      if (selected.length === 0) continue;

      // Instance names + current stages for the prompts.
      const itemIds = [...new Set(selected.map((s) => s.inventory_item_id!))];
      const { data: items } = await db.from("inventory_items")
        .select("id, plant_name, nickname, growth_state")
        .in("id", itemIds);
      const itemById = new Map(((items ?? []) as Array<{ id: string; plant_name: string | null; nickname: string | null; growth_state: string | null }>).map((i) => [i.id, i]));

      for (const photo of selected) {
        const item = itemById.get(photo.inventory_item_id!);
        if (!item) continue;
        const img = await fetchImageBase64(photo.image_url!);
        if (!img) continue; // deleted/huge/non-image — window expires the retry

        const plantName = item.nickname || item.plant_name || "plant";
        const prompt = buildPhotoPrompt(plantName, item.growth_state);
        const messages: GeminiMessage[] = [{
          role: "user",
          parts: [{ text: prompt }, { inlineData: { data: img.base64, mimeType: img.mimeType } }],
        }];

        const t0 = Date.now();
        try {
          const { text, usage } = await callGeminiCascade(apiKey, FN, messages, {
            models: DEFAULT_MODELS, // flash-lite-led — passive monitoring stays cheap
            temperature: 0.2,
            maxOutputTokens: 600,
            responseSchema: PHOTO_OBSERVATION_SCHEMA,
            logContext: { homeId },
          });
          await logAiUsage(db, { functionName: FN, action: "photo_observation", usage, durationMs: Date.now() - t0, status: "ok", userId: owner.user_id, homeId, prompt: prompt.slice(0, 2000), rawResult: text.slice(0, 2000) });

          const validated = validateObservation(extractJsonObject(text));
          if (!validated) { warn(FN, "unparseable_observation", { homeId, journal: photo.journal_id }); continue; }

          const applyStage = shouldApplyStage(validated.growth_stage, item.growth_state, validated.confidence);
          const { error: insErr } = await db.from("photo_observations").insert({
            home_id: homeId,
            inventory_item_id: photo.inventory_item_id,
            journal_id: photo.journal_id,
            observed_at: photo.created_at,
            growth_stage: validated.growth_stage,
            health: validated.health,
            findings: validated.findings,
            confidence: validated.confidence,
            stage_applied: applyStage,
            actions: validated.actions,
            model: usage.model,
          });
          if (insErr) { warn(FN, "observation_insert_failed", { homeId, error: insErr.message }); continue; }

          photosAnalysed += 1;
          if (validated.health === "concern") concerns += 1;
          if (applyStage) {
            const { error: stErr } = await db.from("inventory_items")
              .update({ growth_state: validated.growth_stage })
              .eq("id", photo.inventory_item_id);
            if (!stErr) stagesApplied += 1;
          }
        } catch (err) {
          await logAiUsage(db, { functionName: FN, action: "photo_observation", durationMs: Date.now() - t0, status: "error", error: err instanceof Error ? err.message : String(err), userId: owner.user_id, homeId });
          warn(FN, "photo_analysis_failed", { homeId, journal: photo.journal_id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    log(FN, "complete", { homes: homesProcessed, photosAnalysed, stagesApplied, concerns });
    return new Response(JSON.stringify({ success: true, homes: homesProcessed, photosAnalysed, stagesApplied, concerns }), { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: message }), { headers: corsHeaders, status: 500 });
  }
});
