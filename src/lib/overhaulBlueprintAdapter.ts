// Adapter — Garden Overhaul blueprint → designed-plan blueprint shape.
//
// The Garden Overhaul edge function emits a blueprint with a richer
// gardener-facing shape (plant_list, prep_steps as strings,
// maintenance_schedule with freeform frequency strings). PlanStaging,
// however, was built for the designed-plan shape (plant_manifest,
// preparation_tasks with task_index + depends_on_index,
// custom_maintenance_tasks with frequency_days). To run overhaul
// plans through the same 5-phase engine without forking the engine,
// this adapter normalises the overhaul blueprint on read.
//
// The adapter is intentionally tolerant — overhaul plans authored
// against earlier schema variants should still pass through cleanly.

interface OverhaulPlantListItem {
  common_name?: string;
  scientific_name?: string;
  role?: string;
  quantity?: number;
  spacing_cm?: number;
  notes?: string;
}

interface OverhaulMaintenanceItem {
  task?: string;
  frequency?: string;
  best_months?: string[];
  detail?: string;
}

interface OverhaulBlueprint {
  project_overview?: {
    title?: string;
    summary?: string;
    difficulty?: string;
    maintenance?: string;
    timeline?: string;
  };
  plant_list?: OverhaulPlantListItem[];
  prep_steps?: string[];
  maintenance_schedule?: OverhaulMaintenanceItem[];
  // If already in designed shape (e.g. someone regenerated through
  // the standard planner), pass these through verbatim.
  plant_manifest?: any[];
  preparation_tasks?: any[];
  custom_maintenance_tasks?: any[];
  infrastructure_requirements?: any;
  [k: string]: any;
}

interface DesignedBlueprint {
  project_overview: { title: string; summary?: string; [k: string]: any };
  infrastructure_requirements: {
    suggested_area_name: string;
    suggested_medium: string;
    suggested_sunlight: string;
  };
  plant_manifest: Array<{
    common_name: string;
    scientific_name: string;
    quantity: number;
    role: string;
    aesthetic_reason: string;
    horticultural_reason: string;
    procurement_advice: string;
  }>;
  preparation_tasks: Array<{
    task_index: number;
    title: string;
    description: string;
    depends_on_index: number | null;
  }>;
  custom_maintenance_tasks: Array<{
    title: string;
    description: string;
    frequency_days: number;
  }>;
  [k: string]: any;
}

/**
 * Parse a freeform frequency string (e.g. "weekly", "every 2 weeks",
 * "twice a month") into an approximate `frequency_days` integer.
 * Falls back to 30 (monthly) if the string is unrecognised.
 */
export function parseFrequencyDays(input: string | undefined | null): number {
  if (!input) return 30;
  const s = input.toLowerCase().trim();

  // Direct keyword matches first (most common cases).
  if (/\b(daily|every day|each day)\b/.test(s)) return 1;
  if (/\b(twice a week|2x a week|two times a week)\b/.test(s)) return 3;
  if (/\b(weekly|once a week|every week|each week)\b/.test(s)) return 7;
  if (/\b(fortnightly|biweekly|bi-weekly|every other week|every two weeks)\b/.test(s)) return 14;
  if (/\b(monthly|once a month|every month|each month)\b/.test(s)) return 30;
  if (/\b(quarterly|every quarter|every three months|every 3 months)\b/.test(s)) return 91;
  if (/\b(twice a year|biannually|bi-annually|every six months|every 6 months)\b/.test(s)) return 182;
  if (/\b(annually|yearly|once a year|every year|each year)\b/.test(s)) return 365;

  // Pattern: "every N day(s)/week(s)/month(s)/year(s)".
  const everyN = s.match(/every\s+(\d+)\s*(day|week|month|year)s?/);
  if (everyN) {
    const n = parseInt(everyN[1], 10);
    const unit = everyN[2];
    if (unit === "day") return n;
    if (unit === "week") return n * 7;
    if (unit === "month") return n * 30;
    if (unit === "year") return n * 365;
  }

  // Pattern: "N times a week/month/year".
  const nTimes = s.match(/(\d+)\s*times?\s*(?:a|per)\s*(week|month|year)/);
  if (nTimes) {
    const n = parseInt(nTimes[1], 10);
    const unit = nTimes[2];
    if (n > 0) {
      if (unit === "week") return Math.max(1, Math.round(7 / n));
      if (unit === "month") return Math.max(1, Math.round(30 / n));
      if (unit === "year") return Math.max(1, Math.round(365 / n));
    }
  }

  return 30;
}

/**
 * Derive a short title from a freeform prep-step string. Uses the
 * first sentence (up to the first period) or first 60 chars,
 * whichever is shorter.
 */
function deriveTitle(text: string): string {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length <= 80) return firstSentence;
  return text.slice(0, 60).trim() + (text.length > 60 ? "…" : "");
}

/**
 * Normalise an overhaul blueprint into the designed-plan shape so it
 * can flow through PlanStaging unchanged. Idempotent — passing an
 * already-designed blueprint through returns it untouched.
 */
export function normaliseOverhaulBlueprint(
  raw: OverhaulBlueprint | null | undefined,
): DesignedBlueprint | null {
  if (!raw) return null;

  // If this already looks like a designed blueprint, pass through.
  // We treat the presence of plant_manifest + preparation_tasks as
  // strong signal it's already normalised.
  if (Array.isArray(raw.plant_manifest) && Array.isArray(raw.preparation_tasks)) {
    return {
      ...raw,
      project_overview: raw.project_overview ?? { title: "Overhaul Plan" },
      infrastructure_requirements:
        raw.infrastructure_requirements ?? {
          suggested_area_name: raw.project_overview?.title ?? "Overhauled Garden",
          suggested_medium: "Garden Soil",
          suggested_sunlight: "part shade",
        },
      plant_manifest: raw.plant_manifest,
      preparation_tasks: raw.preparation_tasks,
      custom_maintenance_tasks: raw.custom_maintenance_tasks ?? [],
    } as DesignedBlueprint;
  }

  const projectTitle = raw.project_overview?.title ?? "Garden Overhaul";

  // ── plant_list → plant_manifest ─────────────────────────────────
  const plantManifest = (raw.plant_list ?? []).map((p) => ({
    common_name: p.common_name ?? "Unnamed plant",
    scientific_name: p.scientific_name ?? "",
    quantity: typeof p.quantity === "number" && p.quantity > 0 ? Math.round(p.quantity) : 1,
    role: p.role ?? "fill",
    aesthetic_reason: p.notes ?? "",
    horticultural_reason: p.spacing_cm ? `Spacing: ${p.spacing_cm}cm` : "",
    procurement_advice: "Procure locally or search Shed.",
  }));

  // ── prep_steps (strings) → preparation_tasks (objects) ──────────
  const preparationTasks = (raw.prep_steps ?? []).map((step, idx) => ({
    task_index: idx,
    title: deriveTitle(step),
    description: step,
    depends_on_index: idx > 0 ? idx - 1 : null,
  }));

  // ── maintenance_schedule → custom_maintenance_tasks ─────────────
  const customMaintenanceTasks = (raw.maintenance_schedule ?? []).map((m) => {
    const descParts: string[] = [];
    if (m.detail) descParts.push(m.detail);
    if (m.frequency) descParts.push(`Frequency: ${m.frequency}`);
    if (Array.isArray(m.best_months) && m.best_months.length > 0) {
      descParts.push(`Best months: ${m.best_months.join(", ")}`);
    }
    return {
      title: m.task ?? "Maintenance task",
      description: descParts.join("\n"),
      frequency_days: parseFrequencyDays(m.frequency),
    };
  });

  // ── infrastructure_requirements (synthesised) ───────────────────
  // Overhaul AI doesn't currently emit area-specific recommendations,
  // so default sensibly. The user can override during Phase 1.
  const infrastructureRequirements = {
    suggested_area_name: projectTitle,
    suggested_medium: "Garden Soil",
    suggested_sunlight: "part shade",
  };

  return {
    ...raw,
    project_overview: {
      ...raw.project_overview,
      title: projectTitle,
    },
    infrastructure_requirements: infrastructureRequirements,
    plant_manifest: plantManifest,
    preparation_tasks: preparationTasks,
    custom_maintenance_tasks: customMaintenanceTasks,
  } as DesignedBlueprint;
}
