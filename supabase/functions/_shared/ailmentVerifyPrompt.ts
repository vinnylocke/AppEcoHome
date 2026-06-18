/**
 * Ailment Library verifier contract (Phase 3) — pure prompt + schema + apply.
 *
 * Unlike the plant verifier (Wikipedia/GBIF cross-check), there's no clean
 * external taxonomy source for pests/diseases, so this is an AI **self-critique**
 * pass: a fresh model reviews each entry for factual accuracy, completeness, and
 * — critically — SAFE treatment advice (no unsafe chemical dosing; always pair
 * with cultural/organic options). Verdict `matched` → valid=true; `amended` →
 * overwrite the corrected fields, valid=false.
 */

export type AilmentVerdict = "matched" | "amended";

export interface AilmentRowForVerify {
  name: string;
  kind: string;
  scientific_name: string | null;
  description: string | null;
  symptoms: string[];
  causes: string | null;
  treatment: string | null;
  prevention: string | null;
  severity: string | null;
  affected_plant_types: string[];
  organic_friendly: boolean | null;
}

export const AILMENT_VERIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["matched", "amended"] },
    amendments: {
      type: "OBJECT",
      properties: {
        scientific_name:      { type: "STRING" },
        description:          { type: "STRING" },
        symptoms:             { type: "ARRAY", items: { type: "STRING" } },
        causes:               { type: "STRING" },
        treatment:            { type: "STRING" },
        prevention:           { type: "STRING" },
        severity:             { type: "STRING", enum: ["low", "moderate", "high", "critical"] },
        affected_plant_types: { type: "ARRAY", items: { type: "STRING" } },
        organic_friendly:     { type: "BOOLEAN" },
      },
    },
    notes: { type: "STRING" },
  },
  required: ["verdict"],
} as const;

export function buildAilmentVerifyPrompt(row: AilmentRowForVerify): string {
  return `You are a horticultural fact-checker reviewing one ailment entry for a gardening reference.

ENTRY:
  name: ${row.name}
  kind: ${row.kind}
  scientific_name: ${row.scientific_name ?? "(none)"}
  description: ${row.description ?? "(none)"}
  symptoms: ${(row.symptoms ?? []).join("; ") || "(none)"}
  causes: ${row.causes ?? "(none)"}
  treatment: ${row.treatment ?? "(none)"}
  prevention: ${row.prevention ?? "(none)"}
  severity: ${row.severity ?? "(none)"}
  affected_plant_types: ${(row.affected_plant_types ?? []).join(", ") || "(none)"}
  organic_friendly: ${row.organic_friendly ?? "(unknown)"}

Check the entry for: factual accuracy (is the science correct?), completeness (are symptoms/treatment/prevention/severity present and sensible?), and SAFETY of the treatment advice.

SAFETY RULES — the treatment MUST NOT contain unsafe or specific chemical dosing/rates; it should name active-ingredient classes only generically and ALWAYS include cultural/organic/non-chemical options. If the current treatment violates this, AMEND it.

If everything is accurate, complete and safe → verdict="matched" with no amendments.
Otherwise → verdict="amended" and return ONLY the fields that need correcting in "amendments" (corrected values). Fill any missing severity. Return ONLY the JSON object.`;
}

const VALID_SEVERITY = new Set(["low", "moderate", "high", "critical"]);
const toStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
  : typeof v === "string" && v.trim() ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];

export interface VerifyResult { verdict: AilmentVerdict; amendments?: Record<string, unknown>; notes?: string }

/**
 * Resolve the DB patch from a verify result. `matched` → just mark valid.
 * `amended` → the allowed corrected fields + valid=false. Pure; coerces/validates
 * amendment shapes so a bad field can't corrupt the row. Returns null when there
 * is nothing safe to write (amended with no usable fields → treat as matched).
 */
export function applyVerifyResult(result: VerifyResult): Record<string, unknown> {
  const base = { verified_at: new Date().toISOString() };
  if (result.verdict !== "amended" || !result.amendments) {
    return { ...base, valid: true };
  }
  const a = result.amendments;
  const patch: Record<string, unknown> = {};
  if (typeof a.scientific_name === "string" && a.scientific_name.trim()) patch.scientific_name = a.scientific_name.trim();
  if (typeof a.description === "string" && a.description.trim()) patch.description = a.description.trim();
  if (typeof a.causes === "string" && a.causes.trim()) patch.causes = a.causes.trim();
  if (typeof a.treatment === "string" && a.treatment.trim()) patch.treatment = a.treatment.trim();
  if (typeof a.prevention === "string" && a.prevention.trim()) patch.prevention = a.prevention.trim();
  if (typeof a.severity === "string" && VALID_SEVERITY.has(a.severity)) patch.severity = a.severity;
  if (typeof a.organic_friendly === "boolean") patch.organic_friendly = a.organic_friendly;
  if (a.symptoms !== undefined) { const s = toStrArray(a.symptoms); if (s.length) patch.symptoms = s; }
  if (a.affected_plant_types !== undefined) { const s = toStrArray(a.affected_plant_types); if (s.length) patch.affected_plant_types = s; }

  // Nothing usable amended → treat as a pass so we don't churn the row.
  if (Object.keys(patch).length === 0) return { ...base, valid: true };
  return { ...base, valid: false, ...patch };
}

export function parseVerify(text: string): VerifyResult | null {
  try {
    const obj = JSON.parse(text);
    if (obj && (obj.verdict === "matched" || obj.verdict === "amended")) return obj as VerifyResult;
  } catch { /* fall through */ }
  return null;
}
