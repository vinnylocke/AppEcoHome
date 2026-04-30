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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {}
    const targetHomeId = body.home_id;

    let query = supabase.from("homes").select("id, address");
    if (targetHomeId) {
      console.log(`🎯 Targeted sync triggered for home: ${targetHomeId}`);
      query = query.eq("id", targetHomeId);
    }

    const { data: homes, error } = await query;

    if (error || !homes || homes.length === 0) {
      return new Response(JSON.stringify({ error: "No homes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    let processedHomesCount = 0;

    for (const home of homes) {
      const locationQuery = home.address?.trim();

      if (!locationQuery) continue;

      console.log(`🌍 Locating coordinates for: "${locationQuery}"...`);

      try {
        let lat, lng, locationName, country;

        // --- GEOCODER 1: OPEN-METEO (Great for Cities) ---
        const meteoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1`,
        );
        const meteoData = await meteoRes.json();

        if (meteoData.results && meteoData.results.length > 0) {
          lat = meteoData.results[0].latitude;
          lng = meteoData.results[0].longitude;
          locationName = meteoData.results[0].name;
          country = meteoData.results[0].country;
          console.log(`📍 Found via Open-Meteo: ${locationName}, ${country}`);
        }
        // --- GEOCODER 2: POSTCODES.IO FALLBACK (Great for UK Postcodes) ---
        else {
          console.log(
            `⚠️ Open-Meteo missed it. Trying UK Postcode Database...`,
          );
          // Clean the postcode (remove spaces) for the API
          const cleanPostcode = locationQuery.replace(/\s+/g, "");
          const pcRes = await fetch(
            `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
          );

          if (pcRes.status === 200) {
            const pcData = await pcRes.json();
            lat = pcData.result.latitude;
            lng = pcData.result.longitude;
            locationName = pcData.result.postcode;
            country = "UK";
            console.log(
              `📍 Found via Postcodes.io: ${locationName}, ${country}`,
            );
          }
        }

        // --- DID WE FIND COORDINATES? ---
        if (lat !== undefined && lng !== undefined) {
          console.log(`⛅ Fetching weather for Lat: ${lat}, Lng: ${lng}...`);

          const baseUrl = "https://api.open-meteo.com/v1/forecast";
          const params = new URLSearchParams({
            latitude: lat.toString(),
            longitude: lng.toString(),
            // Daily gives clean per-day aggregates for rain/wind/heat rules
            daily: "precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_probability_max",
            // Hourly: frost detection + chart metrics + weather code for all 7 days
            hourly: "temperature_2m,wind_speed_10m,precipitation_probability,relative_humidity_2m,weather_code",
            timezone: "auto",
            past_days: "1",    // yesterday's actuals let us reason about soil saturation
            forecast_days: "7",
          });

          const weatherRes = await fetch(`${baseUrl}?${params.toString()}`);
          const weatherData = await weatherRes.json();

          console.log(`💾 Saving weather to database...`);
          await supabase.from("weather_snapshots").upsert(
            {
              home_id: home.id,
              data: weatherData,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "home_id" },
          );

          console.log(`✅ Successfully updated weather for Home ${home.id}`);

          // =================================================================
          // 🚀 THE NATIVE FUNCTION CHAIN
          // =================================================================
          console.log(`🔗 Triggering analyse-weather for home ${home.id}...`);

          const { error: invokeError } = await supabase.functions.invoke(
            "analyse-weather",
            {
              body: {
                record: { home_id: home.id },
              },
            },
          );

          if (invokeError) {
            console.error(`❌ Failed to trigger analyse-weather:`, invokeError);
          } else {
            console.log(
              `✅ analyse-weather completed successfully for home ${home.id}!`,
            );
          }
          // =================================================================

          processedHomesCount++;
        } else {
          console.error(
            `❌ BOTH Geocoders failed to find anything for "${locationQuery}"`,
          );
        }
      } catch (err) {
        console.error(`❌ Fatal error processing ${locationQuery}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Sync complete",
        homesUpdated: processedHomesCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("🔥 CRITICAL EDGE FUNCTION CRASH:", error);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
