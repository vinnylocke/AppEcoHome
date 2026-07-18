// Add-Area wizard — AI setup review contract (2026-07-18).
//
// Pure prompt builder + response schema + parser/validator for the
// `area-setup-review` edge function. Scores how well a bed's configured
// conditions suit the plants placed in it (and the plants each other),
// and produces actionable recommendations. Deliberately defensive on the
// way out (closed vocabularies, clamps, drop-don't-render-junk) because
// the task recommendations feed straight into TaskActionButtons'
// blueprint/task creation. Deno-tested in
// supabase/tests/areaSetupReview.test.ts.

import { luxBandLabel } from "./luxBand.ts";

// ── Input ──────────────────────────────────────────────────────────────

export interface ReviewPlantInput {
  name: string;
  scientificName?: string | null;
  quantity: number;
  soilPhMin?: number | null;
  soilPhMax?: number | null;
  /** plants.sunlight jsonb coerced to string[] by the caller. */
  sunlight?: string[] | null;
  wateringMinDays?: number | null;
  wateringMaxDays?: number | null;
  soilMoistureMin?: number | null;
  soilMoistureMax?: number | null;
  soilEcMin?: number | null;
  soilEcMax?: number | null;
  soilTempMin?: number | null;
  soilTempMax?: number | null;
  hardinessMin?: number | string | null;
  hardinessMax?: number | string | null;
  cycle?: string | null;
  isToxicPets?: boolean | null;
  attracts?: string[] | null;
}

export interface AreaSetupReviewInput {
  area: {
    name: string;
    areaType?: string | null;
    isOutside: boolean;
    growingMedium?: string | null;
    mediumTexture?: string | null;
    mediumPh?: number | null;
    waterMovement?: string | null;
    nutrientSource?: string | null;
    peakLightLux?: number | null;
  };
  home: {
    hardinessZone?: number | string | null;
    climateZone?: string | null;
  };
  plants: ReviewPlantInput[];
}

// ── Output ─────────────────────────────────────────────────────────────

export type FitVerdict = "great" | "ok" | "poor" | "unknown";
export type CompatibilityVerdict = "well" | "minor" | "poor" | "unknown";

/** Matches TaskActionButtons' SuggestedTask contract exactly. */
export interface ReviewSuggestedTask {
  title: string;
  description: string;
  task_type: "Planting" | "Watering" | "Harvesting" | "Maintenance";
  due_in_days: number;
  is_recurring: boolean;
  frequency_days: number | null;
}

export interface AreaSetupReview {
  score: number; // 0–100
  headline: string;
  summary: string;
  plant_fit: Array<{ name: string; verdict: FitVerdict; note: string }>;
  compatibility: { verdict: CompatibilityVerdict; note: string };
  recommendations: {
    plants: Array<{ name: string; reason: string; search_query: string }>;
    tasks: ReviewSuggestedTask[];
    automations: Array<{ title: string; description: string }>;
  };
}

// Caps — a review is a summary, not a catalogue.
const MAX_PLANT_RECS = 5;
const MAX_TASK_RECS = 6;
const MAX_AUTOMATION_RECS = 3;

// ── Response schema (Gemini JSON mode) ─────────────────────────────────

export const AREA_SETUP_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", description: "0-100 overall suitability of the plants for this bed's conditions and each other" },
    headline: { type: "string", description: "One short sentence verdict" },
    summary: { type: "string", description: "2-4 sentences explaining the score" },
    plant_fit: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          verdict: { type: "string", enum: ["great", "ok", "poor", "unknown"] },
          note: { type: "string", description: "Why — reference the bed's actual pH/light/moisture values" },
        },
        required: ["name", "verdict", "note"],
      },
    },
    compatibility: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["well", "minor", "poor", "unknown"] },
        note: { type: "string" },
      },
      required: ["verdict", "note"],
    },
    recommendations: {
      type: "object",
      properties: {
        plants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              reason: { type: "string" },
              search_query: { type: "string", description: "Botanical or specific searchable name" },
            },
            required: ["name", "reason", "search_query"],
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              task_type: { type: "string", enum: ["Planting", "Watering", "Harvesting", "Maintenance"] },
              due_in_days: { type: "integer" },
              is_recurring: { type: "boolean" },
              frequency_days: { type: "integer", description: "Only when is_recurring" },
            },
            required: ["title", "description", "task_type", "due_in_days", "is_recurring"],
          },
        },
        automations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
      },
      required: ["plants", "tasks", "automations"],
    },
  },
  required: ["score", "headline", "summary", "plant_fit", "compatibility", "recommendations"],
} as const;

// ── Prompt ─────────────────────────────────────────────────────────────

function range(min: number | null | undefined, max: number | null | undefined, unit: string): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max}${unit}`;
  return `${min ?? "?"}–${max ?? "?"}${unit}`;
}

function plantLine(p: ReviewPlantInput): string {
  const bits: string[] = [];
  const ph = range(p.soilPhMin, p.soilPhMax, "");
  if (ph) bits.push(`pH ${ph}`);
  if (p.sunlight && p.sunlight.length) bits.push(`sun: ${p.sunlight.join("/")}`);
  const water = range(p.wateringMinDays, p.wateringMaxDays, "d");
  if (water) bits.push(`water every ${water}`);
  const moist = range(p.soilMoistureMin, p.soilMoistureMax, "%");
  if (moist) bits.push(`moisture ${moist}`);
  const ec = range(p.soilEcMin, p.soilEcMax, " µS/cm");
  if (ec) bits.push(`EC ${ec}`);
  const temp = range(p.soilTempMin, p.soilTempMax, "°C");
  if (temp) bits.push(`soil temp ${temp}`);
  const hardy = range(
    p.hardinessMin == null ? null : Number(p.hardinessMin),
    p.hardinessMax == null ? null : Number(p.hardinessMax),
    "",
  );
  if (hardy) bits.push(`hardiness ${hardy}`);
  if (p.cycle) bits.push(p.cycle.toLowerCase());
  if (p.isToxicPets) bits.push("toxic to pets");
  if (p.attracts && p.attracts.length) bits.push(`attracts ${p.attracts.slice(0, 3).join("/")}`);
  const sci = p.scientificName ? ` (${p.scientificName})` : "";
  const qty = p.quantity > 1 ? ` ×${p.quantity}` : "";
  return `  - ${p.name}${sci}${qty}${bits.length ? `: ${bits.join(" · ")}` : ": (no care data on file)"}`;
}

export function buildAreaSetupReviewPrompt(input: AreaSetupReviewInput): string {
  const { area, home, plants } = input;

  const bedLines = [
    `  Name: ${area.name}${area.areaType ? ` (${area.areaType})` : ""}`,
    `  Setting: ${area.isOutside ? "outdoor" : "indoor"}`,
    area.growingMedium ? `  Growing medium: ${area.growingMedium}` : null,
    area.mediumTexture ? `  Texture: ${area.mediumTexture}` : null,
    area.mediumPh != null ? `  Soil pH: ${area.mediumPh}` : null,
    area.waterMovement ? `  Water movement: ${area.waterMovement}` : null,
    area.nutrientSource ? `  Nutrient source: ${area.nutrientSource}` : null,
    luxBandLabel(area.peakLightLux) ? `  Peak light: ${luxBandLabel(area.peakLightLux)}` : null,
    home.climateZone ? `  Climate zone: ${home.climateZone}` : null,
    home.hardinessZone != null ? `  Hardiness zone: ${home.hardinessZone}` : null,
  ].filter(Boolean).join("\n");

  const plantBlock = plants.length > 0
    ? plants.map(plantLine).join("\n")
    : "  (no plants chosen yet — focus the review on what would thrive in this setup)";

  return `You are an expert horticulturist reviewing a NEWLY SET UP growing area before planting.

== THE BED ==
${bedLines}

== PLANTS THE GARDENER WANTS TO GROW HERE ==
${plantBlock}

== YOUR REVIEW ==
Score 0-100 how well suited these plants are to this bed's conditions AND to each other:
- 85+ = thriving setup, minor notes at most; 60-84 = workable with adjustments; below 60 = real mismatches.
- plant_fit: one entry PER plant listed above (same names). Judge against the bed's ACTUAL values (pH, light band, water movement, medium) — cite them in the note. Use "unknown" only when the plant has no care data.
- compatibility: do these plants suit sharing one bed (light/water/root competition, allelopathy, classic companions or antagonists)? "well" / "minor" (friction, manageable) / "poor" (bad pairing).
- recommendations.plants: up to ${MAX_PLANT_RECS} plants that would thrive in THIS setup and complement the chosen plants (companions, gap-fillers). search_query = botanical/specific searchable name.
- recommendations.tasks: up to ${MAX_TASK_RECS} concrete care tasks tailored to this setup (e.g. lime to raise pH for brassicas, ericaceous feed, mulching for a fast-draining bed). Recurring care → is_recurring true + frequency_days. due_in_days from today (0 = today).
- recommendations.automations: up to ${MAX_AUTOMATION_RECS} watering/sensor automation IDEAS suited to this bed (short title + why). Ideas only — do not assume specific hardware.
Be honest — a mediocre setup should score mediocre. No hedging language.`;
}

// ── Parser / validator ─────────────────────────────────────────────────

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const FIT_VERDICTS = new Set<FitVerdict>(["great", "ok", "poor", "unknown"]);
const COMPAT_VERDICTS = new Set<CompatibilityVerdict>(["well", "minor", "poor", "unknown"]);
const TASK_TYPES = new Set(["Planting", "Watering", "Harvesting", "Maintenance"]);

/**
 * Parse + validate the model's JSON (tolerates ```json fences). Returns
 * null when the core shape is unusable; individually malformed
 * recommendations are dropped, never rendered as junk.
 */
export function parseAreaSetupReview(raw: string): AreaSetupReview | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const headline = str(obj.headline);
  const summary = str(obj.summary);
  if (!headline || !summary) return null;

  const plantFitRaw = Array.isArray(obj.plant_fit) ? obj.plant_fit : [];
  const plant_fit = plantFitRaw
    .map((f) => {
      const r = f as Record<string, unknown>;
      const name = str(r.name);
      const verdict = str(r.verdict) as FitVerdict;
      if (!name || !FIT_VERDICTS.has(verdict)) return null;
      return { name, verdict, note: str(r.note) };
    })
    .filter((f): f is AreaSetupReview["plant_fit"][number] => f !== null);

  const compatRaw = (obj.compatibility ?? {}) as Record<string, unknown>;
  const compatVerdict = str(compatRaw.verdict) as CompatibilityVerdict;
  const compatibility = {
    verdict: COMPAT_VERDICTS.has(compatVerdict) ? compatVerdict : ("unknown" as const),
    note: str(compatRaw.note),
  };

  const recsRaw = (obj.recommendations ?? {}) as Record<string, unknown>;

  const plants = (Array.isArray(recsRaw.plants) ? recsRaw.plants : [])
    .map((p) => {
      const r = p as Record<string, unknown>;
      const name = str(r.name);
      if (!name) return null;
      return {
        name,
        reason: str(r.reason),
        search_query: str(r.search_query) || name,
      };
    })
    .filter((p): p is AreaSetupReview["recommendations"]["plants"][number] => p !== null)
    .slice(0, MAX_PLANT_RECS);

  const tasks = (Array.isArray(recsRaw.tasks) ? recsRaw.tasks : [])
    .map((t) => {
      const r = t as Record<string, unknown>;
      const title = str(r.title);
      if (!title) return null;
      const task_type = TASK_TYPES.has(str(r.task_type))
        ? (str(r.task_type) as ReviewSuggestedTask["task_type"])
        : "Maintenance";
      const is_recurring = r.is_recurring === true;
      return {
        title,
        description: str(r.description),
        task_type,
        due_in_days: clampInt(r.due_in_days, 0, 365, 0),
        is_recurring,
        frequency_days: is_recurring ? clampInt(r.frequency_days, 1, 365, 7) : null,
      };
    })
    .filter((t): t is ReviewSuggestedTask => t !== null)
    .slice(0, MAX_TASK_RECS);

  const automations = (Array.isArray(recsRaw.automations) ? recsRaw.automations : [])
    .map((a) => {
      const r = a as Record<string, unknown>;
      const title = str(r.title);
      if (!title) return null;
      return { title, description: str(r.description) };
    })
    .filter((a): a is AreaSetupReview["recommendations"]["automations"][number] => a !== null)
    .slice(0, MAX_AUTOMATION_RECS);

  return {
    score: clampInt(obj.score, 0, 100, 50),
    headline,
    summary,
    plant_fit,
    compatibility,
    recommendations: { plants, tasks, automations },
  };
}
