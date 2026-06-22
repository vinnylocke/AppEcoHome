/**
 * Shared insight aggregation — the single implementation of "gather every stored
 * insight source for a user/home into one normalized, ranked feed".
 *
 * Consumed by both insights-feed (the /insights page) and garden-manager-report
 * (the Head Gardener Estate Report) so the two never drift apart.
 *
 * See docs/plans/head-gardener-ai-manager.md.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface FeedInsight {
  id: string;
  source: "pattern" | "automation" | "area" | "weekly" | "seasonal" | "planner" | "weather" | "pest" | "grow" | "task";
  category: string;
  title: string;
  body: string;
  severity: number; // 1..3, higher = more attention
  createdAt: string;
  link: string | null;
  dismissable: boolean;
}

const PATTERN_META: Record<string, { category: string; title: string; link: string }> = {
  soil_drydown_watering: { category: "watering", title: "Watering", link: "/shed" },
  harvest_ready: { category: "harvest", title: "Ready to harvest", link: "/shed" },
  neglected_plant: { category: "care", title: "Plant needs attention", link: "/shed" },
  consecutive_postponements: { category: "tasks", title: "Task keeps slipping", link: "/schedule" },
  high_postpone_rate: { category: "tasks", title: "Often postponed", link: "/schedule" },
  blueprint_postpone_rate: { category: "tasks", title: "Schedule worth tweaking", link: "/schedule" },
};

/**
 * Aggregate + rank every insight source for a user/home. Returns the ranked
 * FeedInsight list (severity desc, then most recent first).
 */
export async function aggregateInsights(
  db: SupabaseClient,
  userId: string,
  homeId: string | null,
): Promise<FeedInsight[]> {
  const insights: FeedInsight[] = [];

  // 1. Pattern insights (per-user).
  const { data: ui } = await db
    .from("user_insights")
    .select("id, insight_text, created_at, action_path, severity, pattern_id")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const r of ui ?? []) {
    const meta = PATTERN_META[(r.pattern_id as string) ?? ""] ?? { category: "care", title: "Insight", link: "/dashboard" };
    insights.push({
      id: `ui-${r.id}`,
      source: "pattern",
      category: meta.category,
      title: meta.title,
      body: r.insight_text as string,
      severity: (r.severity as number) ?? 1,
      createdAt: r.created_at as string,
      link: (r.action_path as string | null) ?? meta.link,
      dismissable: true,
    });
  }

  if (homeId) {
    // 2. Automation tuning suggestions.
    const { data: as } = await db
      .from("automation_suggestions")
      .select("id, kind, rationale, ai_rationale, confidence, created_at")
      .eq("home_id", homeId)
      .eq("status", "active");
    for (const r of as ?? []) {
      insights.push({
        id: `as-${r.id}`,
        source: "automation",
        category: "watering",
        title: r.kind === "reduce_watering" ? "Ease off watering" : "Water more",
        body: (r.ai_rationale as string | null) ?? (r.rationale as string),
        severity: Math.max(1, Math.round(((r.confidence as number) ?? 0.5) * 3)),
        createdAt: r.created_at as string,
        link: "/integrations",
        dismissable: true,
      });
    }

    // 3. AI Area Coach (latest per area).
    const { data: areas } = await db
      .from("area_ai_insights")
      .select("area_id, insight, generated_at")
      .eq("home_id", homeId);
    for (const r of areas ?? []) {
      const ins = r.insight as { headline?: string; summary?: string } | null;
      if (ins?.headline) {
        insights.push({
          id: `area-${r.area_id}`,
          source: "area",
          category: "area",
          title: ins.headline,
          body: ins.summary ?? "",
          severity: 2,
          createdAt: r.generated_at as string,
          link: `/management?area=${r.area_id}`,
          dismissable: false,
        });
      }
    }

    // 4. Weekly overview tips (latest week).
    const { data: wk } = await db
      .from("weekly_overviews")
      .select("payload, generated_at")
      .eq("home_id", homeId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rawTips = ((wk?.payload as { tips?: unknown[] } | null)?.tips ?? []) as unknown[];
    rawTips
      .map((t) => (typeof t === "string" ? t : ((t as { tip?: string; text?: string })?.tip ?? (t as { text?: string })?.text ?? "")))
      .filter((t) => !!t)
      .slice(0, 3)
      .forEach((tip, i) => insights.push({
        id: `wk-${i}`,
        source: "weekly",
        category: "weekly",
        title: "This week",
        body: tip as string,
        severity: 1,
        createdAt: (wk?.generated_at as string) ?? new Date().toISOString(),
        link: "/weekly",
        dismissable: false,
      }));

    // 5. Stalled plans (computed) — In Progress with no changes for 2+ weeks.
    const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: plans } = await db
      .from("plans")
      .select("id, name, updated_at")
      .eq("home_id", homeId)
      .eq("status", "In Progress")
      .lt("updated_at", staleCutoff);
    for (const p of plans ?? []) {
      const weeks = Math.max(2, Math.round((Date.now() - new Date(p.updated_at as string).getTime()) / (7 * 86_400_000)));
      insights.push({
        id: `plan-${p.id}`,
        source: "planner",
        category: "planning",
        title: "Plan needs a nudge",
        body: `"${(p.name as string) ?? "Your plan"}" has been in progress with no changes for about ${weeks} weeks — ready to pick it back up?`,
        severity: 2,
        createdAt: p.updated_at as string,
        link: "/planner",
        dismissable: false,
      });
    }

    // 6. Frost ahead (computed) — a sub-2°C night in the next ~5 days + plants are out.
    const { data: snap } = await db.from("weather_snapshots").select("data").eq("home_id", homeId).maybeSingle();
    const daily = ((snap?.data as Record<string, unknown> | null)?.daily ?? {}) as { time?: string[]; temperature_2m_min?: number[] };
    const times = daily.time ?? [];
    const mins = daily.temperature_2m_min ?? [];
    const todayStr = new Date().toISOString().split("T")[0];
    let frostIdx = -1;
    for (let i = 0; i < Math.min(times.length, 6); i++) {
      if (times[i] >= todayStr && typeof mins[i] === "number" && (mins[i] as number) <= 2) { frostIdx = i; break; }
    }
    if (frostIdx >= 0) {
      const { count: planted } = await db.from("inventory_items")
        .select("id", { count: "exact", head: true }).eq("home_id", homeId).eq("status", "Planted");
      if ((planted ?? 0) > 0) {
        const weekday = new Date(times[frostIdx]).toLocaleDateString("en-GB", { weekday: "long" });
        insights.push({
          id: `frost-${times[frostIdx]}`,
          source: "weather",
          category: "weather",
          title: "Frost on the way",
          body: `Frost forecast for ${weekday} (low ~${Math.round(mins[frostIdx] as number)}°C) — fleece tender outdoor plants or move pots under cover.`,
          severity: 3,
          createdAt: new Date().toISOString(),
          link: "/dashboard?view=weather",
          dismissable: false,
        });
      }
    }

    // 7. AI pest-risk (home-level; generated weekly + on ailment-link).
    const { data: pests } = await db
      .from("home_pest_insights")
      .select("id, ailment_name, body, severity, generated_at")
      .eq("home_id", homeId);
    for (const p of pests ?? []) {
      insights.push({
        id: `pest-${p.id}`,
        source: "pest",
        category: "pests",
        title: (p.ailment_name as string) ? `${p.ailment_name} risk` : "Pest risk",
        body: p.body as string,
        severity: (p.severity as number) ?? 2,
        createdAt: p.generated_at as string,
        link: "/watchlist",
        dismissable: false,
      });
    }

    // 8. AI grow + missing-task suggestions (home-level, weekly).
    const { data: grow } = await db
      .from("home_grow_suggestions")
      .select("id, kind, title, body, area_name, severity, generated_at")
      .eq("home_id", homeId);
    for (const g of grow ?? []) {
      const isPlant = g.kind === "plant";
      insights.push({
        id: `grow-${g.id}`,
        source: isPlant ? "grow" : "task",
        category: isPlant ? "planting" : "tasks",
        title: isPlant ? `Try growing ${g.title}${g.area_name ? ` in ${g.area_name}` : ""}` : (g.title as string),
        body: g.body as string,
        severity: (g.severity as number) ?? 1,
        createdAt: g.generated_at as string,
        link: isPlant ? "/shed" : "/schedule",
        dismissable: false,
      });
    }
  }

  // Rank: severity desc, then most recent first.
  insights.sort((a, b) => b.severity - a.severity || (a.createdAt < b.createdAt ? 1 : -1));
  return insights;
}
