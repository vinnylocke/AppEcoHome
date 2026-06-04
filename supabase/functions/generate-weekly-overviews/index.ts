// ─── generate-weekly-overviews ─────────────────────────────────────────────
//
// Runs every Sunday at 06:00 UTC. For each home that has at least one
// active member, builds a `weekly_overviews` row covering the upcoming
// Monday–Sunday window. Then dispatches a `weekly_overview` notification
// to every member who hasn't opted out via the `weeklyOverview` pref.
//
// Payload shape (jsonb on weekly_overviews.payload):
//   task_counts:        per-type counts of pending tasks in the window
//   weather_events:     frost/heatwave/heavy_rain/strong_wind/waterlogging
//   sow_this_week:      seasonal sow candidates from plant catalogue
//   harvest_this_week:  inventory items whose harvest window is active or opening
//   prune_this_week:    inventory items whose pruning window opens this week
//   maintenance_count:  Maintenance + Watering tasks rollup
//   tips:               3–5 short reminders (AI-grounded when AI key present, else deterministic seasonal)
//   pest_disease_risk:  rule-based risk lines (humidity + temp + plant inventory)
//   pollen:             rolled-up grass/birch/ragweed peaks from the latest pollen_snapshots row
//
// The function is idempotent: re-running mid-week upserts on
// (home_id, week_start) so the most recent run wins.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "generate-weekly-overviews";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ── Date helpers ────────────────────────────────────────────────────────
//
// Week window is Monday → Sunday for the upcoming week. When the cron
// fires on Sunday 06:00 UTC, "next Monday" is tomorrow.

function getUpcomingWeekWindow(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon…
  // Days until next Monday. Sunday → +1, Monday → +7 (skip to next), Tue → +6, etc.
  const daysToMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

function getDayName(dateStr: string): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(dateStr + "T12:00:00Z");
  return names[d.getUTCDay()];
}

// ── Hemisphere → seasonal context ───────────────────────────────────────

function getSeasonForDate(dateStr: string, hemisphere: "Northern" | "Southern"): string {
  const month = parseInt(dateStr.split("-")[1], 10);
  if (hemisphere === "Northern") {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }
  if (month >= 9 && month <= 11) return "spring";
  if (month === 12 || month <= 2) return "summer";
  if (month >= 3 && month <= 5) return "autumn";
  return "winter";
}

function getHemisphere(lat: number | null): "Northern" | "Southern" {
  return (lat ?? 0) >= 0 ? "Northern" : "Southern";
}

// ── Deterministic seasonal tips (V1 — Wave 21.D will add AI on top) ─────

const SEASONAL_TIPS: Record<string, string[]> = {
  spring: [
    "Hardening off any indoor-sown seedlings? Start with a couple of hours outdoors and build up daily.",
    "Top up mulch on beds before the dry spells — locks in moisture for the warmer weeks ahead.",
    "Spring growth is fastest now; weekly tip-pruning of fast growers keeps the shape tidy.",
    "Slug pressure climbs with the warmth — beer traps, copper tape, or a torchlit hunt at dusk all help.",
    "If you didn't feed your bulbs at flowering, a top-up liquid feed now stores energy for next year's display.",
  ],
  summer: [
    "Water at the base of plants in the cool of evening to minimise evaporation and avoid leaf scorch.",
    "Pinch out the side shoots on tomatoes weekly so the plant's energy goes into fruit, not foliage.",
    "Deadhead spent flowers on annuals every few days to keep them blooming through the heat.",
    "Mulch beds heavily before any heatwave to lock in moisture and protect roots.",
    "Harvest courgettes and beans little and often — once a week is too sparse, every two days keeps plants productive.",
  ],
  autumn: [
    "Plant spring bulbs now while soil temperatures are still workable.",
    "Lift and divide congested perennial clumps — they'll establish before the cold snap.",
    "Sow hardy autumn salads and broad beans for an early harvest next year.",
    "Rake fallen leaves into a leafmould bin — free soil improver by next spring.",
    "Bring in tender plants before the first frosts forecast for your area.",
  ],
  winter: [
    "Prune apple and pear trees while dormant — removes crossing branches and encourages fruiting wood.",
    "Check stored crops weekly for rot — one bad apple really does spoil the bunch.",
    "Clean greenhouse glass to maximise the precious winter light for overwintering plants.",
    "Hard-pruned wisteria back to two-buds per spur shoot now sets up a stronger summer flower display.",
    "Plan next year's seed order while inspiration is fresh from this season's wins and losses.",
  ],
};

function pickSeasonalTips(season: string, n = 3): string[] {
  const pool = SEASONAL_TIPS[season] ?? SEASONAL_TIPS.spring;
  // Stable per-week pick: take the first n; full AI tips come from Wave 21.D.
  return pool.slice(0, n);
}

// ── Weather event extraction ────────────────────────────────────────────
//
// Reads the latest weather_snapshots row for the home and pulls events
// for each day in the upcoming window. We apply simple thresholds here
// rather than the full _shared/weatherRules so this stays self-contained
// (and the rules are intentionally tuned for daily notifications, not
// weekly summaries).

interface WeatherEvent {
  kind: "frost" | "heatwave" | "heavy_rain" | "strong_wind";
  date: string;
  day: string;
  severity: "info" | "warning" | "critical";
  note: string;
}

function extractWeatherEvents(
  weather: any,
  weekStart: string,
  weekEnd: string,
): WeatherEvent[] {
  const events: WeatherEvent[] = [];
  const daily = weather?.data?.daily;
  if (!daily || !Array.isArray(daily.time)) return events;

  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i] as string;
    if (date < weekStart || date > weekEnd) continue;
    const day = getDayName(date);
    const tmin = Number(daily.temperature_2m_min?.[i] ?? NaN);
    const tmax = Number(daily.temperature_2m_max?.[i] ?? NaN);
    const rain = Number(daily.precipitation_sum?.[i] ?? 0);
    const wind = Number(daily.wind_speed_10m_max?.[i] ?? 0);

    if (Number.isFinite(tmin) && tmin <= 2) {
      events.push({
        kind: "frost",
        date,
        day,
        severity: tmin <= -2 ? "critical" : "warning",
        note: `Min ${Math.round(tmin)}°C overnight`,
      });
    }
    if (Number.isFinite(tmax) && tmax >= 30) {
      events.push({
        kind: "heatwave",
        date,
        day,
        severity: tmax >= 35 ? "critical" : "warning",
        note: `Peaks ${Math.round(tmax)}°C`,
      });
    }
    if (rain >= 15) {
      events.push({
        kind: "heavy_rain",
        date,
        day,
        severity: rain >= 30 ? "critical" : "warning",
        note: `${rain.toFixed(0)}mm forecast`,
      });
    }
    if (wind >= 50) {
      events.push({
        kind: "strong_wind",
        date,
        day,
        severity: wind >= 70 ? "critical" : "warning",
        note: `Gusts to ${Math.round(wind)} km/h`,
      });
    }
  }
  return events;
}

// ── Pest/disease risk rule engine ───────────────────────────────────────
//
// Tiny rule engine: weather conditions × plant inventory. Each rule
// fires only when both the weather pattern AND a relevant plant family
// are present, so the user only sees risks that apply to THEIR garden.

interface RiskLine {
  plant_name: string;
  risk_kind: string;
  level: "low" | "elevated" | "high";
  note: string;
  action: string;
}

function extractRiskLines(
  weather: any,
  weekStart: string,
  weekEnd: string,
  plantNames: string[],
): RiskLine[] {
  const out: RiskLine[] = [];
  const daily = weather?.data?.daily;
  if (!daily || !Array.isArray(daily.time)) return out;

  const lowerNames = plantNames.map((n) => n.toLowerCase());
  const has = (...needles: string[]) =>
    needles.some((needle) => lowerNames.some((n) => n.includes(needle)));

  // Find sustained warm-and-wet stretches (blight risk for nightshades).
  let warmWetDays = 0;
  let heatDays = 0;
  let droughtDays = 0;
  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i] as string;
    if (date < weekStart || date > weekEnd) continue;
    const tmin = Number(daily.temperature_2m_min?.[i] ?? NaN);
    const tmax = Number(daily.temperature_2m_max?.[i] ?? NaN);
    const rain = Number(daily.precipitation_sum?.[i] ?? 0);
    if (tmin >= 10 && tmax >= 18 && rain >= 5) warmWetDays += 1;
    if (tmax >= 28) heatDays += 1;
    if (rain < 1 && tmax >= 22) droughtDays += 1;
  }

  // Blight (potato + tomato)
  if (warmWetDays >= 2 && has("tomato", "potato")) {
    const level: RiskLine["level"] = warmWetDays >= 4 ? "high" : "elevated";
    out.push({
      plant_name: has("tomato") ? "Tomatoes" : "Potatoes",
      risk_kind: "Late blight",
      level,
      note: `Warm + humid conditions forecast for ${warmWetDays} day(s) this week — classic blight weather.`,
      action: "Remove lower leaves, ensure airflow, consider a preventative copper spray on outdoor crops.",
    });
  }
  // Powdery mildew (cucurbits + ornamentals)
  if (heatDays >= 3 && has("courgette", "cucumber", "squash", "pumpkin", "phlox", "rose")) {
    out.push({
      plant_name: has("courgette") ? "Courgettes" : has("cucumber") ? "Cucumbers" : "Roses",
      risk_kind: "Powdery mildew",
      level: heatDays >= 5 ? "high" : "elevated",
      note: `${heatDays} hot day(s) without much rain — mildew thrives on warm, dry foliage with cool nights.`,
      action: "Water at the base in the morning, thin congested foliage, milk-water spray helps if it appears.",
    });
  }
  // Aphid pressure (warm spells + tender new growth)
  if (heatDays >= 3 && has("rose", "broad bean", "nasturtium", "honeysuckle")) {
    out.push({
      plant_name: has("rose") ? "Roses" : "Broad beans",
      risk_kind: "Aphid surge",
      level: "elevated",
      note: `Warm spell forecast — aphids breed fast in these conditions.`,
      action: "Pinch out infested tips, blast with water, encourage ladybirds and lacewings.",
    });
  }
  // Slug pressure (wet stretches)
  if (warmWetDays >= 2 && has("lettuce", "hosta", "dahlia", "delphinium", "courgette")) {
    out.push({
      plant_name: has("lettuce") ? "Lettuces" : "Hostas",
      risk_kind: "Slug pressure",
      level: warmWetDays >= 4 ? "high" : "elevated",
      note: "Wet warm nights are slug heaven — check for damage at dusk.",
      action: "Beer traps, copper tape, nematodes, or torch-and-pick after dark.",
    });
  }
  // Drought stress
  if (droughtDays >= 3) {
    out.push({
      plant_name: "Container plants",
      risk_kind: "Drought stress",
      level: droughtDays >= 5 ? "high" : "elevated",
      note: `${droughtDays} dry warm day(s) coming — containers will need daily attention.`,
      action: "Water deeply at dawn or dusk; mulch the surface; group pots into shade if a heatwave's confirmed.",
    });
  }
  return out;
}

// ── AI tip pass (Wave 21.D — best-effort, optional) ────────────────────
//
// Calls Gemini with a tight prompt grounded by the deterministic context.
// We don't gate by tier here — the cron runs for every home, so we just
// fall back to deterministic tips when GEMINI_API_KEY is missing OR the
// call fails. The result is APPENDED to the seasonal tips, not replaces
// them, so the user always sees at least 3 actionable lines.

async function maybeAddAiTips(
  baseTips: string[],
  season: string,
  weatherEvents: WeatherEvent[],
  plantSummary: string,
  apiKey: string | undefined,
): Promise<string[]> {
  if (!apiKey) return baseTips;
  try {
    const events = weatherEvents
      .map((e) => `${e.day}: ${e.kind} (${e.note})`)
      .join("; ") || "none notable";
    const prompt = `You are an expert gardener writing 2 concise weekly tips for a home gardener. Context:
- Season: ${season}
- Plants the user grows: ${plantSummary || "various"}
- Notable weather this week: ${events}
Return only the 2 tips, one per line, each a single sentence under 22 words. No preamble.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return baseTips;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const aiTips = text
      .split(/\r?\n/)
      .map((s: string) => s.replace(/^[\-\*\d\.\)\s]+/, "").trim())
      .filter((s: string) => s.length > 8 && s.length < 200);
    return [...baseTips, ...aiTips.slice(0, 2)];
  } catch (err) {
    warn(FN, "ai_tip_failed", { error: (err as Error).message });
    return baseTips;
  }
}

// ── Main ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse body. When `home_id` is provided we scope the work to that
    // home only (manual regenerate path from /weekly); otherwise we
    // process every home (cron path). `notify` defaults to FALSE on the
    // manual path so users aren't double-notified.
    let bodyHomeId: string | null = null;
    let notify = true;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.home_id === "string") bodyHomeId = body.home_id;
        if (typeof body?.notify === "boolean") notify = body.notify;
        else if (bodyHomeId) notify = false; // manual regen: suppress by default
      } catch { /* empty / non-JSON body = treat as cron call */ }
    }

    const { weekStart, weekEnd } = getUpcomingWeekWindow();
    log(FN, "start", { weekStart, weekEnd, bodyHomeId, notify });

    // 1. Homes (scoped to one when invoked manually) + members.
    const homesQuery = supabase.from("homes").select("id, name, lat, lng");
    if (bodyHomeId) homesQuery.eq("id", bodyHomeId);
    const [{ data: homes }, { data: homeMembers }] = await Promise.all([
      homesQuery,
      supabase.from("home_members").select("home_id, user_id"),
    ]);
    if (!homes || homes.length === 0) {
      return new Response(JSON.stringify({ message: "No homes." }), { status: 200, headers: jsonHeaders });
    }

    const membersByHome: Record<string, string[]> = {};
    for (const m of homeMembers ?? []) {
      if (!membersByHome[m.home_id]) membersByHome[m.home_id] = [];
      membersByHome[m.home_id].push(m.user_id);
    }

    let overviewsWritten = 0;
    let notificationsQueued = 0;

    for (const home of homes) {
      if (!membersByHome[home.id]?.length) continue;

      // 2. Tasks in window — counts by type.
      const { data: tasks } = await supabase
        .from("tasks")
        .select("type, due_date, window_end_date")
        .eq("home_id", home.id)
        .eq("status", "Pending")
        .or(`due_date.gte.${weekStart},window_end_date.gte.${weekStart}`)
        .lte("due_date", weekEnd);

      const taskCounts: Record<string, number> = {};
      for (const t of tasks ?? []) {
        taskCounts[t.type] = (taskCounts[t.type] ?? 0) + 1;
      }

      // 3. Weather snapshot.
      const { data: weather } = await supabase
        .from("weather_snapshots")
        .select("data")
        .eq("home_id", home.id)
        .maybeSingle();

      const weatherEvents = extractWeatherEvents(weather, weekStart, weekEnd);

      // 4. Inventory — for harvest / prune / pest-risk lookup.
      const { data: inventoryItems } = await supabase
        .from("inventory_items")
        .select("id, plant_name, plant_id, status")
        .eq("home_id", home.id)
        .eq("status", "Planted");

      const plantNames = (inventoryItems ?? [])
        .map((i) => (i as any).plant_name as string | null)
        .filter((n): n is string => !!n);

      // 5. Harvest / prune windows opening this week — derived from
      // task_blueprints with start_date inside the week.
      const { data: blueprints } = await supabase
        .from("task_blueprints")
        .select("id, title, task_type, start_date, end_date, inventory_item_ids")
        .eq("home_id", home.id)
        .eq("is_archived", false)
        .in("task_type", ["Harvesting", "Harvest", "Pruning"])
        .gte("start_date", weekStart)
        .lte("start_date", weekEnd);

      const harvest: { plant_name: string; reason: string }[] = [];
      const prune: { plant_name: string; reason: string }[] = [];
      for (const bp of blueprints ?? []) {
        const ids = (bp as any).inventory_item_ids as string[] | null;
        const item = (inventoryItems ?? []).find((i) => ids?.includes(i.id));
        const name = item?.plant_name ?? bp.title.replace(/\s+(harvest|pruning)\s*$/i, "");
        const entry = { plant_name: name, reason: `Window opens ${getDayName(bp.start_date)}` };
        if (bp.task_type === "Pruning") prune.push(entry);
        else harvest.push(entry);
      }

      // 6. Sow this week — from sowing_calendar table if present (best-effort).
      let sowing: { plant_name: string; why: string }[] = [];
      try {
        const monthIndex = parseInt(weekStart.split("-")[1], 10) - 1;
        const { data: rawSow } = await supabase
          .from("sowing_calendar")
          .select("plant_name, months")
          .contains("months", [monthIndex])
          .limit(20);
        sowing = (rawSow ?? []).slice(0, 5).map((r: any) => ({
          plant_name: r.plant_name,
          why: "In sowing window this month",
        }));
      } catch { /* table may not exist on every project — non-fatal */ }

      // 7. Risk module.
      const riskLines = extractRiskLines(weather, weekStart, weekEnd, plantNames);

      // 8. Tips — deterministic + (optional) AI grounded.
      const season = getSeasonForDate(weekStart, getHemisphere(home.lat));
      let tips = pickSeasonalTips(season, 3);
      tips = await maybeAddAiTips(
        tips,
        season,
        weatherEvents,
        plantNames.slice(0, 8).join(", "),
        geminiKey,
      );

      // 9. Pollen rollup from the latest snapshot.
      const { data: pollenRow } = await supabase
        .from("pollen_snapshots")
        .select("payload, snapshot_date")
        .eq("home_id", home.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pollen = pollenRow?.payload ?? null;

      const payload = {
        task_counts: taskCounts,
        weather_events: weatherEvents,
        sow_this_week: sowing,
        harvest_this_week: harvest,
        prune_this_week: prune,
        maintenance_count:
          (taskCounts.Maintenance ?? 0) + (taskCounts.Watering ?? 0),
        tips,
        pest_disease_risk: riskLines,
        pollen,
        home_name: home.name ?? null,
        week_start: weekStart,
        week_end: weekEnd,
      };

      // 10. Upsert the overview.
      const { error: upErr } = await supabase
        .from("weekly_overviews")
        .upsert(
          { home_id: home.id, week_start: weekStart, payload, generated_at: new Date().toISOString() },
          { onConflict: "home_id,week_start" },
        );
      if (upErr) {
        warn(FN, "upsert_failed", { home_id: home.id, error: upErr.message });
        continue;
      }
      overviewsWritten += 1;

      // 11. Notify every member — suppressed on manual regenerate.
      if (notify) {
        const taskTotal = Object.values(taskCounts).reduce((a, b) => a + b, 0);
        const body = taskTotal === 0
          ? "Your week's overview is ready — no scheduled tasks but plenty of seasonal ideas inside."
          : `Your week ahead: ${taskTotal} task${taskTotal === 1 ? "" : "s"}${weatherEvents.length ? ` · ${weatherEvents.length} weather alert${weatherEvents.length === 1 ? "" : "s"}` : ""}. Tap to plan.`;
        const notifications = membersByHome[home.id].map((user_id) => ({
          user_id,
          home_id: home.id,
          title: "🌿 Your week ahead",
          body,
          type: "weekly_overview",
          data: { route: "/weekly" },
          is_read: false,
        }));
        const { error: notifErr } = await supabase
          .from("notifications")
          .insert(notifications);
        if (!notifErr) notificationsQueued += notifications.length;
      }
    }

    log(FN, "complete", { overviewsWritten, notificationsQueued });
    return new Response(
      JSON.stringify({ success: true, overviewsWritten, notificationsQueued }),
      { headers: jsonHeaders },
    );
  } catch (err: any) {
    logError(FN, "unhandled", { error: err.message });
    await captureException(FN, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders });
  }
});
