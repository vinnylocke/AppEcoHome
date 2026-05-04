import { type Hemisphere, getSinglePeriodRange } from "./seasonal";

interface PlantScheduleRow {
  home_id: string;
  plant_id: number | string;
  title: string;
  description: string;
  task_type: "Harvesting" | "Maintenance" | "Watering" | "Pruning";
  trigger_event: "Planted";
  start_reference: string;
  start_offset_days: 0;
  end_reference: string;
  end_offset_days: 0;
  frequency_days: number;
  is_recurring: true;
  is_auto_generated: true;
}

interface BuildSchedulesParams {
  plantId: number | string;
  homeId: string;
  hemisphere: Hemisphere;
  harvestPeriods: string[];
  pruningPeriods: string[];
  wateringMinDays: number;
  wateringMaxDays: number;
}

export function buildAutoSeasonalSchedules({
  plantId,
  homeId,
  hemisphere,
  harvestPeriods,
  pruningPeriods,
  wateringMinDays,
  wateringMaxDays,
}: BuildSchedulesParams): PlantScheduleRow[] {
  const schedules: PlantScheduleRow[] = [];

  harvestPeriods.forEach((period) => {
    const { start, end } = getSinglePeriodRange(period, hemisphere);
    const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
    schedules.push({
      home_id: homeId,
      plant_id: plantId,
      title: `${niceTitle} Harvest`,
      description: `Auto-generated from Care Guide`,
      task_type: "Harvesting",
      trigger_event: "Planted",
      start_reference: `Seasonal:${start}:${niceTitle} Harvest Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${end}:${niceTitle} Harvest End`,
      end_offset_days: 0,
      frequency_days: 1,
      is_recurring: true,
      is_auto_generated: true,
    });
  });

  pruningPeriods.forEach((period) => {
    const { start, end } = getSinglePeriodRange(period, hemisphere);
    const niceTitle = period.charAt(0).toUpperCase() + period.slice(1);
    schedules.push({
      home_id: homeId,
      plant_id: plantId,
      title: `${niceTitle} Pruning`,
      description: `Auto-generated from Care Guide`,
      task_type: "Pruning",
      trigger_event: "Planted",
      start_reference: `Seasonal:${start}:${niceTitle} Pruning Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${end}:${niceTitle} Pruning End`,
      end_offset_days: 0,
      frequency_days: 1,
      is_recurring: true,
      is_auto_generated: true,
    });
  });

  const avgWatering = Math.max(
    1,
    Math.round((wateringMinDays + wateringMaxDays) / 2),
  );

  const summerDates = getSinglePeriodRange("summer", hemisphere);
  const winterDates = getSinglePeriodRange("winter", hemisphere);
  const springDates = getSinglePeriodRange("spring", hemisphere);
  const fallDates = getSinglePeriodRange("fall", hemisphere);

  schedules.push(
    {
      home_id: homeId,
      plant_id: plantId,
      title: `Summer Watering`,
      description: `Auto-generated high-frequency watering`,
      task_type: "Watering",
      trigger_event: "Planted",
      start_reference: `Seasonal:${summerDates.start}:Summer Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${summerDates.end}:Summer End`,
      end_offset_days: 0,
      frequency_days: wateringMinDays,
      is_recurring: true,
      is_auto_generated: true,
    },
    {
      home_id: homeId,
      plant_id: plantId,
      title: `Winter Watering`,
      description: `Auto-generated low-frequency watering`,
      task_type: "Watering",
      trigger_event: "Planted",
      start_reference: `Seasonal:${winterDates.start}:Winter Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${winterDates.end}:Winter End`,
      end_offset_days: 0,
      frequency_days: wateringMaxDays,
      is_recurring: true,
      is_auto_generated: true,
    },
    {
      home_id: homeId,
      plant_id: plantId,
      title: `Spring Watering`,
      description: `Auto-generated moderate watering`,
      task_type: "Watering",
      trigger_event: "Planted",
      start_reference: `Seasonal:${springDates.start}:Spring Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${springDates.end}:Spring End`,
      end_offset_days: 0,
      frequency_days: avgWatering,
      is_recurring: true,
      is_auto_generated: true,
    },
    {
      home_id: homeId,
      plant_id: plantId,
      title: `Autumn Watering`,
      description: `Auto-generated moderate watering`,
      task_type: "Watering",
      trigger_event: "Planted",
      start_reference: `Seasonal:${fallDates.start}:Autumn Start`,
      start_offset_days: 0,
      end_reference: `Seasonal:${fallDates.end}:Autumn End`,
      end_offset_days: 0,
      frequency_days: avgWatering,
      is_recurring: true,
      is_auto_generated: true,
    },
  );

  return schedules;
}
