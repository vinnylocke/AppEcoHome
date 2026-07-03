// Bulk-paste ailment-list parser for the Watchlist (RHO-4 Phase 2).
//
// Mirrors `parsePlantList.ts` for pests / diseases / invasive plants. Two paths:
//   - Sage+   → `parse-ailment-list` edge function (Gemini)
//   - everyone else → `parseAilmentListLocal` regex fallback
//
// Both return the same `ParsedAilment` shape so the review UI is identical
// across tiers. `type` is a best-effort classification the reviewer can change.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";

export type AilmentListType = "pest" | "disease" | "invasive_plant";

export interface ParsedAilment {
  name: string;
  type: AilmentListType;
  symptoms: string[];
  notes: string | null;
}

// ── AI parser (Sage+) ────────────────────────────────────────────────────

export async function parseAilmentListAi(text: string): Promise<ParsedAilment[]> {
  const { data, error } = await supabase.functions.invoke("parse-ailment-list", {
    body: { text },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.ailments) ? (data.ailments as ParsedAilment[]) : [];
}

// ── Regex fallback ───────────────────────────────────────────────────────

const PEST_HINTS = /aphid|mite|fly\b|whitefly|thrip|beetle|weevil|caterpillar|\bworm\b|larvae?|grub|slug|snail|moth\b|scale\b|mealybug|sawfly|leafhopper|nematode|\bant\b|rabbit|deer|mouse|mice|vole|\bpest\b|insect/i;
const INVASIVE_HINTS = /knotweed|bindweed|ground elder|nettle|bramble|ivy\b|weed\b|invasive|dandelion|couch grass|horsetail|himalayan balsam|ragwort/i;

/** Best-effort type classification from the ailment name + notes. */
export function classifyAilmentType(text: string): AilmentListType {
  if (INVASIVE_HINTS.test(text)) return "invasive_plant";
  if (PEST_HINTS.test(text)) return "pest";
  return "disease";
}

/**
 * Best-effort regex parser. One ailment per non-empty line. Accepted shapes:
 *   - Aphids
 *   - Aphids - sticky leaves, curled shoots
 *   - Powdery mildew (white dusty coating on leaves)
 *   - Black spot: yellowing; leaf drop
 *   - Japanese knotweed
 *
 * The name is the head of the line; a trailing `-`/`:`/parenthesised block is
 * split into symptom titles (on `,`/`;`) with a bit left over as notes.
 */
export function parseAilmentListLocal(text: string): ParsedAilment[] {
  const out: ParsedAilment[] = [];
  if (!text || typeof text !== "string") return out;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const rawLine of lines) {
    if (out.length >= 200) break;

    let line = rawLine;
    let detail: string | null = null;

    // Trailing parenthesised block → detail.
    const parenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      line = parenMatch[1].trim();
      detail = parenMatch[2].trim();
    }

    // Trailing dash/colon block → detail. A colon may sit directly after the
    // name ("Black spot: …"); dashes need surrounding spaces so hyphenated
    // names ("day-lily") aren't split.
    const sepMatch = line.match(/^(.*?)(?:\s[-—–]\s|:\s*)(.+)$/);
    if (sepMatch) {
      const after = sepMatch[2].trim();
      detail = detail ? `${after}, ${detail}` : after;
      line = sepMatch[1].trim();
    }

    const name = line.slice(0, 120);
    if (!name) continue;

    // Split the detail into symptom titles on `,`/`;`; keep them short.
    const symptoms = detail
      ? detail
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => s.slice(0, 120))
      : [];

    out.push({
      name,
      type: classifyAilmentType(`${name} ${detail ?? ""}`),
      symptoms,
      notes: null,
    });
  }

  return out;
}

/**
 * Single entry point used by the modal. Routes Sage+ to the edge fn and
 * everyone else to the local regex parser. On AI failure we fall back to
 * regex so the user always gets a usable result.
 */
export async function parseAilmentList(
  text: string,
  opts: { aiEnabled: boolean },
): Promise<{ ailments: ParsedAilment[]; source: "ai" | "local" }> {
  if (opts.aiEnabled) {
    try {
      const ailments = await parseAilmentListAi(text);
      if (ailments.length > 0) {
        return { ailments, source: "ai" };
      }
    } catch (err) {
      Logger.error("parseAilmentList AI path failed — falling back", err);
    }
  }
  return { ailments: parseAilmentListLocal(text), source: "local" };
}
