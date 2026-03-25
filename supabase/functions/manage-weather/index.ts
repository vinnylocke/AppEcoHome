import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: snapshots } = await supabase.from('weather_snapshots').select('*');
  if (!snapshots) return new Response("No snapshots found");

  const results = { autoCompleted: 0, alertsCreated: 0 };

  for (const snap of snapshots) {
    const locId = snap.location_id;
    const weather = snap.data;
    const alertsToCreate = [];

   // --- LOGIC A: RAIN & AUTO-COMPLETE OUTDOOR PLANTS ---
    const rainHours = weather.hourly?.rain?.filter((r: number) => r > 0.5) || [];
    
    if (rainHours.length > 0) {
      const firstRainTime = new Date(rainHours[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // 1. Get IDs of all items that are OUTDOORS at this location
      const { data: outdoorItems } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('location_id', locId)
        .or('environment.eq.Outdoors,status.eq.Planted');

      if (outdoorItems && outdoorItems.length > 0) {
        const itemIds = outdoorItems.map(i => i.id);

        // ✅ FIX: Define the time range (Today only)
        // This creates a timestamp for 11:59:59 PM tonight
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // 2. Mark ONLY today's (or overdue) tasks as complete
        const { count } = await supabase
          .from('tasks')
          .update({ 
            status: 'Completed', 
            completed_at: new Date().toISOString(),
            description: `[Auto-completed: Rain expected today at ${firstRainTime}]` 
          })
          .eq('type', 'Watering')
          .eq('status', 'Pending')
          .in('inventory_item_id', itemIds)
          .lte('due_date', endOfToday.toISOString()); // 👈 This is the magic line (LTE = Less Than or Equal to)
          
        results.autoCompleted += (count || 0);
      }

      alertsToCreate.push({
        location_id: locId,
        type: 'rain',
        message: `Rain expected at ${firstRainTime}. Today's outdoor watering handled.`,
        starts_at: rainHours[0]
      });
    }
   // --- LOGIC B: EXTREME CONDITIONS ---
const temps = weather.hourly?.temperature_2m || [];
const winds = weather.hourly?.wind_speed_10m || []; // ✅ Now available
const maxTemp = temps.length ? Math.max(...temps) : 20;
const minTemp = temps.length ? Math.min(...temps) : 10;
const maxWind = winds.length ? Math.max(...winds) : 0; // ✅ Peak wind of the day

if (maxWind > 45) alertsToCreate.push({ 
  location_id: locId, 
  type: 'wind', 
  message: `High winds alert (${maxWind.toFixed(1)} km/h)! Secure delicate plants.`, 
  starts_at: new Date().toISOString() 
});
    if (minTemp <= 2) alertsToCreate.push({ location_id: locId, type: 'frost', message: `Frost risk (${minTemp.toFixed(1)}°C) tonight!`, starts_at: new Date().toISOString() });
    if (maxTemp > 30) alertsToCreate.push({ location_id: locId, type: 'heat', message: `Heatwave alert (${maxTemp.toFixed(1)}°C)!`, starts_at: new Date().toISOString() });

    // --- SYNC ALERTS ---
    await supabase.from('weather_alerts').delete().eq('location_id', locId);
    if (alertsToCreate.length > 0) {
      await supabase.from('weather_alerts').insert(alertsToCreate);
      results.alertsCreated += alertsToCreate.length;
    }
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
})