import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface PlannerPreference {
  id?: string;
  home_id: string;
  user_id?: string;
  entity_type: string;
  entity_name: string;
  sentiment: "positive" | "negative";
  reason?: string | null;
}

export function useUserPreferences(homeId: string): PlannerPreference[] {
  const [preferences, setPreferences] = useState<PlannerPreference[]>([]);

  useEffect(() => {
    if (!homeId) return;

    supabase
      .from("planner_preferences")
      .select("*")
      .eq("home_id", homeId)
      .then(({ data }) => setPreferences(data || []));

    const channel = supabase
      .channel(`prefs-${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "planner_preferences",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) =>
          setPreferences((prev) => [...prev, payload.new as PlannerPreference]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [homeId]);

  return preferences;
}

// Scores a plant name against stored plant preferences.
// Positive: +10 per match. Negative: -10 per match.
// Substring match in both directions to handle partials ("Bean" matches "Bush Beans").
export function scorePlantByPreferences(
  plantName: string,
  scientificName: string,
  preferences: PlannerPreference[],
): number {
  let score = 0;
  const name = plantName.toLowerCase();
  const sci = scientificName.toLowerCase();

  for (const pref of preferences) {
    if (pref.entity_type !== "plant") continue;
    const prefName = pref.entity_name.toLowerCase();
    const isMatch =
      name.includes(prefName) ||
      sci.includes(prefName) ||
      prefName.includes(name);
    if (isMatch) {
      score += pref.sentiment === "positive" ? 10 : -10;
    }
  }
  return score;
}

// Scores a task by looking up all linked inventory plant names.
export function scoreTaskByPlantPreferences(
  task: any,
  inventoryDict: Record<string, any>,
  preferences: PlannerPreference[],
): number {
  if (!preferences.length) return 0;
  let score = 0;
  for (const id of (task.inventory_item_ids || []) as string[]) {
    const item = inventoryDict[id];
    if (item) score += scorePlantByPreferences(item.plant_name || "", "", preferences);
  }
  return score;
}
