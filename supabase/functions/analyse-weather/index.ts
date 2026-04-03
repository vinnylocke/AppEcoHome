import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const homeId = body?.record?.home_id;

    if (!homeId) throw new Error("Missing home_id in request body.");

    console.log(`🔍 Analyzing weather for home: ${homeId}`);

    // Fetch snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from("weather_snapshots")
      .select("data")
      .eq("home_id", homeId)
      .single();

    if (snapError || !snapshot)
      throw new Error("Could not find weather snapshot.");

    // Fetch locations
    const { data: locations, error: locError } = await supabase
      .from("locations")
      .select("id, name, is_outside")
      .eq("home_id", homeId);

    if (locError || !locations) throw new Error("Could not find locations.");

    // --- 1. Identify Outside Locations ---
    const outsideLocations = locations.filter((loc) => loc.is_outside);

    // --- 2. THE GUARD CLAUSE: Handle homes with no outside areas ---
    if (outsideLocations.length === 0) {
      console.log(
        "ℹ️ No outside locations found for this home. Skipping weather analysis.",
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "No outside locations to protect.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const hourly = snapshot.data.hourly;
    if (!hourly) throw new Error("No hourly data in snapshot.");

    const alerts = [];
    let foundFrost = false;
    let foundWind = false;

    // --- 3. Run Analysis ---
    for (let i = 0; i < 48; i++) {
      if (hourly.temperature_2m[i] === undefined) break;

      const temp = hourly.temperature_2m[i];
      const wind = hourly.wind_speed_10m[i];
      const time = hourly.time[i];

      // ❄️ FROST CHECK
      if (!foundFrost && temp <= 2) {
        outsideLocations.forEach((loc) => {
          alerts.push({
            location_id: loc.id,
            type: "frost",
            severity: "critical",
            message: `Frost warning: ${Math.round(temp)}°C expected.`,
            starts_at: time,
          });
        });
        foundFrost = true;
      }

      // 💨 WIND CHECK
      if (!foundWind && wind >= 40) {
        outsideLocations.forEach((loc) => {
          alerts.push({
            location_id: loc.id,
            type: "wind",
            severity: "warning",
            message: `High winds expected (${Math.round(wind)} km/h).`,
            starts_at: time,
          });
        });
        foundWind = true;
      }

      if (foundFrost && foundWind) break;
    }

    // 4. Save to Database
    if (alerts.length > 0) {
      console.log(`🚨 Found ${alerts.length} alerts! Saving to database...`);
      const { error: upsertError } = await supabase
        .from("weather_alerts")
        .upsert(alerts, { onConflict: "location_id, type" });

      if (upsertError) throw upsertError;
    } else {
      console.log(`✅ Weather looks good. No alerts generated.`);
    }

    return new Response(
      JSON.stringify({ success: true, alertsGenerated: alerts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("🔥 ANALYZE ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
