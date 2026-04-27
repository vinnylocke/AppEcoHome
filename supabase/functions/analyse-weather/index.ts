import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, warn, error as logError } from "../_shared/logger.ts";

const FN = "analyse-weather";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const homeId = body?.record?.home_id;

    log(FN, "request_received", { homeId: homeId ?? null });

    if (!homeId) throw new Error("Missing home_id in request body.");

    // Fetch snapshot & locations
    const { data: snapshot } = await supabase
      .from("weather_snapshots")
      .select("data")
      .eq("home_id", homeId)
      .single();
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name, is_outside")
      .eq("home_id", homeId);

    if (!snapshot || !locations) throw new Error("Missing data.");

    log(FN, "context_loaded", { homeId, locationsCount: locations.length });

    const outsideLocations = locations.filter((loc) => loc.is_outside);
    if (outsideLocations.length === 0) {
      log(FN, "no_outside_locations", { homeId });
      return new Response(
        JSON.stringify({ success: true, message: "No outside locations." }),
        { headers: corsHeaders },
      );
    }

    // Check if any tropical plants are in outside areas — if so, lower frost threshold to 5°C
    const outsideLocationIds = outsideLocations.map((l) => l.id);
    const { data: outsideAreas } = await supabase
      .from("areas")
      .select("id")
      .in("location_id", outsideLocationIds);
    const outsideAreaIds = (outsideAreas || []).map((a) => a.id);

    let frostThreshold = 2;
    if (outsideAreaIds.length > 0) {
      const { data: outdoorInventory } = await supabase
        .from("inventory_items")
        .select("plants(tropical)")
        .eq("home_id", homeId)
        .in("area_id", outsideAreaIds);
      const hasTropicalOutdoor = (outdoorInventory || []).some((item: any) => item.plants?.tropical === true);
      if (hasTropicalOutdoor) {
        frostThreshold = 5;
        log(FN, "tropical_plants_detected", { homeId, frostThreshold });
      }
    }

    const hourly = snapshot.data.hourly;
    const alerts = [];

    let foundFrost = false;
    let foundWind = false;
    let foundRain = false;

    for (let i = 0; i < 48; i++) {
      if (hourly.temperature_2m[i] === undefined) break;

      const temp = hourly.temperature_2m[i];
      const wind = hourly.wind_speed_10m[i];
      const code = hourly.weather_code[i];
      const time = hourly.time[i];

      if (!foundFrost && temp <= frostThreshold) {
        outsideLocations.forEach((loc) =>
          alerts.push({
            location_id: loc.id,
            type: "frost",
            severity: "critical",
            message: `Frost warning: ${Math.round(temp)}°C expected.${frostThreshold > 2 ? " Tropical plants are at risk." : ""}`,
            starts_at: time,
          }),
        );
        foundFrost = true;
      }
      if (!foundWind && wind >= 40) {
        outsideLocations.forEach((loc) =>
          alerts.push({
            location_id: loc.id,
            type: "wind",
            severity: "warning",
            message: `High winds expected (${Math.round(wind)} km/h).`,
            starts_at: time,
          }),
        );
        foundWind = true;
      }
      if (!foundRain && code >= 50 && code <= 99) {
        outsideLocations.forEach((loc) =>
          alerts.push({
            location_id: loc.id,
            type: "rain",
            severity: "info",
            message: `Rain forecasted. Outdoor watering will be skipped.`,
            starts_at: time,
          }),
        );
        foundRain = true;
      }

      if (foundFrost && foundWind && foundRain) break;
    }

    log(FN, "alerts_detected", { homeId, alertsCount: alerts.length, frost: foundFrost, wind: foundWind, rain: foundRain });

    // Save Weather Alerts
    if (alerts.length > 0) {
      await supabase
        .from("weather_alerts")
        .upsert(alerts, { onConflict: "location_id, type" });

      // 🚀 NEW: Create Cross-Platform Notifications (Deduplicated per home)
      const notificationsToInsert = [];
      if (foundRain)
        notificationsToInsert.push({
          home_id: homeId,
          type: "weather_alert",
          title: "Nature is watering today! 🌧️",
          body: "Rain is forecasted. We've auto-completed your outdoor watering tasks.",
        });
      if (foundFrost)
        notificationsToInsert.push({
          home_id: homeId,
          type: "weather_alert",
          title: "Frost Warning ❄️",
          body: "Freezing temperatures expected. Please protect your outdoor plants.",
        });
      if (foundWind)
        notificationsToInsert.push({
          home_id: homeId,
          type: "weather_alert",
          title: "High Winds Expected 💨",
          body: "Strong winds forecasted. Secure any vulnerable outdoor plants.",
        });

      if (notificationsToInsert.length > 0) {
        await supabase.from("notifications").insert(notificationsToInsert);
      }
    }

    log(FN, "complete", { homeId, alertsCount: alerts.length });

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
    });
  } catch (error: any) {
    logError(FN, "error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
