export const TASK_CATEGORIES = [
  "Planting",
  "Watering",
  "Harvesting",
  "Maintenance",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
