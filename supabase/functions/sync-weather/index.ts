import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // Use service role to bypass RLS
  );

  // 1. Fetch all locations that have a postcode
  const { data: locations } = await supabase
    .from("locations")
    .select("id, address");

  if (!locations) return new Response("No locations found");

  const postcodeMap = new Map(); // Cache for API results

  for (const loc of locations) {
    const postcode = loc.address?.trim().toUpperCase();
    if (!postcode) continue;

    // Check if we've already fetched weather for this postcode in THIS run
    if (!postcodeMap.has(postcode)) {
      try {
        // A. Geocode Postcode (Postcodes.io)
        const geoRes = await fetch(
          `https://api.postcodes.io/postcodes/${postcode}`,
        );
        const geoData = await geoRes.json();

        if (geoData.status === 200) {
          const { latitude: lat, longitude: lng } = geoData.result;

          // B. Fetch Open-Meteo Data
          const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code,temperature_2m,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,rain_sum,showers_sum,snowfall_sum&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,rain,showers,snowfall,weather_code,soil_temperature_6cm,soil_moisture_0_to_1cm,wind_speed_10m,wind_direction_10m&timezone=auto`;

          const weatherRes = await fetch(weatherUrl);
          const weatherData = await weatherRes.json();

          postcodeMap.set(postcode, weatherData);
        }
      } catch (err) {
        console.error(`Failed for ${postcode}:`, err);
      }
    }

    // C. Upsert into weather_snapshots
    const dataToStore = postcodeMap.get(postcode);
    if (dataToStore) {
      await supabase.from("weather_snapshots").upsert(
        {
          location_id: loc.id,
          data: dataToStore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id" },
      );
    }
  }

  return new Response(
    JSON.stringify({ message: "Sync complete", processed: locations.length }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});
