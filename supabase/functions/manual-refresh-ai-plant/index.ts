// manual-refresh-ai-plant
//
// "Refresh Care Guide" button on Plant Edit Modal. Single endpoint covering
// every AI plant the user might be looking at — orphan, shallow fork, or
// pure global. NEVER calls Gemini. The daily cron (refresh-stale-ai-plants)
// is the only thing that re-runs Gemini; this function just **applies
// pending catalogue updates** to the home row when there's a delta vs the
// user's `user_plant_ack.seen_freshness_version`.
//
// Pipeline for a home plant (the common case):
//   1. Load + validate (AI source, caller is a home member).
//   2. Resolve the global parent:
//        - row IS the global → use it (rare; home_id IS NULL implies the
//          user is somehow viewing a global directly).
//        - forked_from_plant_id set → that's the global.
//        - orphan (home_id != NULL, forked_from NULL) → look up an existing
//          global by scientific_name_key OR common_name. If none, promote
//          THIS home row's data as the new global (no Gemini needed) +
//          link.
//   3. Compute the visible-field diff between home top-level columns and
//      global top-level columns (or care_guide_data.plantData fallback if
//      the global's top-level cols are missing — older cron output).
//   4. If anything changed → UPDATE the home row's visible-field columns
//      from the global's values + upsert ack at the global's freshness
//      version + return changed_fields.
//   5. If nothing changed → just upsert ack defensively + return up-to-date.
//
// Rate limit (env: AI_REFRESH_RATE_LIMIT_MINUTES, default 7 days) is kept as
// a button-spam guard. With no Gemini cost, this is purely a UX concern.
//
// Tier gate (Sage+) is kept for now to preserve the existing access model.
// We could relax this later — a no-Gemini refresh is cheap — but that's a
// separate product decision.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import {
  diffCareGuide,
  normaliseScientificKey,
  USER_VISIBLE_CARE_FIELDS,
} from "../_shared/aiPlantCatalogue.ts";

const FN = "manual-refresh-ai-plant";

const RATE_LIMIT_MINUTES = (() => {
  const raw = Deno.env.get("AI_REFRESH_RATE_LIMIT_MINUTES");
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 7 * 24 * 60; // 7 days
})();
const RATE_LIMIT_MS = RATE_LIMIT_MINUTES * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PlantRow = Record<string, unknown> & {
  id: number;
  source: string | null;
  home_id: string | null;
  forked_from_plant_id: number | null;
  overridden_fields: string[] | null;
  freshness_version: number | null;
  scientific_name_key: string | null;
  common_name: string;
  care_guide_data: unknown;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;
    const callerUserId = authResult.user.id;

    const body = await req.json().catch(() => ({}));
    // Accept either `homePlantId` (preferred — the row the user is looking
    // at) or `plantId` (legacy — used to mean the global id; now we just
    // treat it the same way and let the resolver figure it out).
    const inputPlantId = Number(body.homePlantId ?? body.plantId);
    if (!inputPlantId || !Number.isFinite(inputPlantId)) {
      return jsonError(400, "plantId or homePlantId required");
    }

    // 1. Load the input plant row.
    const { data: inputRowRaw, error: inputErr } = await supabase
      .from("plants")
      .select("*")
      .eq("id", inputPlantId)
      .maybeSingle();
    if (inputErr || !inputRowRaw) {
      return jsonError(404, "plant_not_found");
    }
    const inputRow = inputRowRaw as PlantRow;
    if (inputRow.source !== "ai") {
      return jsonError(400, "not_an_ai_plant");
    }

    // Tier gate — Sage+ only.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("ai_enabled")
      .eq("uid", callerUserId)
      .maybeSingle();
    if (!profile?.ai_enabled) {
      return jsonError(403, "ai_tier_required");
    }

    // 2. Membership check — caller must belong to the row's home (or the row
    //    is a global, in which case any signed-in AI-enabled user can poke it).
    if (inputRow.home_id) {
      const { data: membership } = await supabase
        .from("home_members")
        .select("user_id")
        .eq("home_id", inputRow.home_id)
        .eq("user_id", callerUserId)
        .maybeSingle();
      if (!membership) {
        return jsonError(403, "not_a_home_member");
      }
    }

    // 3. Rate limit (per user, per global plant).
    const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { data: recent } = await supabase
      .from("ai_plant_manual_refresh_log")
      .select("refreshed_at")
      .eq("user_id", callerUserId)
      .eq("plant_id", inputPlantId)
      .gt("refreshed_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      const nextEligible = new Date(new Date(recent[0].refreshed_at).getTime() + RATE_LIMIT_MS);
      return new Response(JSON.stringify({
        error: "rate_limited",
        retry_after: nextEligible.toISOString(),
        rate_limit_minutes: RATE_LIMIT_MINUTES,
      }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Resolve the global parent.
    const resolved = await resolveGlobal(supabase, inputRow, callerUserId);
    if (!resolved.ok) {
      return jsonError(500, resolved.error);
    }
    const globalRow = resolved.global;
    const homeRow = resolved.home;  // null when the user is viewing a global directly

    // 5. Compute the visible-field diff between home and global (when a home
    //    row exists). For global-only views, treat as "up to date".
    let changedFields: string[] = [];
    if (homeRow) {
      // Compare home's top-level columns to the global's. Fall back to the
      // global's care_guide_data.plantData if the global's top-level cols
      // aren't populated (older cron data).
      const globalView = mergeWithCareGuide(globalRow);
      const diff = diffCareGuide(homeRow, globalView);
      changedFields = diff.fieldNames;

      if (changedFields.length > 0) {
        // Apply only the user-visible fields the diff flagged. Preserves any
        // overridden_fields the user has set (currently always [] on a
        // shallow fork — deep forks are excluded by the freshness hook
        // before this function is even called).
        const patch: Record<string, unknown> = {};
        const overridden = new Set(homeRow.overridden_fields ?? []);
        for (const field of changedFields) {
          if (overridden.has(field)) continue;
          patch[field] = (globalView as Record<string, unknown>)[field];
        }
        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await supabase
            .from("plants")
            .update(patch)
            .eq("id", homeRow.id);
          if (updErr) {
            warn(FN, "home-sync-failed", { error: updErr.message, homeId: homeRow.id });
          }
        }
      }
    }

    // 6. Upsert user_plant_ack at the global's current freshness_version.
    //    Defensive — clears any stale chip even when there were no field changes.
    const ackVersion = globalRow.freshness_version ?? 1;
    await supabase.from("user_plant_ack").upsert({
      user_id: callerUserId,
      plant_id: globalRow.id,
      seen_freshness_version: ackVersion,
      acked_at: new Date().toISOString(),
    }, { onConflict: "user_id,plant_id" });

    // 7. Record the refresh attempt for rate-limit accounting.
    await supabase.from("ai_plant_manual_refresh_log").insert({
      user_id: callerUserId,
      plant_id: inputPlantId,
      refreshed_at: new Date().toISOString(),
    });

    log(FN, "result", {
      inputPlantId,
      globalPlantId: globalRow.id,
      changed: changedFields.length > 0,
      changedFields,
      freshnessVersion: ackVersion,
      orphanHealed: resolved.orphanHealed,
    });

    return new Response(JSON.stringify({
      changed: changedFields.length > 0,
      changed_fields: changedFields,
      freshness_version: ackVersion,
      global_plant_id: globalRow.id,
      orphan_healed: resolved.orphanHealed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(FN, "error", { error: message });
    await captureException(FN, err, {});
    return jsonError(500, message);
  }

  function jsonError(status: number, code: string) {
    return new Response(JSON.stringify({ error: code }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Global resolution
// ──────────────────────────────────────────────────────────────────────────

type ResolveOk = {
  ok: true;
  global: PlantRow;
  home: PlantRow | null;
  orphanHealed: boolean;
};
type ResolveErr = { ok: false; error: string };

/**
 * Given the row the user clicked Refresh on, return:
 *   - the global plant row (always, even if we just created one)
 *   - the home plant row (null if the user is viewing a pure global)
 *   - orphanHealed flag (true if we linked or created a global this call)
 *
 * Handles three cases:
 *   - input row IS the global → return as-is
 *   - input row has forked_from_plant_id → load that global
 *   - input row is an orphan home AI row → find or create + link
 */
async function resolveGlobal(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: PlantRow,
  _callerUserId: string,
): Promise<ResolveOk | ResolveErr> {
  // Case 1 — input is the global.
  if (input.home_id == null) {
    return { ok: true, global: input, home: null, orphanHealed: false };
  }

  // Case 2 — input has a parent link.
  if (input.forked_from_plant_id != null) {
    const { data: parent } = await supabase
      .from("plants")
      .select("*")
      .eq("id", input.forked_from_plant_id)
      .maybeSingle();
    if (parent) {
      return { ok: true, global: parent as PlantRow, home: input, orphanHealed: false };
    }
    // Parent was deleted — treat as orphan and re-link below.
  }

  // Case 3 — orphan. Look up by scientific_name_key OR common_name.
  const candidateKeys: string[] = [];
  if (input.scientific_name_key) candidateKeys.push(input.scientific_name_key);
  const fallbackKey = normaliseScientificKey([], input.common_name);
  if (fallbackKey && !candidateKeys.includes(fallbackKey)) candidateKeys.push(fallbackKey);

  let foundGlobal: PlantRow | null = null;
  if (candidateKeys.length > 0) {
    const { data } = await supabase
      .from("plants")
      .select("*")
      .eq("source", "ai")
      .is("home_id", null)
      .in("scientific_name_key", candidateKeys)
      .limit(1);
    foundGlobal = (data?.[0] ?? null) as PlantRow | null;
  }
  if (!foundGlobal) {
    const { data } = await supabase
      .from("plants")
      .select("*")
      .eq("source", "ai")
      .is("home_id", null)
      .ilike("common_name", input.common_name)
      .limit(1);
    foundGlobal = (data?.[0] ?? null) as PlantRow | null;
  }

  // Case 3a — found existing global. Link this home row and return.
  if (foundGlobal) {
    const { error: linkErr } = await supabase
      .from("plants")
      .update({ forked_from_plant_id: foundGlobal.id })
      .eq("id", input.id);
    if (linkErr) {
      return { ok: false, error: "link_to_global_failed" };
    }
    return { ok: true, global: foundGlobal, home: input, orphanHealed: true };
  }

  // Case 3b — no existing global. Promote this home row's data as the new
  // global (no Gemini call). The home row's current values become the
  // catalogue seed.
  const promotedPayload: Record<string, unknown> = {
    id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
    source: "ai",
    home_id: null,
    common_name: input.common_name,
    scientific_name: (input as Record<string, unknown>).scientific_name ?? [],
    thumbnail_url: (input as Record<string, unknown>).thumbnail_url ?? null,
    care_guide_data: input.care_guide_data ?? buildCareGuideFromTopLevel(input),
    freshness_version: 1,
    last_care_generated_at: new Date().toISOString(),
  };
  // Carry over the user-visible top-level columns so the catalogue row has
  // authoritative values to share with future users.
  for (const f of USER_VISIBLE_CARE_FIELDS) {
    if ((input as Record<string, unknown>)[f] !== undefined) {
      promotedPayload[f] = (input as Record<string, unknown>)[f];
    }
  }

  const { data: promoted, error: insertErr } = await supabase
    .from("plants")
    .insert(promotedPayload)
    .select("*")
    .maybeSingle();

  if (promoted) {
    // Link the home row to the new global.
    await supabase
      .from("plants")
      .update({ forked_from_plant_id: promoted.id })
      .eq("id", input.id);
    return { ok: true, global: promoted as PlantRow, home: input, orphanHealed: true };
  }

  if (insertErr) {
    // Race: another caller inserted first. Re-read by both candidate keys.
    if (candidateKeys.length > 0) {
      const { data: existing } = await supabase
        .from("plants")
        .select("*")
        .eq("source", "ai")
        .is("home_id", null)
        .in("scientific_name_key", candidateKeys)
        .limit(1);
      const raced = (existing?.[0] ?? null) as PlantRow | null;
      if (raced) {
        await supabase.from("plants").update({ forked_from_plant_id: raced.id }).eq("id", input.id);
        return { ok: true, global: raced, home: input, orphanHealed: true };
      }
    }
    warn(FN, "promote-failed", { error: insertErr.message, inputId: input.id });
    return { ok: false, error: "promote_to_global_failed" };
  }

  return { ok: false, error: "promote_to_global_failed" };
}

/**
 * Merge a global's top-level columns with its `care_guide_data.plantData`,
 * letting top-level columns win ONLY when they're populated. Empty arrays
 * and nulls fall back to care_guide_data — critical because globals created
 * before the cron's top-level sync (Wave 7 simplification) have empty
 * top-level columns even though their care_guide_data is fully populated.
 *
 * Acts as a single "source of truth" view of the catalogue's current values.
 */
function mergeWithCareGuide(global: PlantRow): Record<string, unknown> {
  const fromCareGuide = (() => {
    const cgd = global.care_guide_data;
    if (!cgd || typeof cgd !== "object") return {};
    const wrapped = (cgd as { plantData?: Record<string, unknown> }).plantData;
    return (wrapped && typeof wrapped === "object")
      ? wrapped
      : (cgd as Record<string, unknown>);
  })();
  const merged: Record<string, unknown> = { ...fromCareGuide };
  for (const f of USER_VISIBLE_CARE_FIELDS) {
    const v = (global as Record<string, unknown>)[f];
    const isMissing = v == null || (Array.isArray(v) && v.length === 0);
    if (!isMissing) merged[f] = v;
  }
  return merged;
}

/**
 * Build a care_guide_data jsonb from a row's top-level columns when the row
 * doesn't have one. Used only when promoting an orphan home row to a global.
 */
function buildCareGuideFromTopLevel(row: PlantRow): { plantData: Record<string, unknown> } {
  const plantData: Record<string, unknown> = {};
  for (const f of USER_VISIBLE_CARE_FIELDS) {
    const v = (row as Record<string, unknown>)[f];
    if (v !== undefined && v !== null) plantData[f] = v;
  }
  plantData.common_name = row.common_name;
  const sn = (row as Record<string, unknown>).scientific_name;
  if (sn !== undefined) plantData.scientific_name = sn;
  return { plantData };
}
