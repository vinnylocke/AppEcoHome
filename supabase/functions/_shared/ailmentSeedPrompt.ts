/**
 * Ailment Library seeder contract — prompt + JSON schema + row mapper.
 *
 * Mirrors `plantSeedPrompt.ts` but for the pest/disease/invasive/disorder
 * catalogue. The AI proposes ailments NOT already in the library (an exclusion
 * list is supplied) and fills full detail. Pure + unit-tested so the seed
 * pipeline's shape is verifiable without the DB.
 */

export const AILMENT_SEED_BATCH_SIZE = 12;

export type AilmentKind = "pest" | "disease" | "invasive" | "disorder";
export type AilmentSeverity = "low" | "moderate" | "high" | "critical";

export interface AilmentSeedRow {
  name: string;
  kind: AilmentKind;
  scientific_name?: string | null;
  aliases?: string[] | null;
  description?: string | null;
  symptoms?: string[] | null;
  causes?: string | null;
  treatment?: string | null;
  prevention?: string | null;
  severity?: AilmentSeverity | null;
  affected_plant_types?: string[] | null;
  affected_families?: string[] | null;
  season?: string[] | null;
  organic_friendly?: boolean | null;
}

/** Gemini JSON-mode schema (TYPE-enum form, like plantSeedPrompt). */
export const AILMENT_SEED_BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    ailments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name:                 { type: "STRING" },
          kind:                 { type: "STRING", enum: ["pest", "disease", "invasive", "disorder"] },
          scientific_name:      { type: "STRING" },
          aliases:              { type: "ARRAY", items: { type: "STRING" } },
          description:          { type: "STRING" },
          symptoms:             { type: "ARRAY", items: { type: "STRING" } },
          causes:               { type: "STRING" },
          treatment:            { type: "STRING" },
          prevention:           { type: "STRING" },
          severity:             { type: "STRING", enum: ["low", "moderate", "high", "critical"] },
          affected_plant_types: { type: "ARRAY", items: { type: "STRING" } },
          affected_families:    { type: "ARRAY", items: { type: "STRING" } },
          season:               { type: "ARRAY", items: { type: "STRING" } },
          organic_friendly:     { type: "BOOLEAN" },
        },
        required: ["name", "kind"],
      },
    },
  },
  required: ["ailments"],
} as const;

/** Build the proposal prompt. The AI invents ailment names NOT in the exclusion
 *  list (capped to keep the prompt small) and fills full detail. */
export function buildAilmentSeedPrompt(count: number, excludeNames: string[]): string {
  const exclusion = excludeNames.length > 0
    ? `\n\nDO NOT include any of these (already in the library):\n${excludeNames.slice(0, 400).join(", ")}`
    : "";
  return `You are building a global horticultural reference of plant ailments for a gardening app.

Propose ${count} DISTINCT garden ailments — a mix of pests, diseases (fungal/bacterial/viral), invasive organisms, and physiological disorders (e.g. blossom-end rot) — that gardeners commonly encounter. Prefer widely-relevant, real ailments; do not invent fictional ones, do not duplicate, and do not list the same ailment under two names.

For EACH ailment populate every applicable field:
- name (common name), kind (pest | disease | invasive | disorder)
- scientific_name (the organism's latin name where one exists; omit for disorders)
- aliases (other common names)
- description (1-2 sentences)
- symptoms (concrete, observable signs — what the gardener actually sees)
- causes (what triggers/spreads it)
- treatment (practical control steps; for chemical controls, name the active ingredient class generically and ALWAYS pair it with non-chemical/cultural options — never give unsafe dosing)
- prevention (cultural practices that avoid it)
- severity (low | moderate | high | critical)
- affected_plant_types (common crop/plant groups, e.g. "tomato", "brassicas", "roses")
- affected_families (botanical families where relevant)
- season (when it's most active, e.g. "spring", "warm humid weather")
- organic_friendly (true if it can be managed with organic methods)

Return ONLY the JSON object matching the schema.${exclusion}`;
}

const toStrArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const VALID_KINDS = new Set(["pest", "disease", "invasive", "disorder"]);
const VALID_SEVERITY = new Set(["low", "moderate", "high", "critical"]);

/** Map a validated AI row to the `ailment_library` column shape. Returns null
 *  when the row is unusable (missing name or bad kind). Pure. */
export function ailmentRowToColumnShape(
  r: AilmentSeedRow,
  attribution: { seeded_by_run_id: string },
): Record<string, unknown> | null {
  const name = (r.name ?? "").trim();
  if (!name) return null;
  if (!r.kind || !VALID_KINDS.has(r.kind)) return null;
  const severity = r.severity && VALID_SEVERITY.has(r.severity) ? r.severity : null;
  return {
    name,
    kind: r.kind,
    scientific_name: r.scientific_name?.trim() || null,
    aliases: toStrArray(r.aliases),
    description: r.description?.trim() || null,
    symptoms: toStrArray(r.symptoms),
    causes: r.causes?.trim() || null,
    treatment: r.treatment?.trim() || null,
    prevention: r.prevention?.trim() || null,
    severity,
    affected_plant_types: toStrArray(r.affected_plant_types),
    affected_families: toStrArray(r.affected_families),
    season: toStrArray(r.season),
    organic_friendly: typeof r.organic_friendly === "boolean" ? r.organic_friendly : null,
    source: "ai",
    seeded_by_run_id: attribution.seeded_by_run_id,
    valid: null as boolean | null,
  };
}

/** Tolerant parse — salvage complete ailments from a truncated JSON response. */
export function parseAilmentBatch(text: string): { ailments: AilmentSeedRow[] } {
  try {
    const obj = JSON.parse(text);
    if (obj && Array.isArray(obj.ailments)) return obj as { ailments: AilmentSeedRow[] };
  } catch {
    // Salvage: grab the ailments array up to the last complete object.
    const start = text.indexOf('"ailments"');
    if (start >= 0) {
      const arrStart = text.indexOf("[", start);
      if (arrStart >= 0) {
        const lastClose = text.lastIndexOf("}");
        if (lastClose > arrStart) {
          try {
            const arr = JSON.parse(text.slice(arrStart, lastClose + 1) + "]");
            if (Array.isArray(arr)) return { ailments: arr as AilmentSeedRow[] };
          } catch { /* give up */ }
        }
      }
    }
  }
  return { ailments: [] };
}
