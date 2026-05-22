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

  // Cron path: no callerUserId means we need a tier signal from the home
  // members. Pick the first owner-tier member to decide whether to use AI.
  // Fall back to fallback path when no tier info is recoverable.
  let aiTier = tier === "sage" || tier === "evergreen";
  if (!opts.callerUserId) {
    const { data: members } = await supabase
      .from("home_members")
      .select("user_profiles(subscription_tier)")
      .eq("home_id", opts.homeId)
      .limit(8);
    // deno-lint-ignore no-explicit-any
    const tiers = ((members ?? []) as any[])
      .map((m) => (m.user_profiles?.subscription_tier ?? "").toLowerCase());
    aiTier = tiers.some((t: string) => t === "sage" || t === "evergreen");
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
  });

  return {
    week_iso: weekIso,
    source,
    generated_at: generatedAt,
    picks,
    from_cache: false,
  };
}
