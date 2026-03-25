import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Get all unique locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, lat, lng');

  if (!locations || locations.length === 0) {
    return new Response("No locations found", { status: 200 });
  }

  const results = { updated: 0, errors: 0 };

  // 2. Fetch and Cache Weather
  for (const loc of locations) {
    try {
      const params = new URLSearchParams({
        latitude: loc.lat.toString(),
        longitude: loc.lng.toString(),
        current: 'temperature_2m,relative_humidity_2m,rain,weather_code,surface_pressure,wind_speed_10m,dew_point_2m',
        // ✅ Added wind_speed_10m to hourly params
        hourly: 'temperature_2m,weather_code,uv_index,rain,wind_speed_10m',
        daily: 'uv_index_max,rain_sum,snowfall_sum',
        timezone: 'auto',
        forecast_days: '1'
      });

      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      const weatherData = await response.json();

      const { error: upsertError } = await supabase
        .from('weather_snapshots')
        .upsert({ 
          location_id: loc.id, 
          data: weatherData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'location_id' });

      if (upsertError) throw upsertError;
      results.updated++;
      
      await new Promise(r => setTimeout(r, 200)); 
    } catch (err) {
      console.error(`Error for ${loc.id}:`, err);
      results.errors++;
    }
  }

  // 3. Trigger the Manager
  console.log("Triggering manage-weather...");
  const { data: manageData, error: invokeError } = await supabase.functions.invoke('manage-weather', {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: { triggered_by: 'sync-weather', timestamp: new Date().toISOString() } 
  });

  if (invokeError) {
    console.error("Failed to trigger manage-weather:", invokeError);
  } else {
    console.log("Successfully triggered manage-weather:", manageData);
  }

  return new Response(
    JSON.stringify({ 
      status: "Sync complete", 
      weatherResults: results,
      managerTriggered: !invokeError,
      managerResponse: manageData 
    }), 
    { headers: { 'Content-Type': 'application/json' } }
  );
})