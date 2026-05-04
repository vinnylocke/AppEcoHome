export const TASK_CATEGORIES = [
  "Planting",
  "Watering",
  "Harvesting",
  "Maintenance",
  "Pruning",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
