/**
 * Plant Grow Guides — shared schema + diff + prompt helpers.
 *
 * Used by:
 *   - `plant-doctor` edge fn (action: generate_grow_guide) — on-demand
 *     generation triggered by the user tapping Generate / Refresh.
 *   - `refresh-stale-grow-guides` cron — 90-day automated regeneration.
 *
 * Keeping schema + prompt + diff in one shared module so the two surfaces
 * can never drift.
 */

export const GROW_GUIDE_CATEGORIES = [
  "water",
  "soil",
  "sunlight",
  "propagation",
  "germination",
  "pruning",
  "flowering",
  "harvesting",
  "senescence",
] as const;

export type GrowGuideCategory = (typeof GROW_GUIDE_CATEGORIES)[number];

export const SCHEDULABLE_TASK_TYPES = [
  "Watering",
  "Pruning",
  "Harvesting",
  "Planting",
  "Maintenance",
  "Fertilizing",
  "Inspection",
] as const;

export type SchedulableTaskType = (typeof SCHEDULABLE_TASK_TYPES)[number];

export const MONTH_ABBREVS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type MonthAbbrev = (typeof MONTH_ABBREVS)[number];

/**
 * The AI-emitted scheduling guidance per section. Each entry maps to a
 * `tasks` (one-off) or `task_blueprints` (recurring) row when the user
 * taps Add to calendar. See `src/lib/scheduleFromSchedulableTask.ts` for
 * the month → next-occurrence date conversion.
 *
 * `active_months` is calibrated to the user's hemisphere by the prompt:
 * "spring" lands in Mar–May for Northern, Sep–Nov for Southern. Empty
 * or `null` means "year-round".
 */
export interface SchedulableTask {
  title: string;
  description: string;
  task_type: SchedulableTaskType;
  is_recurring: boolean;
  /** Days between runs when recurring. null for one-off. */
  frequency_days: number | null;
  /** 3-letter month abbrevs ("Jan"..."Dec"). null or [] = year-round. */
  active_months: MonthAbbrev[] | null;
  /** For recurring tasks — overrides the months-derived span. Optional. */
  duration_days: number | null;
  priority: "Low" | "Medium" | "High";
  /** Index into the section's own schedulable_tasks array; one-offs only. */
  depends_on_index: number | null;
}

export interface GuideSection {
  category: GrowGuideCategory;
  applicable: boolean;
  title: string;
  summary: string;
  key_facts: { label: string; value: string }[];
  steps: { step: number; title: string; detail: string }[];
  tips: string[];
  notes: string | null;
  /**
   * AI-emitted task suggestions for this section. May be undefined on
   * older cached payloads predating this schema extension — UI tolerates
   * absence by hiding the Add-to-calendar affordance.
   */
  schedulable_tasks?: SchedulableTask[];
}

export interface PlantGrowGuide {
  schema_version: number;
  generated_at: string;
  sections: GuideSection[];
}

/**
 * Gemini responseSchema enforcing the envelope shape. The model returns
 * all 9 sections every time; `applicable: false` means "this concept
 * doesn't fit this plant" and the UI hides the section entirely.
 */
export const GROW_GUIDE_SCHEMA = {
  type: "OBJECT",
  properties: {
    schema_version: { type: "INTEGER", description: "Always 1 for v1." },
    generated_at:   { type: "STRING",  description: "ISO 8601 timestamp." },
    sections: {
      type: "ARRAY",
      description:
        "Always 9 entries — one per category, in this exact order: water, soil, sunlight, propagation, germination, pruning, flowering, harvesting, senescence.",
      items: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: [...GROW_GUIDE_CATEGORIES],
            description: "The category slug for this section.",
          },
          applicable: {
            type: "BOOLEAN",
            description:
              "true if this concept applies to this plant. Set false for: harvesting on purely ornamental species; propagation/germination on commercially-only-propagated species; senescence on truly perennial species without a notable decline phase. When false, still return all other fields with empty/null content.",
          },
          title:    { type: "STRING", description: "Short display heading, e.g. 'Watering'." },
          summary:  { type: "STRING", description: "1-2 sentence overview. Action-oriented, not encyclopaedic." },
          key_facts: {
            type: "ARRAY",
            description:
              "2-5 concrete label/value pairs. Numbers preferred. Empty array [] when applicable is false.",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                value: { type: "STRING" },
              },
              required: ["label", "value"],
            },
          },
          steps: {
            type: "ARRAY",
            description:
              "Ordered how-to steps. Use for action sections (propagation, germination, pruning, harvesting). Empty array [] for informational-only sections (water, soil, sunlight, flowering, senescence) or when not applicable.",
            items: {
              type: "OBJECT",
              properties: {
                step:   { type: "INTEGER" },
                title:  { type: "STRING" },
                detail: { type: "STRING" },
              },
              required: ["step", "title", "detail"],
            },
          },
          tips: {
            type: "ARRAY",
            description: "0-4 short bullet tips — common pitfalls, microclimate adjustments, regional tweaks. Empty array allowed.",
            items: { type: "STRING" },
          },
          notes: {
            type: "STRING",
            nullable: true,
            description:
              "Optional one-line caveat. Null when nothing useful to add. Examples: 'Highly variable in coastal microclimates' / 'Mature plants tolerate more drought'.",
          },
          schedulable_tasks: {
            type: "ARRAY",
            description:
              "Concrete, calendar-bound task suggestions for this section. The user adds these to their calendar with one tap — Watering / Pruning / Harvesting / Sowing schedules etc. Empty array allowed; expected to be non-empty mainly for: water (recurring water schedule), soil (one-off feed), propagation/germination (one-off sow + follow-up), pruning (seasonal pruning window), harvesting (recurring harvest window). Other sections usually empty.",
            items: {
              type: "OBJECT",
              properties: {
                title:       { type: "STRING",  description: "Short action title — what the user sees on the calendar." },
                description: { type: "STRING",  description: "1-2 sentence detail, action-oriented. Will be shown on the task." },
                task_type: {
                  type: "STRING",
                  enum: [...SCHEDULABLE_TASK_TYPES],
                  description:
                    "Map to the closest existing type. Watering / Pruning / Harvesting are obvious. Planting = sowing or transplanting. Fertilizing = soil feed. Inspection = checking on something (e.g. 'check for ripe fruit'). Maintenance is the catch-all for everything else.",
                },
                is_recurring: { type: "BOOLEAN", description: "True for repeating tasks (watering, harvesting checks). False for one-offs (sow, top-out, take cuttings)." },
                frequency_days: {
                  type: "INTEGER",
                  nullable: true,
                  description: "Days between runs when is_recurring=true. null for one-off. Typical values: 1 (daily check), 3-7 (water), 14 (feed), 28 (deep prune).",
                },
                active_months: {
                  type: "ARRAY",
                  nullable: true,
                  description:
                    "3-letter month abbreviations defining when this task is active. CALIBRATE to the user's hemisphere — UK spring = Mar/Apr/May, Southern hemisphere spring = Sep/Oct/Nov. null or empty for year-round tasks. For one-off tasks, the first month is when the task should fire.",
                  items: { type: "STRING", enum: [...MONTH_ABBREVS] },
                },
                duration_days: {
                  type: "INTEGER",
                  nullable: true,
                  description: "Optional override for the recurring task's active span. Usually null — we derive from active_months.",
                },
                priority: {
                  type: "STRING",
                  enum: ["Low", "Medium", "High"],
                  description: "Default Medium. High for time-critical (harvesting before frost), Low for nice-to-have (deadheading).",
                },
                depends_on_index: {
                  type: "INTEGER",
                  nullable: true,
                  description: "Zero-based index into THIS section's schedulable_tasks array when this task must happen after another (e.g. 'transplant seedlings' depends on 'sow seeds'). One-offs only. null otherwise.",
                },
              },
              required: ["title", "description", "task_type", "is_recurring", "active_months", "priority"],
            },
          },
        },
        required: ["category", "applicable", "title", "summary", "key_facts", "steps", "tips"],
      },
    },
  },
  required: ["schema_version", "generated_at", "sections"],
};

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export interface PromptContext {
  commonName: string;
  scientificName?: string | null;
  source: "manual" | "api" | "ai" | "verdantly";
  manualNotes?: string | null;
  hemisphere: "Northern" | "Southern";
  currentDate: string;       // ISO YYYY-MM-DD
}

export function buildGrowGuidePrompt(ctx: PromptContext): string {
  const sciLine = ctx.scientificName
    ? `Scientific name: ${ctx.scientificName}.`
    : `Scientific name unknown.`;
  const manualLine =
    ctx.source === "manual" && ctx.manualNotes?.trim()
      ? `User notes about this plant: ${ctx.manualNotes.trim()}`
      : "";

  return `You are an expert horticulturalist writing a comprehensive grow guide for "${ctx.commonName}".
${sciLine}
Source: ${ctx.source}.
${manualLine}

Location context:
  Hemisphere: ${ctx.hemisphere}
  Current date: ${ctx.currentDate}

You MUST return a JSON envelope with EXACTLY these 9 sections, in this exact order, one for each category:
  water, soil, sunlight, propagation, germination, pruning, flowering, harvesting, senescence.

For EACH section:
  - "category": the exact category slug above.
  - "applicable": true ONLY if this concept applies to this plant. Set false for:
      • harvesting on purely ornamental species (no edible/usable yield);
      • propagation or germination when the species is commercially propagated only (rare cultivars, sterile hybrids);
      • senescence on truly perennial species with no notable decline phase.
  - "title": short display heading (e.g. "Watering"; not "Water section").
  - "summary": 1-2 sentences, action-oriented, not encyclopaedic.
  - "key_facts": 2-5 label/value pairs. Concrete numbers preferred.
       Example for water: [{label: "Frequency", value: "Every 3-4 days in summer"},
                           {label: "Method", value: "Water at soil level, avoid leaves"}].
       Empty array [] when applicable=false.
  - "steps": ordered how-to ONLY for action sections (propagation, germination, pruning, harvesting).
       Empty array [] for informational sections (water, soil, sunlight, flowering, senescence) and when applicable=false.
  - "tips": 0-4 bullets — pitfalls, microclimate adjustments. Empty array allowed.
  - "notes": optional one-line caveat. null when nothing useful to add.
  - "schedulable_tasks": concrete calendar-bound tasks for this section. EXPECTED PER CATEGORY:
       • water → ONE recurring "Water {plant}" task; frequency_days from key_facts; active_months = growing season.
       • soil → ONE Fertilizing task (one-off in early spring OR recurring 28d through the growing season); active_months = feeding window.
       • sunlight → empty (informational).
       • propagation → ONE OR TWO one-offs for taking cuttings / dividing; active_months = the right propagation window.
       • germination → ONE one-off "Sow {plant} seeds"; active_months = sowing window. Optionally a follow-up "Transplant seedlings" with depends_on_index pointing at the sow task.
       • pruning → ONE pruning task (one-off or low-cadence recurring); active_months = the pruning window.
       • flowering → usually empty (informational). Optional one-off "Deadhead {plant}" with active_months = post-flowering.
       • harvesting → ONE recurring "Check {plant} for ripeness" task; frequency_days small (1-3); active_months = harvest window.
       • senescence → usually empty. Optional one-off "Cut back" / "Mulch for winter" at end-of-season.
    For "applicable: false" sections, return [].
    **TIMING RULE (CRITICAL):**
       For every emitted schedulable_task, active_months is the SINGLE source of truth for WHEN the task should fire. The client converts active_months into a concrete calendar date; nothing else feeds the date.
       - Do NOT put timing into the description ("in late spring", "after the last frost", "during summer"). Encode that in active_months instead. The description must describe the ACTION (e.g., "Pinch out the soft side shoots between each pair of leaves").
       - Calibrate active_months to ${ctx.hemisphere} hemisphere — spring = Mar/Apr/May for Northern, Sep/Oct/Nov for Southern; summer = Jun/Jul/Aug for Northern, Dec/Jan/Feb for Southern.
       - For genuinely year-round tasks (e.g., indoor houseplant watering with no seasonal variation), set active_months: null. This is rare — most outdoor tasks DO have a season; pick the months they're active even if it's most of the year.
       - NEVER return active_months as an empty array. Use null for year-round, or specific months otherwise.

CRITICAL:
  - Calibrate timing to ${ctx.hemisphere} hemisphere. "Late spring" means
    Sept–Nov for Southern, Mar–May for Northern.
  - Use Celsius for temperature, mm for rainfall, cm for spacing/depth/height.
  - For "applicable: false" sections, still return ALL the other fields with empty/null content
    so the schema is uniform.
  - "schema_version" must be 1. "generated_at" must be the current ISO 8601 timestamp.
  - No emoji. No HTML. Plain text only.`;
}

// ---------------------------------------------------------------------------
// Diff helper
// ---------------------------------------------------------------------------

/**
 * Returns the list of category slugs whose section content changed
 * meaningfully between two guide payloads. Used by:
 *   - The refresh-stale-grow-guides cron to decide whether to bump
 *     freshness_version on a regenerated guide.
 *   - The on-demand `generate_grow_guide` action to set updated_fields.
 *
 * "Meaningful" change ignores cosmetic differences:
 *   - Trims surrounding whitespace on strings before comparison.
 *   - Lowercases strings (Gemini sometimes capitalises "Tip 1" vs "tip 1").
 *   - For arrays, compares sorted-by-content (key_facts, tips, steps).
 */
export function diffGrowGuide(
  oldGuide: PlantGrowGuide | null,
  newGuide: PlantGrowGuide,
): GrowGuideCategory[] {
  if (!oldGuide) {
    return [...GROW_GUIDE_CATEGORIES];
  }
  const changed: GrowGuideCategory[] = [];
  for (const newSection of newGuide.sections) {
    const oldSection = oldGuide.sections.find((s) => s.category === newSection.category);
    if (!oldSection || sectionDiffers(oldSection, newSection)) {
      changed.push(newSection.category);
    }
  }
  return changed;
}

function sectionDiffers(a: GuideSection, b: GuideSection): boolean {
  if (a.applicable !== b.applicable) return true;
  if (norm(a.title) !== norm(b.title)) return true;
  if (norm(a.summary) !== norm(b.summary)) return true;
  if (norm(a.notes ?? "") !== norm(b.notes ?? "")) return true;
  if (!keyFactsEqual(a.key_facts, b.key_facts)) return true;
  if (!stepsEqual(a.steps, b.steps)) return true;
  if (!tipsEqual(a.tips, b.tips)) return true;
  if (!schedulableTasksEqual(a.schedulable_tasks, b.schedulable_tasks)) return true;
  return false;
}

function schedulableTasksEqual(
  a: SchedulableTask[] | undefined,
  b: SchedulableTask[] | undefined,
): boolean {
  // Treat "missing" and "empty" as equivalent — older cached guides
  // predate this field; a fresh regen with [] shouldn't bump the version.
  const ax = a ?? [];
  const bx = b ?? [];
  if (ax.length !== bx.length) return false;
  // Set-style compare: sort by normalised title+task_type+frequency.
  const sig = (t: SchedulableTask) => [
    norm(t.title),
    t.task_type,
    String(t.is_recurring),
    String(t.frequency_days ?? ""),
    (t.active_months ?? []).slice().sort().join(","),
    String(t.duration_days ?? ""),
    t.priority,
  ].join("::");
  const aa = ax.map(sig).sort();
  const bb = bx.map(sig).sort();
  return aa.every((v, i) => v === bb[i]);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function keyFactsEqual(
  a: { label: string; value: string }[],
  b: { label: string; value: string }[],
): boolean {
  if (a.length !== b.length) return false;
  const ax = [...a].map((f) => `${norm(f.label)}::${norm(f.value)}`).sort();
  const bx = [...b].map((f) => `${norm(f.label)}::${norm(f.value)}`).sort();
  return ax.every((v, i) => v === bx[i]);
}

function stepsEqual(
  a: { step: number; title: string; detail: string }[],
  b: { step: number; title: string; detail: string }[],
): boolean {
  if (a.length !== b.length) return false;
  // Steps are ordered — compare in order.
  return a.every(
    (s, i) =>
      s.step === b[i].step && norm(s.title) === norm(b[i].title) && norm(s.detail) === norm(b[i].detail),
  );
}

function tipsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ax = [...a].map(norm).sort();
  const bx = [...b].map(norm).sort();
  return ax.every((v, i) => v === bx[i]);
}
