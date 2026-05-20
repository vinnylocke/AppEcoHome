/**
 * Build the environmental enrichment block that prefixes vision prompts.
 * Reads area, lux, companions, recent tasks, and weather for the given IDs.
 * Returns "" when no IDs are provided, otherwise "\n\n" + joined lines.
 *
 * Shared by the `diagnose` and `analyse_comprehensive` actions of the
 * plant-doctor edge function so they ground their AI reasoning in the
 * same context.
 */
export async function buildEnvBlock(
  supabase: any,
  { inventoryItemId, areaId, homeId }: {
    inventoryItemId?: string;
    areaId?: string;
    homeId?: string;
  },
): Promise<string> {
  if (!inventoryItemId && !areaId) return "";

  const fourteenDaysAgo = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];

  const [tasksRes, areaRes, luxRes, companionRes, weatherRes] = await Promise.all([
    inventoryItemId
      ? supabase.from("tasks")
          .select("type, title, status, due_date")
          .contains("inventory_item_ids", [inventoryItemId])
          .gte("due_date", fourteenDaysAgo)
          .order("due_date", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),

    areaId
      ? supabase.from("areas")
          .select("name, is_outside, sunlight, growing_medium, medium_ph, medium_texture, water_movement, nutrient_source")
          .eq("id", areaId)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    areaId
      ? supabase.from("area_lux_readings")
          .select("lux_value")
          .eq("area_id", areaId)
          .order("recorded_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),

    areaId && inventoryItemId
      ? supabase.from("inventory_items")
          .select("plant_name")
          .eq("area_id", areaId)
          .neq("id", inventoryItemId)
          .eq("status", "Planted")
          .limit(10)
      : Promise.resolve({ data: [] }),

    homeId
      ? supabase.from("weather_snapshots")
          .select("data")
          .eq("home_id", homeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lines: string[] = [];

  const area = areaRes.data;
  if (area) {
    lines.push(`GROWING ENVIRONMENT:`);
    lines.push(`  Area: ${area.name} (${area.is_outside ? "Outdoor" : "Indoor"})`);
    if (area.sunlight) lines.push(`  Sunlight: ${area.sunlight}`);
    if (area.growing_medium) lines.push(`  Growing medium: ${area.growing_medium}`);
    if (area.medium_ph) lines.push(`  Soil pH: ${area.medium_ph}`);
    if (area.medium_texture) lines.push(`  Texture: ${area.medium_texture}`);
    if (area.water_movement) lines.push(`  Drainage: ${area.water_movement}`);
    if (area.nutrient_source) lines.push(`  Nutrients: ${area.nutrient_source}`);
  }

  const luxRows = (luxRes.data ?? []) as any[];
  if (luxRows.length > 0) {
    const avgLux = Math.round(luxRows.reduce((s: number, r: any) => s + r.lux_value, 0) / luxRows.length);
    lines.push(`  Light (recent avg): ${avgLux.toLocaleString()} lux`);
  }

  const companions = (companionRes.data ?? []) as any[];
  if (companions.length > 0) {
    lines.push(`COMPANION PLANTS IN SAME AREA: ${companions.map((c: any) => c.plant_name).join(", ")}`);
  }

  const recentTasks = (tasksRes.data ?? []) as any[];
  if (recentTasks.length > 0) {
    lines.push(`RECENT CARE (last 14 days):`);
    for (const t of recentTasks) {
      lines.push(`  • [${t.status}] ${t.type}: ${t.title} (due ${t.due_date})`);
    }
  } else if (inventoryItemId) {
    lines.push(`RECENT CARE: No tasks logged for this plant in the last 14 days.`);
  }

  const weatherData = weatherRes.data?.data;
  if (weatherData) {
    const current = weatherData.current ?? weatherData.currently ?? null;
    if (current) {
      const tempC = current.temperature_2m ?? current.temp ?? null;
      const humidity = current.relative_humidity_2m ?? current.humidity ?? null;
      const condition = current.weather_description ?? current.condition ?? null;
      const parts: string[] = [];
      if (tempC != null) parts.push(`${Math.round(tempC)}°C`);
      if (humidity != null) parts.push(`${humidity}% humidity`);
      if (condition) parts.push(condition);
      if (parts.length > 0) lines.push(`CURRENT WEATHER: ${parts.join(", ")}`);
    }
  }

  return lines.length > 0 ? "\n\n" + lines.join("\n") : "";
}
