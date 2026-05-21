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

export interface GuideSection {
  category: GrowGuideCategory;
  applicable: boolean;
  title: string;
  summary: string;
  key_facts: { label: string; value: string }[];
  steps: { step: number; title: string; detail: string }[];
  tips: string[];
  notes: string | null;
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
  return false;
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
