export const mapPerenualToBlueprints = (speciesData: any, itemId: string) => {
  const blueprints = [];

  // 💧 1. Watering Logic
  const waterMap: Record<string, number> = { 
    Frequent: 3, Average: 7, Minimum: 14, None: 30 
  };
  blueprints.push({
    inventory_item_id: itemId,
    task_type: "watering",
    frequency_days: waterMap[speciesData.watering] || 7,
    is_recurring: true,
    priority: speciesData.care_level === "High" ? "High" : "Medium"
  });

  // ✂️ 2. Pruning Logic (Seasonal)
  if (speciesData.pruning_month && speciesData.pruning_month.length > 0) {
    const monthMap: Record<string, number> = { 
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    speciesData.pruning_month.forEach((m: string) => {
      blueprints.push({
        inventory_item_id: itemId,
        task_type: "pruning",
        start_month: monthMap[m.toLowerCase()],
        is_recurring: false, // Only happens in specific months
        priority: "Low"
      });
    });
  }

  // 🪴 3. Repotting/Maintenance (Based on Growth Rate)
  if (speciesData.growth_rate === "Fast") {
    blueprints.push({
      inventory_item_id: itemId,
      task_type: "maintenance",
      frequency_days: 180, // Check every 6 months
      is_recurring: true
    });
  }

  return blueprints;
};