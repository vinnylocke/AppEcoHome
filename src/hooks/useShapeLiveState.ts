import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

export type PlantInArea = {
  id: string;
  plant_name: string;
  nickname: string | null;
  plant_id: string | null;
  sunlight: string | null;
  /** User-set token position within the linked shape's bbox (metres). Null = auto-grid. */
  display_x_m: number | null;
  display_y_m: number | null;
  /** User-set token diameter in metres. Null = use auto-grid sizing. */
  display_size_m: number | null;
  /** User-set vertical offset in metres above the bed soil (3D view). Null = 0. */
  display_height_m: number | null;
};

export type AreaTaskCounts = {
  overdue: number;
  today: number;
};

export type AreaAilment = {
  count: number;
  severity: "low" | "moderate" | "severe";
};

/**
 * Fetches per-area live state for all areas referenced by the supplied shapes:
 *  - planted plants (status='Planted')
 *  - active task counts (pending/postponed, due <= today)
 *  - active ailment counts grouped to severity
 *
 * Refetches when `areaIdsKey` (sorted comma-joined area IDs) changes.
 */
export function useShapeLiveState(homeId: string, areaIds: string[]) {
  const [plants, setPlants] = useState<Record<string, PlantInArea[]>>({});
  const [tasks, setTasks] = useState<Record<string, AreaTaskCounts>>({});
  const [ailments, setAilments] = useState<Record<string, AreaAilment>>({});
  const [ph, setPh] = useState<Record<string, number | null>>({});
  const [moisture, setMoisture] = useState<Record<string, number | null>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const areaIdsKey = [...new Set(areaIds)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = areaIdsKey ? areaIdsKey.split(",") : [];
    if (ids.length === 0) {
      setPlants({});
      setTasks({});
      setAilments({});
      setPh({});
      setMoisture({});
      return;
    }

    (async () => {
      try {
        // 1. Plants in each linked area (joined to plants table for sunlight pref)
        const { data: plantRows } = await supabase
          .from("inventory_items")
          .select("id, plant_name, nickname, plant_id, area_id, species_id, display_x_m, display_y_m, display_size_m, display_height_m, plants(sunlight)")
          .in("area_id", ids)
          .eq("status", "Planted");

        const plantsMap: Record<string, PlantInArea[]> = {};
        const itemToArea: Record<string, string> = {};
        for (const r of plantRows ?? []) {
          if (!r.area_id) continue;
          const joined: any = (r as any).plants;
          const sunlight = Array.isArray(joined) ? joined[0]?.sunlight ?? null : joined?.sunlight ?? null;
          (plantsMap[r.area_id] ??= []).push({
            id: r.id,
            plant_name: r.plant_name ?? "Plant",
            nickname: r.nickname,
            plant_id: r.plant_id,
            sunlight,
            display_x_m: r.display_x_m,
            display_y_m: r.display_y_m,
            display_size_m: r.display_size_m,
            display_height_m: r.display_height_m,
          });
          itemToArea[r.id] = r.area_id;
        }
        if (cancelled) return;
        setPlants(plantsMap);

        const itemIds = Object.keys(itemToArea);
        if (itemIds.length === 0) {
          setTasks({});
          setAilments({});
          return;
        }

        // 2. Active tasks (pending/postponed, due <= today) for those plants
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const todayISO = today.toISOString();
        const todayDateOnly = todayISO.slice(0, 10);

        const { data: taskRows } = await supabase
          .from("tasks")
          .select("inventory_item_id, due_date, status")
          .eq("home_id", homeId)
          .in("inventory_item_id", itemIds)
          .neq("status", "Completed")
          .neq("status", "Skipped")
          .lte("due_date", todayISO);

        const taskMap: Record<string, AreaTaskCounts> = {};
        for (const t of taskRows ?? []) {
          if (!t.inventory_item_id) continue;
          const areaId = itemToArea[t.inventory_item_id];
          if (!areaId) continue;
          const due = (t.due_date ?? "").slice(0, 10);
          const bucket = taskMap[areaId] ?? { overdue: 0, today: 0 };
          if (due < todayDateOnly) bucket.overdue += 1;
          else if (due === todayDateOnly) bucket.today += 1;
          taskMap[areaId] = bucket;
        }
        if (cancelled) return;
        setTasks(taskMap);

        // 3. Active ailments grouped by area
        const { data: ailmentRows } = await supabase
          .from("plant_instance_ailments")
          .select("plant_instance_id, status")
          .eq("home_id", homeId)
          .eq("status", "active")
          .in("plant_instance_id", itemIds);

        const counts: Record<string, number> = {};
        for (const a of ailmentRows ?? []) {
          if (!a.plant_instance_id) continue;
          const areaId = itemToArea[a.plant_instance_id];
          if (!areaId) continue;
          counts[areaId] = (counts[areaId] ?? 0) + 1;
        }
        const ailmentMap: Record<string, AreaAilment> = {};
        for (const [areaId, count] of Object.entries(counts)) {
          const severity = count >= 4 ? "severe" : count >= 2 ? "moderate" : "low";
          ailmentMap[areaId] = { count, severity };
        }
        if (cancelled) return;
        setAilments(ailmentMap);

        // 4. pH per area (areas.medium_ph)
        const { data: areaRows } = await supabase
          .from("areas")
          .select("id, medium_ph")
          .in("id", ids);
        const phMap: Record<string, number | null> = {};
        for (const a of areaRows ?? []) phMap[a.id] = a.medium_ph;
        if (cancelled) return;
        setPh(phMap);

        // 5. Recent moisture per area (device_readings on soil_sensor devices area_id-linked)
        const { data: soilDevices } = await supabase
          .from("devices")
          .select("id, area_id")
          .eq("home_id", homeId)
          .eq("device_type", "soil_sensor")
          .eq("is_active", true)
          .in("area_id", ids);
        const moistureMap: Record<string, number | null> = {};
        if (soilDevices && soilDevices.length > 0) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: readings } = await supabase
            .from("device_readings")
            .select("device_id, data, recorded_at")
            .in("device_id", soilDevices.map(d => d.id))
            .gte("recorded_at", since)
            .order("recorded_at", { ascending: false });
          const byDevice: Record<string, number> = {};
          for (const r of readings ?? []) {
            if (byDevice[r.device_id] != null) continue;
            const d = r.data as any;
            const v = d?.moisture ?? d?.soil_moisture ?? d?.vwc ?? d?.humidity;
            if (typeof v === "number") byDevice[r.device_id] = v;
          }
          for (const dev of soilDevices) {
            if (!dev.area_id) continue;
            const v = byDevice[dev.id];
            if (v != null && moistureMap[dev.area_id] == null) moistureMap[dev.area_id] = v;
          }
        }
        if (cancelled) return;
        setMoisture(moistureMap);
      } catch (err) {
        Logger.error("useShapeLiveState fetch failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, areaIdsKey, refreshTick]);

  return { plants, tasks, ailments, ph, moisture, refetch: () => setRefreshTick(t => t + 1) };
}
