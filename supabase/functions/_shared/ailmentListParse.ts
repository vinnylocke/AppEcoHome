/**
 * parse-ailment-list contract — Gemini prompt + JSON schema + row normaliser.
 *
 * RHO-4 Phase 2. Mirrors the extraction contract of `parse-plant-list` but for
 * the Watchlist: a gardener pastes a free-text list of pests / diseases /
 * invasive plants and the AI returns candidate rows the client reviews before
 * committing to a batch `ailments` insert (all `source='manual'`).
 *
 * Pure module (no Deno.serve, no network) so the shape is unit-testable without
 * the DB — see supabase/tests/parseAilmentList.test.ts. The edge function
 * (parse-ailment-list/index.ts) wraps this with auth + tier gate + rate limit.
 */

/** The ailment type set — matches the `ailments_type_check` DB constraint. */
export type AilmentListType = "pest" | "disease" | "invasive_plant";

/** One extracted candidate row (the shared shape the AI + regex paths return). */
export interface ParsedAilment {
  name: string;
  type: AilmentListType;
  symptoms: string[];
  notes: string | null;
}

/** Gemini structured-output schema for the extraction call. */
export const AILMENT_PARSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ailments: {
      type: "ARRAY",
      description:
        "Between 0 and 200 candidate ailment rows extracted from the user's text. Skip lines that don't look like a pest, disease, or invasive plant.",
      items: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING",
            description:
              'The common name of the pest, disease, or invasive plant (e.g. "Aphids", "Powdery mildew", "Japanese knotweed"). Required.',
          },
          type: {
            type: "STRING",
            enum: ["pest", "disease", "invasive_plant"],
            description:
              'Classify: "pest" for insects/mites/molluscs/mammals; "disease" for fungal/bacterial/viral; "invasive_plant" for weeds and invasive plants. Best guess from the name — default "disease" if genuinely ambiguous.',
          },
          symptoms: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              'Short symptom titles the line mentions (e.g. "Curled leaves", "Sticky honeydew"). Empty array when none stated. DO NOT invent symptoms not in the text.',
          },
          notes: {
            type: "STRING",
            nullable: true,
            description:
              "Any leftover descriptive text from the line — affected plants, context, severity words. Null when nothing extra.",
          },
        },
        required: ["name", "type"],
      },
    },
  },
  required: ["ailments"],
} as const;

/** The extraction prompt. `text` is the gardener's raw paste. */
export function buildAilmentParsePrompt(text: string): string {
  return `You are extracting pest / disease / invasive-plant entries from a gardener's free-text paste for their Watchlist.

Each line is meant to describe ONE thing the gardener wants to watch for. The format is loose — examples:

  "Aphids - sticky leaves, curled shoots"
  "Powdery mildew (white dusty coating on leaves)"
  "Slugs and snails"
  "Japanese knotweed"
  "Black spot - roses, yellowing"
  "Vine weevil grubs in pots"

Return ONE row per ailment you can confidently extract. Skip lines that look like headers, comments, section labels, or unrelated text.

For each row, fill ONLY what you can extract from the line itself. DO NOT invent symptoms or details that aren't stated.

Field rules:
- name: the common name of the pest / disease / invasive plant. Required.
- type: one of "pest", "disease", "invasive_plant".
  * "pest" — insects, mites, molluscs, mammals (aphids, slugs, vine weevil, rabbits).
  * "disease" — fungal, bacterial, viral (powdery mildew, black spot, blight).
  * "invasive_plant" — weeds and invasive plants (knotweed, bindweed, ground elder).
  * Default to "disease" only when the name is genuinely ambiguous.
- symptoms: short symptom titles mentioned on the line ("Curled leaves", "White coating"). Empty array when none.
- notes: any leftover text — affected plants, context. Null when nothing extra.

OUTPUT: JSON only, matching the schema. No prose, no markdown.

THE PASTE:
${text}`;
}

const VALID_TYPES: ReadonlySet<string> = new Set([
  "pest",
  "disease",
  "invasive_plant",
]);

/** Cap matches the CSV 200-row cap (answer 4, 2026-07-03). */
export const MAX_AILMENT_CANDIDATES = 200;

function safeStr(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/** Coerce a raw type value to a valid AilmentListType, defaulting to "disease". */
export function normaliseAilmentType(value: unknown): AilmentListType {
  if (typeof value === "string") {
    const norm = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (VALID_TYPES.has(norm)) return norm as AilmentListType;
    if (norm === "invasive" || norm === "weed") return "invasive_plant";
  }
  return "disease";
}

/**
 * Normalise the raw Gemini JSON into a clean `ParsedAilment[]`. Drops rows with
 * no name, coerces the type, caps symptom titles, and caps the list length.
 */
export function normaliseAilments(raw: unknown): ParsedAilment[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { ailments?: unknown }).ailments;
  if (!Array.isArray(arr)) return [];
  const out: ParsedAilment[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = safeStr(r.name, 120);
    if (!name) continue;
    const symptoms = Array.isArray(r.symptoms)
      ? r.symptoms
          .map((s) => safeStr(s, 120))
          .filter((s): s is string => s !== null)
          .slice(0, 20)
      : [];
    out.push({
      name,
      type: normaliseAilmentType(r.type),
      symptoms,
      notes: safeStr(r.notes, 400),
    });
    if (out.length >= MAX_AILMENT_CANDIDATES) break;
  }
  return out;
}
