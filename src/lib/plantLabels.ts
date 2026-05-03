interface PlantLabelSource {
  plant_type?: string | null;
  cycle?: string | null;
  watering?: string | null;
  care_level?: string | null;
  indoor?: boolean;
  is_edible?: boolean;
  drought_tolerant?: boolean;
  tropical?: boolean;
  pruning_month?: string[] | null;
}

/**
 * Derives guide-matching labels from Perenual/AI plant data.
 * Called at insert time for API and AI-sourced plants.
 * Manual plants have user-supplied labels from the form instead.
 */
export function derivePlantLabels(data: PlantLabelSource): string[] {
  const labels = new Set<string>();

  if (data.plant_type) {
    labels.add(data.plant_type);
  }

  if (data.cycle) {
    const c = data.cycle.toLowerCase();
    if (c.includes("perennial")) {
      labels.add("Perennial");
    } else if (c.includes("biennial") || c.includes("biannual")) {
      labels.add("Biennial");
    } else if (c.includes("annual")) {
      labels.add("Annual");
    }
  }

  if (data.watering) {
    const w = data.watering.toLowerCase();
    if (w.includes("frequent")) {
      labels.add("Frequent Watering");
    } else if (w.includes("minimum") || w.includes("none")) {
      labels.add("Drought Tolerant");
    }
  }

  if (data.drought_tolerant) {
    labels.add("Drought Tolerant");
  }

  if (data.care_level) {
    const cl = data.care_level.toLowerCase();
    if (
      cl.includes("high") ||
      cl.includes("expert") ||
      cl.includes("advanced")
    ) {
      labels.add("High Maintenance");
    } else if (
      cl.includes("low") ||
      cl.includes("beginner") ||
      cl.includes("easy")
    ) {
      labels.add("Easy Care");
    }
  }

  if (data.indoor) labels.add("Indoor");
  if (data.is_edible) labels.add("Edible");
  if (data.tropical) labels.add("Tropical");

  if (Array.isArray(data.pruning_month) && data.pruning_month.length > 0) {
    labels.add("Pruning");
  }

  return Array.from(labels);
}
