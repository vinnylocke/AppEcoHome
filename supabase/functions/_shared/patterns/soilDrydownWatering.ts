import type { PatternDetector, PatternHit } from "./index.ts";

/**
 * Pillar C2 + C3 of the automation-intelligence feature.
 *
 * Flags plants growing in a **fast-draining** area (per soil_moisture_profiles)
 * that ISN'T already covered by an active watering automation — so the gardener
 * is the one keeping it watered. When a hot, dry spell is forecast this week the
 * advice escalates (C3 — weather-aware watering). Surfaces on the AssistantCard
 * via the deterministic path in pattern-evaluate (no postponement-tuned AI eval).
 */
const MAX_HITS = 8;
const CONFIDENCE_MIN = 0.5;

const soilDrydownWatering: PatternDetector = {
  id: "soil_drydown_watering",
  label: "Fast-draining area watering",

  async detect(_userId, homeId, db): Promise<PatternHit[]> {
    // 1. Fast-draining areas with enough confidence → keep the driest rate per area.
    const { data: profs } = await db
      .from("soil_moisture_profiles")
      .select("area_id, drydown_rate_pct_per_day, retention_class, confidence")
      .eq("home_id", homeId)
      .eq("retention_class", "fast_draining")
      .gte("confidence", CONFIDENCE_MIN);

    const fastAreas = new Map<string, number>();
    for (const p of profs ?? []) {
      const area = p.area_id as string | null;
      const rate = p.drydown_rate_pct_per_day as number | null;
      if (!area || rate == null) continue;
      const cur = fastAreas.get(area);
      if (cur == null || rate > cur) fastAreas.set(area, rate);
    }
    if (fastAreas.size === 0) return [];

    // 2. Exclude areas already handled by an active watering automation.
    const { data: autos } = await db
      .from("automations")
      .select("area_id")
      .eq("home_id", homeId)
      .eq("is_active", true)
      .in("area_id", [...fastAreas.keys()]);
    for (const a of autos ?? []) if (a.area_id) fastAreas.delete(a.area_id as string);
    if (fastAreas.size === 0) return [];

    // 3. Hot / dry week ahead? (amplifies the advice — C3.)
    let hotWeek = false;
    const { data: snap } = await db
      .from("weather_snapshots").select("data").eq("home_id", homeId).maybeSingle();
    const daily = ((snap?.data as Record<string, unknown> | null)?.daily ?? {}) as {
      temperature_2m_max?: number[]; precipitation_sum?: number[];
    };
    const temps = (daily.temperature_2m_max ?? []).slice(0, 5);
    const rains = (daily.precipitation_sum ?? []).slice(0, 5);
    if (temps.length) {
      const hotDays = temps.filter((t) => typeof t === "number" && t >= 24).length;
      const totalRain = rains.reduce((s: number, r) => s + (typeof r === "number" ? r : 0), 0);
      hotWeek = hotDays >= 2 && totalRain < 5;
    }

    // 4. Planted items in the remaining fast areas → one hit each (capped).
    const { data: items } = await db
      .from("inventory_items")
      .select("id, plant_name, nickname, area_id, area_name")
      .eq("home_id", homeId)
      .eq("status", "Planted")
      .in("area_id", [...fastAreas.keys()]);

    const hits: PatternHit[] = [];
    for (const it of items ?? []) {
      const rate = fastAreas.get(it.area_id as string);
      if (rate == null) continue;
      const advice = hotWeek
        ? "With a hot, dry spell forecast this week, it'll likely need extra water — check it more often."
        : "Keep an eye on its watering — it can dry out faster than you'd expect.";
      hits.push({
        inventoryItemId: it.id as string,
        rawData: {
          reason: hotWeek ? "hot_week" : "fast_draining",
          area_name: (it.area_name as string) ?? "this area",
          rate: Math.round(rate),
          advice,
        },
      });
      if (hits.length >= MAX_HITS) break;
    }
    return hits;
  },
};

export default soilDrydownWatering;
