import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUsdaHardinessZone } from "../_shared/climateZones.ts";
import { captureException } from "../_shared/sentry.ts";

const FN = "sync-weather";

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

    let query = supabase.from("homes").select("id, address, lat, lng, hardiness_zone");
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
    const ONE_HOUR_MS = 60 * 60 * 1000;

    for (const home of homes) {
      try {
        // Idempotency guard: skip homes already synced within the last hour
        // to prevent duplicate runs from cron retries or manual triggers.
        const { data: existing } = await supabase
          .from("weather_snapshots")
          .select("updated_at")
          .eq("home_id", home.id)
          .single();
        if (existing?.updated_at) {
          const msSinceSync = Date.now() - new Date(existing.updated_at).getTime();
          if (msSinceSync < ONE_HOUR_MS) {
            console.log(`⏭️ Skipping home ${home.id} — synced ${Math.round(msSinceSync / 60000)}min ago`);
            continue;
          }
        }

        let lat: number | undefined = home.lat ?? undefined;
        let lng: number | undefined = home.lng ?? undefined;

        // Geocode from address only when coordinates are not already stored
        if (lat === undefined || lng === undefined) {
          const locationQuery = home.address?.trim();
          if (!locationQuery) continue;

          console.log(`🌍 Locating coordinates for: "${locationQuery}"...`);

          // --- GEOCODER 1: OPEN-METEO (Great for Cities) ---
          const meteoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1`,
            { signal: AbortSignal.timeout(10_000) },
          );
          const meteoData = meteoRes.ok ? await meteoRes.json() : {};

          if (meteoData.results && meteoData.results.length > 0) {
            lat = meteoData.results[0].latitude;
            lng = meteoData.results[0].longitude;
            console.log(`📍 Found via Open-Meteo: ${meteoData.results[0].name}, ${meteoData.results[0].country}`);
          }
          // --- GEOCODER 2: POSTCODES.IO FALLBACK (Great for UK Postcodes) ---
          else {
            console.log(`⚠️ Open-Meteo missed it. Trying UK Postcode Database...`);
            const cleanPostcode = locationQuery.replace(/\s+/g, "");
            const pcRes = await fetch(
              `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
              { signal: AbortSignal.timeout(8_000) },
            );
            if (pcRes.ok) {
              const pcData = await pcRes.json();
              lat = pcData.result.latitude;
              lng = pcData.result.longitude;
              console.log(`📍 Found via Postcodes.io: ${pcData.result.postcode}, UK`);
            }
          }

          if (lat !== undefined && lng !== undefined) {
            // Persist coordinates so future syncs and other features can use them
            await supabase.from("homes").update({ lat, lng }).eq("id", home.id);
            console.log(`💾 Saved lat=${lat}, lng=${lng} to home ${home.id}`);
          } else {
            console.error(`❌ BOTH Geocoders failed to find anything for "${locationQuery}"`);
            continue;
          }
        } else {
          console.log(`📍 Using stored coordinates lat=${lat}, lng=${lng} for home ${home.id}`);
        }

        // Derive USDA hardiness zone once — skip if already stored
        if (!home.hardiness_zone) {
          try {
            const zone = await fetchUsdaHardinessZone(lat, lng);
            await supabase.from("homes").update({ hardiness_zone: zone }).eq("id", home.id);
            console.log(`🌡 USDA Hardiness Zone ${zone} saved for home ${home.id}`);
          } catch (zoneErr) {
            console.warn(`⚠️ Could not derive USDA zone for home ${home.id}:`, zoneErr);
          }
        }

        console.log(`⛅ Fetching weather for Lat: ${lat}, Lng: ${lng}...`);

        const baseUrl = "https://api.open-meteo.com/v1/forecast";
        const params = new URLSearchParams({
          latitude: lat.toString(),
          longitude: lng.toString(),
          // Daily gives clean per-day aggregates for rain/wind/heat rules
          daily: "precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_probability_max",
          // Hourly: frost detection + chart metrics + weather code for all 7 days.
          // `precipitation` (mm/h) lets weather-defer automations sum expected
          // rain inside the recheck window instead of leaning on the daily total.
          hourly: "temperature_2m,wind_speed_10m,precipitation_probability,precipitation,relative_humidity_2m,weather_code",
          timezone: "auto",
          past_days: "1",
          forecast_days: "7",
        });

        const weatherRes = await fetch(`${baseUrl}?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });
        if (!weatherRes.ok) {
          console.error(`❌ Open-Meteo forecast error: ${weatherRes.status} for home ${home.id}`);
          continue;
        }
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
          console.log(`✅ analyse-weather completed successfully for home ${home.id}!`);
        }
        // =================================================================

        processedHomesCount++;
      } catch (err) {
        console.error(`❌ Fatal error processing home ${home.id}:`, err);
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
    await captureException(FN, error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
