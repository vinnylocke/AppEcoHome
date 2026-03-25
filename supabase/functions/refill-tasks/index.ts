import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WATER_UNIT_MULTIPLIERS = {
  "Every Week": 1,
  "Every Two Weeks": 0.5,
  "Every Month": 0.25,
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  // 1. Fetch all planted items and their care guides
  const { data: items, error: fetchError } = await supabase
    .from('inventory_items')
    .select(`
      id, home_id, plant_id, plant_name, planted_at, created_at,
      plants ( care_guide )
    `)
    .eq('status', 'Planted');

  if (fetchError) return new Response(fetchError.message, { status: 500 });

  const tasksToInsert = [];
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30); // 30-day "Look Ahead"

  for (const item of items) {
    const care = item.plants?.care_guide;
    if (!care?.waterFrequency || !care?.waterUnit) continue;

    const daysInterval = 7 / (care.waterFrequency * WATER_UNIT_MULTIPLIERS[care.waterUnit]);

    // 2. Find the latest watering task for this specific plant instance
    const { data: latest } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('inventory_item_id', item.id)
      .eq('type', 'Watering')
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastDate = new Date(latest?.due_date || item.planted_at || item.created_at);
    let pointer = new Date(lastDate);

    // 3. Fill the gap until we reach the 30-day horizon
    while (pointer < horizon) {
      pointer = new Date(pointer.getTime() + daysInterval * 24 * 60 * 60 * 1000);
      if (pointer > new Date()) {
        tasksToInsert.push({
          title: `Water ${item.plant_name}`,
          type: 'Watering',
          status: 'Pending',
          due_date: pointer.toISOString(),
          inventory_item_id: item.id,
          home_id: item.home_id,
          plant_id: item.plant_id
        });
      }
      if (tasksToInsert.length > 500) break; // Safety cap
    }
  }

  if (tasksToInsert.length > 0) {
    await supabase.from('tasks').insert(tasksToInsert);
  }

  return new Response(JSON.stringify({ message: `Added ${tasksToInsert.length} tasks` }), {
    headers: { 'Content-Type': 'application/json' },
  });
})