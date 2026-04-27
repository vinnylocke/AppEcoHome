import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { log, warn, error as logError } from "../_shared/logger.ts";

const FN = "update-plant-states";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 1. Define the linear progression of states so we know if a user pushed it forward
const STATE_WEIGHTS: Record<string, number> = {
  Germination: 0,
  Seedling: 1,
  Vegetative: 2,
  "Budding/Pre-Flowering": 3,
  "Flowering/Bloom": 4,
  "Fruiting/Pollination": 5,
  "Ripening/Maturity": 6,
  Senescence: 7,
};

// Helper to determine Hemisphere
const getHemisphere = (country?: string, timezone?: string) => {
  const southern = [
    "australia",
    "new zealand",
    "brazil",
    "south africa",
    "argentina",
    "chile",
    "peru",
  ];
  const search = `${country || ""} ${timezone || ""}`.toLowerCase();
  if (southern.some((c) => search.includes(c))) return "southern";
  return "northern";
};

// Helper to check if the current month is inside a seasonal string array
const isMonthInSeason = (
  seasonsData: any,
  currentMonthNum: number,
  hemisphere: string,
) => {
  if (!seasonsData) return false;
  let periods = [];
  if (Array.isArray(seasonsData))
    periods = seasonsData.flatMap((i) =>
      typeof i === "string" ? i.split(/,|\band\b|&/i) : [],
    );
  else if (typeof seasonsData === "string")
    periods = seasonsData.split(/,|\band\b|&/i);

  periods = periods.map((s) => s.trim().toLowerCase()).filter(Boolean);

  const monthMap: Record<string, number[]> = {
    jan: [1],
    feb: [2],
    mar: [3],
    apr: [4],
    may: [5],
    jun: [6],
    jul: [7],
    aug: [8],
    sep: [9],
    oct: [10],
    nov: [11],
    dec: [12],
  };

  if (hemisphere === "northern") {
    monthMap["spring"] = [3, 4, 5];
    monthMap["summer"] = [6, 7, 8];
    monthMap["fall"] = [9, 10, 11];
    monthMap["autumn"] = [9, 10, 11];
    monthMap["winter"] = [12, 1, 2];
  } else {
    monthMap["spring"] = [9, 10, 11];
    monthMap["summer"] = [12, 1, 2];
    monthMap["fall"] = [3, 4, 5];
    monthMap["autumn"] = [3, 4, 5];
    monthMap["winter"] = [6, 7, 8];
  }

  for (const p of periods) {
    for (const key in monthMap) {
      if (p.includes(key) && monthMap[key].includes(currentMonthNum))
        return true;
    }
  }
  return false;
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Fetch all actively planted items with their plant species data and home location
    const { data: items, error } = await supabase
      .from("inventory_items")
      .select(
        `
        id, growth_state, planted_at,
        plants(cycle, flowering_season, harvest_season),
        homes(country, timezone)
      `,
      )
      .eq("status", "Planted");

    if (error) throw error;

    log(FN, "items_loaded", { count: items?.length ?? 0 });

    if (!items || items.length === 0)
      return new Response(JSON.stringify({ message: "No plants to update." }), {
        headers: corsHeaders,
      });

    const updates = [];
    const currentMonth = new Date().getMonth() + 1; // 1-12

    for (const item of items) {
      const hemisphere = getHemisphere(
        item.homes?.country,
        item.homes?.timezone,
      );
      const isFlowering = isMonthInSeason(
        item.plants?.flowering_season,
        currentMonth,
        hemisphere,
      );
      const isHarvesting = isMonthInSeason(
        item.plants?.harvest_season,
        currentMonth,
        hemisphere,
      );

      const currentState = item.growth_state;
      if (!currentState) continue; // skip until a growth state is manually set
      const currentWeight = STATE_WEIGHTS[currentState] || 0;
      let targetState = currentState;

      // 1. Seasonal Progression
      if (isHarvesting && currentWeight < STATE_WEIGHTS["Ripening/Maturity"]) {
        targetState = "Ripening/Maturity";
      } else if (
        isFlowering &&
        !isHarvesting &&
        currentWeight < STATE_WEIGHTS["Flowering/Bloom"]
      ) {
        targetState = "Flowering/Bloom";
      }

      // 2. End of Life Cycle Reset Logic
      // If it is NO LONGER flowering or harvesting, but the state is stuck in high maturity...
      if (
        !isFlowering &&
        !isHarvesting &&
        currentWeight >= STATE_WEIGHTS["Flowering/Bloom"]
      ) {
        const cycle = (item.plants?.cycle || "annual").toLowerCase();

        if (cycle.includes("perennial")) {
          // Perennials go back to sleep (Vegetative) until next year
          targetState = "Vegetative";
        } else if (cycle.includes("biennial")) {
          // Check if it's over 1 year old
          const ageMs =
            new Date().getTime() -
            new Date(item.planted_at || new Date()).getTime();
          const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);
          targetState = ageYears > 1.5 ? "Senescence" : "Vegetative";
        } else {
          // Annuals die (Senescence) after their harvest season ends
          targetState = "Senescence";
        }
      }

      // If the state needs to change based on our FSM, queue it!
      if (targetState !== currentState) {
        updates.push({ id: item.id, growth_state: targetState });
      }
    }

    log(FN, "transitions_planned", {
      total: items.length,
      changing: updates.length,
      transitions: updates.map((u: any) => ({ id: u.id, state: u.growth_state })),
    });

    // Batch update the database
    if (updates.length > 0) {
      for (const u of updates) {
        await supabase
          .from("inventory_items")
          .update({ growth_state: u.growth_state })
          .eq("id", u.id);
      }
    }

    log(FN, "complete", { updated: updates.length });

    return new Response(
      JSON.stringify({ message: `Updated ${updates.length} plant states.` }),
      { headers: corsHeaders, status: 200 },
    );
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 400,
    });
  }
});
