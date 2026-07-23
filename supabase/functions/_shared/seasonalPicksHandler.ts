/**
 * Shared seasonal-picks orchestrator — used by:
 *   - `plant-doctor` (`seasonal_picks` action) — on-demand per user request.
 *   - `refresh-seasonal-picks` cron — weekly pre-warm across warm homes.
 *
 * Owns the full lifecycle for one home:
 *   1. Cache read against `home_seasonal_picks` for the current ISO week.
 *   2. Context gathering — home / climate / tier / shed.
 *   3. Generation — Gemini for Sage+, deterministic fallback otherwise.
 *   4. Cache write (upsert).
 *
 * Caller controls AI usage attribution via `callerUserId`. The cron passes
 * null so the usage row doesn't land on any user's quota.
 */

import { log, warn, error as logError } from "./logger.ts";
import { callGeminiCascade, toMessages } from "./gemini.ts";
import { logAiUsage } from "./aiUsage.ts";
import { guardAiByHome } from "./aiGuard.ts";
import { loadPreferences } from "./preferences.ts";
import {
  SEASONAL_PICKS_SCHEMA,
  buildSeasonalPicksPrompt,
  isoWeekKey,
  normaliseSeasonalPicks,
  type SeasonalPick,
} from "./seasonalPicks.ts";
import { fallbackSeasonalPicks } from "./seasonalPicksFallback.ts";
import { bestLibraryMatch } from "./plantNameMatch.ts";

export interface GenerateSeasonalPicksOpts {
  homeId: string;
  apiKey: string;
  /** When true, bypass the cache and re-run generation. */
  forceRegen?: boolean;
  /** Reference "now" — defaults to current time. Tests pass a fixed Date. */
  now?: Date;
  /** Nullable — when omitted, AI usage is attributed at the system level. */
  callerUserId?: string | null;
  /** Function name to log against (`plant-doctor` for on-demand,
   *  `refresh-seasonal-picks` for the cron). */
  functionName: string;
}

export interface GenerateSeasonalPicksResult {
  week_iso: string;
  source: "ai" | "fallback";
  generated_at: string;
  picks: SeasonalPick[];
  /** True when the existing cached row was returned untouched. */
  from_cache: boolean;
}

export async function generateSeasonalPicksForHome(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: GenerateSeasonalPicksOpts,
): Promise<GenerateSeasonalPicksResult> {
  const now = opts.now ?? new Date();
  const weekIso = isoWeekKey(now);
  const FN = opts.functionName;

  // 1. Cache read.
  const { data: cachedRow } = await supabase
    .from("home_seasonal_picks")
    .select("source, picks, generated_at")
    .eq("home_id", opts.homeId)
    .eq("week_iso", weekIso)
    .maybeSingle();

  if (cachedRow && !opts.forceRegen) {
    return {
      week_iso: weekIso,
      source: cachedRow.source as "ai" | "fallback",
      generated_at: cachedRow.generated_at,
      picks: cachedRow.picks as SeasonalPick[],
      from_cache: true,
    };
  }

  // 2. Context — home / climate / tier / shed in parallel. Also load the
  //    caller's prefs when we have a user id (so on-demand picks honour
  //    explicit dislikes — cron path leaves prefs empty).
  const [homeRes, climateRes, profileRes, shedRes, userPrefs] = await Promise.all([
    supabase.from("homes").select("country, lat, lng").eq("id", opts.homeId).maybeSingle(),
    supabase
      .from("home_climate")
      .select("last_frost_iso, first_frost_iso")
      .eq("home_id", opts.homeId)
      .maybeSingle(),
    opts.callerUserId
      ? supabase
          .from("user_profiles")
          .select("subscription_tier")
          .eq("uid", opts.callerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("inventory_items")
      .select("plants(common_name, scientific_name)")
      .eq("home_id", opts.homeId)
      .eq("status", "Planted")
      .limit(80),
    opts.callerUserId
      ? loadPreferences(supabase, { userId: opts.callerUserId })
      : Promise.resolve([]),
  ]);

  const home = homeRes.data;
  const climate = climateRes.data;
  const tier = (profileRes.data?.subscription_tier as string | null)?.toLowerCase() ?? "sprout";

  // AI picks are part of the Evergreen-only insights experience (the deterministic
  // fallback serves every other tier). Cron path resolves the tier from members.
  let aiTier = tier === "evergreen";
  if (!opts.callerUserId) {
    const { data: members } = await supabase
      .from("home_members")
      .select("user_profiles(subscription_tier)")
      .eq("home_id", opts.homeId)
      .limit(8);
    // deno-lint-ignore no-explicit-any
    const tiers = ((members ?? []) as any[])
      .map((m) => (m.user_profiles?.subscription_tier ?? "").toLowerCase());
    aiTier = tiers.some((t: string) => t === "evergreen");
  }

  const hemisphere: "Northern" | "Southern" =
    typeof home?.lat === "number" ? (home.lat >= 0 ? "Northern" : "Southern") : "Northern";

  const shedList: { common_name: string; scientific_name: string | null }[] = [];
  for (
    const row of (shedRes.data ?? []) as {
      plants?: { common_name?: string; scientific_name?: string | null } | null;
    }[]
  ) {
    const plant = row.plants;
    if (plant?.common_name) {
      shedList.push({
        common_name: plant.common_name,
        scientific_name: plant.scientific_name ?? null,
      });
    }
  }

  const dislikes = (userPrefs as { sentiment: string; entity_name: string }[])
    .filter((p) => p.sentiment === "negative")
    .map((p) => p.entity_name)
    .join(", ");
  const shedCommonNames = shedList.map((s) => s.common_name);

  // 3. Generate — AI for Sage+, fallback for everyone else (or AI failure).
  let picks: SeasonalPick[] = [];
  let source: "ai" | "fallback" = "fallback";

  if (aiTier) {
    const guardErr = await guardAiByHome(supabase, opts.homeId);
    if (guardErr) {
      warn(FN, "seasonal_picks_ai_gate_blocked_fallback", { homeId: opts.homeId });
      picks = fallbackSeasonalPicks({
        currentDate: now,
        hemisphere,
        edibleFocus: null,
        effortPreference: null,
        shedCommonNames,
      }).picks;
      source = "fallback";
    } else {
      try {
        const prompt = buildSeasonalPicksPrompt({
          currentDate: now.toISOString().split("T")[0],
          hemisphere,
          weekIso,
          country: home?.country ?? null,
          lat: typeof home?.lat === "number" ? home.lat : null,
          lng: typeof home?.lng === "number" ? home.lng : null,
          lastFrostIso: climate?.last_frost_iso ?? null,
          firstFrostIso: climate?.first_frost_iso ?? null,
          edibleFocus: null,
          effortPreference: null,
          dislikes: dislikes || null,
          shed: shedList,
        });

        const { text: rawText, usage } = await callGeminiCascade(
          opts.apiKey, FN, toMessages([prompt]),
          { responseSchema: SEASONAL_PICKS_SCHEMA, logContext: { homeId: opts.homeId } },
        );
        await logAiUsage(supabase, {
          homeId: opts.homeId,
          userId: opts.callerUserId ?? null,
          functionName: FN,
          action: "seasonal_picks",
          usage,
          contextBlock: prompt,
          prompt,
          rawResult: rawText,
        });
        const parsed = JSON.parse(rawText);
        const normalised = normaliseSeasonalPicks(parsed);

        if (normalised && normalised.picks.length >= 4) {
          picks = normalised.picks;
          source = "ai";
        } else {
          warn(FN, "seasonal_picks_ai_response_unusable", {
            homeId: opts.homeId,
            count: normalised?.picks.length ?? 0,
          });
          picks = fallbackSeasonalPicks({
            currentDate: now,
            hemisphere,
            edibleFocus: null,
            effortPreference: null,
            shedCommonNames,
          }).picks;
          source = "fallback";
        }
      } catch (aiErr) {
        warn(FN, "seasonal_picks_ai_error_fallback", {
          error: (aiErr as Error).message,
        });
        picks = fallbackSeasonalPicks({
          currentDate: now,
          hemisphere,
          edibleFocus: null,
          effortPreference: null,
          shedCommonNames,
        }).picks;
        source = "fallback";
      }
    }
  } else {
    picks = fallbackSeasonalPicks({
      currentDate: now,
      hemisphere,
      edibleFocus: null,
      effortPreference: null,
      shedCommonNames,
    }).picks;
    source = "fallback";
  }

  // 3.5. Resolve plant_library_id for each pick. Library hits skip
  //      Gemini when the pick is later opened — we just clone the
  //      stored care guide. Library misses are kicked back to the
  //      seed-plant-library edge fn (fire-and-forget) so next week's
  //      picks have a hit.
  picks = await attachPlantLibraryIds(supabase, picks);
  const missingFromLibrary = picks.filter((p) => !p.plant_library_id);
  if (missingFromLibrary.length > 0) {
    // Fire-and-forget — don't hold up the picks response. The seeder
    // returns 202 quickly; the actual enrichment happens in its own
    // background task.
    fireBackgroundLibrarySeed(missingFromLibrary, FN).catch((err) =>
      warn(FN, "library_seed_invoke_failed", { error: (err as Error).message }),
    );
  }

  // 4. Cache write (service-role bypasses RLS).
  const generatedAt = new Date().toISOString();
  const { error: upsertErr } = await supabase
    .from("home_seasonal_picks")
    .upsert(
      {
        home_id: opts.homeId,
        week_iso: weekIso,
        source,
        picks,
        generated_at: generatedAt,
      },
      { onConflict: "home_id,week_iso" },
    );
  if (upsertErr) {
    logError(FN, "seasonal_picks_upsert_failed", { error: upsertErr.message });
    // Caller still gets the freshly generated picks — next call will retry the write.
  }

  log(FN, "seasonal_picks_generated", {
    homeId: opts.homeId,
    weekIso,
    source,
    count: picks.length,
    library_hits: picks.length - missingFromLibrary.length,
    library_seeds_fired: missingFromLibrary.length,
  });

  return {
    week_iso: weekIso,
    source,
    generated_at: generatedAt,
    picks,
    from_cache: false,
  };
}

/**
 * Compute the same `scientific_name_key` that plant_library's generated
 * column uses — lowercased, whitespace-collapsed binomial (falling back
 * to common_name when sci is empty).
 */
function computeSciKey(sci: string | null | undefined, common: string): string {
  const raw = (sci?.trim() || common.trim() || "").replace(/\s+/g, " ");
  return raw.toLowerCase();
}

/**
 * For each pick, look up `plant_library` by `scientific_name_key`
 * (the authoritative generated dedup key on the library). Returns a
 * new array with `plant_library_id` populated when a match is found.
 */
async function attachPlantLibraryIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  picks: SeasonalPick[],
): Promise<SeasonalPick[]> {
  if (picks.length === 0) return picks;

  const keysByPick = picks.map((p) => computeSciKey(p.scientific_name, p.common_name));
  const uniqueKeys = Array.from(new Set(keysByPick.filter((k) => !!k)));
  if (uniqueKeys.length === 0) {
    return picks.map((p) => ({ ...p, plant_library_id: null }));
  }

  // Fetch ALL rows per key (not just the first) so we can pick the one that
  // genuinely IS this plant by name — a shared scientific_name_key alone attached
  // a lettuce cultivar to whatever single Lactuca sativa row existed (a DIFFERENT
  // cultivar), inheriting its name + sparse data.
  const { data } = await supabase
    .from("plant_library")
    .select("id, common_name, scientific_name_key")
    .in("scientific_name_key", uniqueKeys);

  const candidatesByKey = new Map<string, Array<{ id: number; common_name: string }>>();
  for (const row of (data ?? []) as Array<{ id: number; common_name: string; scientific_name_key: string }>) {
    if (!row.scientific_name_key) continue;
    const list = candidatesByKey.get(row.scientific_name_key) ?? [];
    list.push({ id: row.id, common_name: row.common_name });
    candidatesByKey.set(row.scientific_name_key, list);
  }

  return picks.map((p, i) => ({
    ...p,
    // Only attach when a candidate is a genuine identity match (exact name or the
    // generic species this pick extends). A different same-species cultivar → null
    // → the pick resolves via the AI care path with its own name + data.
    plant_library_id: bestLibraryMatch(p.common_name, candidatesByKey.get(keysByPick[i]) ?? []),
  }));
}

/**
 * Fire-and-forget call to seed-plant-library for picks that aren't in
 * the library yet. Returns immediately — the seeder responds 202 and
 * processes in its own background task.
 */
async function fireBackgroundLibrarySeed(
  missing: SeasonalPick[],
  callerFn: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const plantNames = missing.map((p) => ({
    name: p.common_name,
    sciName: p.scientific_name || null,
  }));

  const res = await fetch(`${supabaseUrl}/functions/v1/seed-plant-library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      plantNames,
      triggered_by: `seasonal_picks:${callerFn}`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`seed-plant-library returned ${res.status}: ${text.slice(0, 200)}`);
  }
}
