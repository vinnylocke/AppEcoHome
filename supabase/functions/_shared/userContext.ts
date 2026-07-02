/**
 * Shared user context builder for AI edge functions.
 *
 * Loads user identity, garden structure, preferences, recent behaviour,
 * and weather into a single typed object that can be rendered as a
 * compact prompt block (~400–600 tokens at full breadth).
 *
 * Usage:
 *   const ctx = await buildUserContext(supabase, { userId, homeId });
 *   const block = renderContextBlock(ctx, ["identity","location","garden","preferences","weather"]);
 *   // Inject `block` into your system prompt.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { loadPreferences, formatPreferencesBlock } from "./preferences.ts";
import type { Preference } from "./preferences.ts";
import { deriveClimate, frostDatesForHome } from "./climateZones.ts";
import { reverseGeocodeCity } from "./locationContext.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type Hemisphere = "Northern" | "Southern";
export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export interface UserContextArea {
  id: string;
  name: string;
  locationName: string | null;
  isOutside: boolean;
  growingMedium: string | null;
  mediumPh: number | null;
}

export interface UserContextInventoryItem {
  id: string;
  plantName: string;
  nickname: string | null;
  status: string;
  areaName: string | null;
  areaId: string | null;
  plantedAt: string | null;
  growthState: string | null;
}

export interface UserContextTask {
  title: string;
  type: string;
  dueDate: string;
  areaName: string | null;
}

export interface UserContextBehaviour {
  completedCount: number;
  postponedCount: number;
  skippedCount: number;
  postponeRate: number;
  topTaskTypes: string[];
  recentEventCount: number;
}

export interface UserContextWeather {
  nowTempC: number | null;
  nowCondition: string | null;
  next7DaysSummary: string | null;
  upcomingFrostRisk: boolean;
  upcomingHeatwave: boolean;
}

export interface UserContext {
  // Identity
  userId: string | null;
  homeId: string | null;
  displayName: string | null;
  firstName: string | null;
  subscriptionTier: string | null;
  quizCompleted: boolean;
  // Location
  country: string | null;
  locationCity: string | null;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
  hemisphere: Hemisphere;
  currentSeason: Season;
  currentMonth: string;
  isoDate: string;
  // Climate
  climateZone: string | null;
  frostFirstDate: string | null;
  frostLastDate: string | null;
  // Garden
  areas: UserContextArea[];
  inventory: UserContextInventoryItem[];
  upcomingTasks: UserContextTask[];
  // Memory
  preferences: Preference[];
  // Behaviour (last 30 days)
  behaviour: UserContextBehaviour;
  // Weather
  weather: UserContextWeather | null;
}

export type ContextSection =
  | "identity"
  | "location"
  | "garden"
  | "tasks"
  | "preferences"
  | "behaviour"
  | "weather";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getSeason(hemisphere: Hemisphere, monthNum: number): Season {
  const northSeason: Season =
    monthNum >= 3 && monthNum <= 5 ? "Spring"
    : monthNum >= 6 && monthNum <= 8 ? "Summer"
    : monthNum >= 9 && monthNum <= 11 ? "Autumn"
    : "Winter";

  if (hemisphere === "Northern") return northSeason;
  const flip: Record<Season, Season> = {
    Spring: "Autumn", Summer: "Winter", Autumn: "Spring", Winter: "Summer",
  };
  return flip[northSeason];
}

// ── Builder ──────────────────────────────────────────────────────────────────

export interface BuildUserContextOpts {
  userId?: string | null;
  homeId?: string | null;
  /** Skip expensive sections when not needed. Defaults to all. */
  skip?: ContextSection[];
}

export async function buildUserContext(
  db: SupabaseClient,
  opts: BuildUserContextOpts,
): Promise<UserContext> {
  const { userId, homeId } = opts;
  const skip = new Set(opts.skip ?? []);

  const now = new Date();
  const isoDate = now.toISOString().split("T")[0];

  // ── Parallel fetches ───────────────────────────────────────────────────────

  const [profileResult, homeResult, areasResult, inventoryResult, tasksResult, quizResult, weatherResult, behaviourSummaryResult, behaviourLiveResult] =
    await Promise.all([
      // Profile
      userId
        ? db.from("user_profiles")
            .select("display_name, first_name, subscription_tier")
            .eq("uid", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Home / location
      homeId
        ? db.from("homes")
            .select("country, timezone, lat, lng, climate_zone, frost_first_date, frost_last_date")
            .eq("id", homeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Areas (via locations)
      homeId && !skip.has("garden")
        ? db.from("areas")
            .select("id, name, growing_medium, medium_ph, locations(name, home_id, is_outside)")
            .eq("locations.home_id", homeId)
        : Promise.resolve({ data: [] }),

      // Inventory
      homeId && !skip.has("garden")
        ? db.from("inventory_items")
            .select("id, plant_name, nickname, status, area_id, planted_at, growth_state, areas(name)")
            .eq("home_id", homeId)
            .eq("status", "Planted")
            .limit(40)
        : Promise.resolve({ data: [] }),

      // Upcoming tasks (next 7 days)
      homeId && !skip.has("tasks")
        ? db.from("tasks")
            .select("title, type, due_date, areas(name)")
            .eq("home_id", homeId)
            .eq("status", "Pending")
            .gte("due_date", isoDate)
            .lte("due_date", new Date(Date.now() + 7 * 864e5).toISOString().split("T")[0])
            .order("due_date", { ascending: true })
            .limit(15)
        : Promise.resolve({ data: [] }),

      // Quiz completion
      userId && homeId
        ? db.from("home_quiz_completions")
            .select("id")
            .eq("home_id", homeId)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Latest weather snapshot
      homeId && !skip.has("weather")
        ? db.from("weather_snapshots")
            .select("data")
            .eq("home_id", homeId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Behaviour: pre-computed nightly summary (preferred — ~100ms faster than live scan)
      userId && !skip.has("behaviour")
        ? db.from("user_behaviour_summary")
            .select("tasks_completed, tasks_postponed, tasks_skipped, postpone_rate, top_task_types, computed_at")
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Behaviour: live fallback (used when summary is missing or stale > 25h)
      userId && !skip.has("behaviour")
        ? db.from("user_events")
            .select("event_type, meta")
            .eq("user_id", userId)
            .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] }),
    ]);

  // ── Preferences (uses userId preferentially) ───────────────────────────────
  const preferences = !skip.has("preferences")
    ? await loadPreferences(db, userId ? { userId } : homeId ? { homeId } : {})
    : [];

  // ── Derive location values ─────────────────────────────────────────────────
  const home = homeResult.data;
  const lat = home?.lat ?? null;
  const lng = home?.lng ?? null;
  const country = home?.country ?? null;
  const timezone = home?.timezone ?? null;
  const hemisphere: Hemisphere = (lat ?? 0) >= 0 ? "Northern" : "Southern";
  const localNow = timezone
    ? new Date(now.toLocaleString("en-US", { timeZone: timezone }))
    : now;
  const monthNum = localNow.getMonth() + 1;
  const currentMonth = localNow.toLocaleString("en-GB", { month: "long" });
  const currentSeason = getSeason(hemisphere, monthNum);

  // Climate zone: use DB column if backfilled, otherwise derive on-the-fly from lat.
  const climateZone: string | null = home?.climate_zone ??
    (lat !== null ? deriveClimate(lat).zone : null);
  const frostDates = lat !== null
    ? frostDatesForHome(lat, now.getFullYear())
    : { frostFirstDate: null, frostLastDate: null };
  const frostFirstDate: string | null = home?.frost_first_date ?? frostDates.frostFirstDate;
  const frostLastDate: string | null  = home?.frost_last_date  ?? frostDates.frostLastDate;

  // Reverse-geocode to city/town — only when location section is needed.
  // Falls back to null gracefully; callers then render country only.
  const locationCity: string | null =
    !skip.has("location") && lat !== null && lng !== null
      ? await reverseGeocodeCity(lat, lng)
      : null;

  // ── Profile ────────────────────────────────────────────────────────────────
  const profile = profileResult.data;

  // ── Areas ─────────────────────────────────────────────────────────────────
  const rawAreas: UserContextArea[] = ((areasResult.data ?? []) as any[])
    .filter((a) => a.locations?.home_id === homeId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      locationName: a.locations?.name ?? null,
      isOutside: a.locations?.is_outside ?? false,
      growingMedium: a.growing_medium ?? null,
      mediumPh: a.medium_ph ?? null,
    }));

  // ── Inventory ──────────────────────────────────────────────────────────────
  const inventory: UserContextInventoryItem[] = ((inventoryResult.data ?? []) as any[]).map((i) => ({
    id: i.id,
    plantName: i.plant_name,
    nickname: i.nickname ?? null,
    status: i.status,
    areaName: i.areas?.name ?? null,
    areaId: i.area_id ?? null,
    plantedAt: i.planted_at ?? null,
    growthState: i.growth_state ?? null,
  }));

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const upcomingTasks: UserContextTask[] = ((tasksResult.data ?? []) as any[]).map((t) => ({
    title: t.title,
    type: t.type,
    dueDate: t.due_date,
    areaName: t.areas?.name ?? null,
  }));

  // ── Behaviour ─────────────────────────────────────────────────────────────
  // Use the pre-computed nightly summary when it exists and was computed within 25 hours.
  // Fall back to a live scan of user_events when the summary is absent or stale.
  const MAX_SUMMARY_AGE_MS = 25 * 3_600_000;
  const summaryRow = behaviourSummaryResult.data as any;
  const summaryAge = summaryRow?.computed_at
    ? Date.now() - new Date(summaryRow.computed_at).getTime()
    : Infinity;
  const useSummary = summaryRow && summaryAge < MAX_SUMMARY_AGE_MS;

  let completedCount: number;
  let postponedCount: number;
  let skippedCount: number;
  let postponeRate: number;
  let topTaskTypes: string[];
  let recentEventCount: number;

  if (useSummary) {
    completedCount  = summaryRow.tasks_completed  ?? 0;
    postponedCount  = summaryRow.tasks_postponed  ?? 0;
    skippedCount    = summaryRow.tasks_skipped    ?? 0;
    postponeRate    = Number(summaryRow.postpone_rate ?? 0);
    topTaskTypes    = summaryRow.top_task_types   ?? [];
    recentEventCount = completedCount + postponedCount + skippedCount;
  } else {
    // Live aggregation fallback. Event names are lowercase — see
    // src/events/registry.ts (uppercase matching made these always zero).
    const rawEvents: any[] = (behaviourLiveResult.data ?? []) as any[];
    completedCount  = rawEvents.filter((e) => e.event_type === "task_completed").length;
    postponedCount  = rawEvents.filter((e) => e.event_type === "task_postponed").length;
    skippedCount    = rawEvents.filter((e) => e.event_type === "task_skipped").length;
    const totalActioned = completedCount + postponedCount + skippedCount;
    postponeRate = totalActioned > 0 ? Math.round((postponedCount / totalActioned) * 10_000) / 10_000 : 0;

    const typeCounts: Record<string, number> = {};
    for (const e of rawEvents.filter((e) => e.event_type === "task_completed")) {
      const t = e.meta?.task_type as string | undefined;
      if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    }
    topTaskTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
    recentEventCount = rawEvents.length;
  }

  const behaviour: UserContextBehaviour = {
    completedCount,
    postponedCount,
    skippedCount,
    postponeRate,
    topTaskTypes,
    recentEventCount,
  };

  // ── Weather ────────────────────────────────────────────────────────────────
  let weather: UserContextWeather | null = null;
  const weatherData = weatherResult.data?.data;
  if (weatherData) {
    try {
      const current = weatherData.current ?? weatherData.currently ?? null;
      const daily = weatherData.daily ?? weatherData.forecast ?? null;
      const nowTempC = current?.temperature_2m ?? current?.temp ?? null;
      const nowCondition = current?.weather_description ?? current?.condition ?? null;

      let maxRainMm = 0;
      let maxTempC = nowTempC ?? 0;
      let frostRisk = false;
      let heatwaveRisk = false;
      const dayNames: string[] = [];

      if (Array.isArray(daily)) {
        for (const day of daily.slice(0, 7)) {
          const rain = day.precipitation_sum ?? day.rain ?? 0;
          const hi = day.temperature_2m_max ?? day.max_temp ?? 0;
          const lo = day.temperature_2m_min ?? day.min_temp ?? 0;
          maxRainMm += rain;
          if (hi > maxTempC) maxTempC = hi;
          if (lo <= 0) frostRisk = true;
          if (hi >= 35) heatwaveRisk = true;
          dayNames.push(`${Math.round(hi)}°C`);
        }
      }

      const summary = dayNames.length > 0
        ? `Max ~${Math.round(maxTempC)}°C, ~${Math.round(maxRainMm)}mm rain over 7 days. Highs: ${dayNames.join(", ")}`
        : null;

      weather = {
        nowTempC: nowTempC !== null ? Math.round(nowTempC) : null,
        nowCondition,
        next7DaysSummary: summary,
        upcomingFrostRisk: frostRisk,
        upcomingHeatwave: heatwaveRisk,
      };
    } catch {
      weather = null;
    }
  }

  return {
    userId: userId ?? null,
    homeId: homeId ?? null,
    displayName: profile?.display_name ?? null,
    firstName: profile?.first_name ?? null,
    subscriptionTier: profile?.subscription_tier ?? null,
    quizCompleted: !!quizResult.data,
    country,
    locationCity,
    timezone,
    lat,
    lng,
    hemisphere,
    currentSeason,
    currentMonth,
    isoDate,
    climateZone,
    frostFirstDate,
    frostLastDate,
    areas: rawAreas,
    inventory,
    upcomingTasks,
    preferences,
    behaviour,
    weather,
  };
}

// ── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render a compact, token-efficient context block for AI system prompts.
 * Pass only the sections you need to keep token usage down.
 */
export function renderContextBlock(
  ctx: UserContext,
  sections: ContextSection[],
): string {
  const lines: string[] = ["── GARDENER CONTEXT ──"];

  for (const section of sections) {
    switch (section) {
      case "identity": {
        const tier = ctx.subscriptionTier ?? "unknown";
        const quiz = ctx.quizCompleted ? "completed" : "not completed";
        lines.push(`\nIDENTITY`);
        lines.push(`Tier: ${tier} | Habit quiz: ${quiz}`);
        break;
      }

      case "location": {
        lines.push(`\nLOCATION & SEASON`);
        const parts: string[] = [];
        if (ctx.locationCity && ctx.country) {
          parts.push(`Location: ${ctx.locationCity}, ${ctx.country}`);
        } else if (ctx.country) {
          parts.push(`Country: ${ctx.country}`);
        }
        parts.push(`Hemisphere: ${ctx.hemisphere}`);
        parts.push(`Season: ${ctx.currentSeason} (${ctx.currentMonth} ${ctx.isoDate.slice(0, 4)})`);
        if (ctx.climateZone) parts.push(`Climate: ${ctx.climateZone.replace("_", " ")}`);
        lines.push(parts.join(" | "));
        if (ctx.frostFirstDate || ctx.frostLastDate) {
          const frostParts: string[] = [];
          if (ctx.frostFirstDate) frostParts.push(`first frost ~${ctx.frostFirstDate}`);
          if (ctx.frostLastDate)  frostParts.push(`last frost ~${ctx.frostLastDate}`);
          lines.push(`Frost window: ${frostParts.join(", ")}`);
        }
        break;
      }

      case "garden": {
        lines.push(`\nGARDEN`);
        if (ctx.areas.length === 0) {
          lines.push("No areas set up yet.");
        } else {
          lines.push(`Areas (${ctx.areas.length}):`);
          for (const a of ctx.areas) {
            const loc = a.locationName ? ` @ ${a.locationName}` : "";
            const env = a.isOutside ? "outdoor" : "indoor";
            const medium = a.growingMedium ?? "unknown medium";
            lines.push(`  • ${a.name}${loc} — ${env}, ${medium}${a.mediumPh ? `, pH ${a.mediumPh}` : ""}`);
          }
        }
        if (ctx.inventory.length === 0) {
          lines.push("No plants currently planted.");
        } else {
          lines.push(`Planted (${ctx.inventory.length}):`);
          // Group by area
          const byArea: Record<string, string[]> = {};
          for (const item of ctx.inventory) {
            const area = item.areaName ?? "Unassigned";
            (byArea[area] = byArea[area] ?? []).push(
              item.nickname ? `${item.plantName} (${item.nickname})` : item.plantName,
            );
          }
          for (const [area, plants] of Object.entries(byArea)) {
            lines.push(`  • ${area}: ${plants.join(", ")}`);
          }
        }
        break;
      }

      case "tasks": {
        if (ctx.upcomingTasks.length === 0) break;
        lines.push(`\nUPCOMING TASKS (next 7 days, ${ctx.upcomingTasks.length})`);
        for (const t of ctx.upcomingTasks.slice(0, 10)) {
          const area = t.areaName ? ` [${t.areaName}]` : "";
          lines.push(`  • ${t.dueDate} ${t.type}: ${t.title}${area}`);
        }
        break;
      }

      case "preferences": {
        if (ctx.preferences.length === 0) break;
        lines.push(`\nGARDENER PREFERENCES`);
        lines.push(formatPreferencesBlock(ctx.preferences, "simple"));
        break;
      }

      case "behaviour": {
        const b = ctx.behaviour;
        if (b.recentEventCount === 0) break;
        lines.push(`\nBEHAVIOUR (last 30 days)`);
        lines.push(
          `Completed: ${b.completedCount} | Postponed: ${b.postponedCount} | Skipped: ${b.skippedCount} | Postpone rate: ${Math.round(b.postponeRate * 100)}%`,
        );
        if (b.topTaskTypes.length > 0) {
          lines.push(`Most active task types: ${b.topTaskTypes.join(", ")}`);
        }
        if (b.postponeRate >= 0.4) {
          lines.push(
            `⚠ High postpone rate — keep recommendations actionable and brief. Don't overwhelm with tasks.`,
          );
        }
        break;
      }

      case "weather": {
        if (!ctx.weather) break;
        const w = ctx.weather;
        lines.push(`\nWEATHER`);
        const current = [
          w.nowTempC !== null ? `Now: ${w.nowTempC}°C` : null,
          w.nowCondition ? w.nowCondition : null,
        ].filter(Boolean).join(", ");
        if (current) lines.push(current);
        if (w.next7DaysSummary) lines.push(`Forecast: ${w.next7DaysSummary}`);
        if (w.upcomingFrostRisk) lines.push("⚠ Frost risk in next 7 days — advise protecting tender plants.");
        if (w.upcomingHeatwave) lines.push("⚠ Heatwave conditions forecast — advise extra watering and shade.");
        break;
      }
    }
  }

  lines.push("\n── END CONTEXT ──");
  return lines.join("\n");
}
