// Sun-fit calculator — compares each plant's preferred sun range to the shape's
// computed sun classification to surface mismatches in the editor.

import type { SunClass } from "../sunAnalysis";

export type PlantSunPreference = "Full Sun" | "Partly Sunny" | "Partly Shady" | "Shade" | "Unknown";

// Maps free-form plant `sunlight` values from external sources (Perenual, Verdantly, manual)
// to our internal SunClass enum.
export function parsePlantSunPreference(sunlight: string | string[] | null | undefined): PlantSunPreference {
  if (!sunlight) return "Unknown";
  // `sunlight` is frequently a string[] — Perenual/api plants store it as an
  // array (plantProvider defaults it to `[]`), and occasionally a non-string.
  // Coerce before any string op: a raw array crashed `.trim()` and took down
  // the whole layout editor via its sun overlay (RHOZLY-3Y). Joining preserves
  // the ordered includes() matching below (full → part → shade).
  const raw = Array.isArray(sunlight) ? sunlight.join(" ") : String(sunlight);
  const s = raw.trim().toLowerCase();
  if (!s) return "Unknown";
  if (s.includes("full sun") || s === "sun" || s.includes("full_sun")) return "Full Sun";
  if (s.includes("part sun") || s.includes("partial sun") || s.includes("partly sunny") || s.includes("filtered sun")) return "Partly Sunny";
  if (s.includes("part shade") || s.includes("partial shade") || s.includes("partly shady") || s.includes("dappled")) return "Partly Shady";
  if (s.includes("shade") || s.includes("deep shade") || s.includes("full shade")) return "Shade";
  return "Unknown";
}

const RANK: Record<SunClass, number> = {
  "Full Sun":     3,
  "Partly Sunny": 2,
  "Partly Shady": 1,
  "Shade":        0,
};

const PREF_RANK: Record<PlantSunPreference, number | null> = {
  "Full Sun":     3,
  "Partly Sunny": 2,
  "Partly Shady": 1,
  "Shade":        0,
  "Unknown":      null,
};

export type SunFit = "Match" | "AdjacentDrier" | "AdjacentShadier" | "Mismatch" | "Unknown";

/** How well a plant fits a shape's sun classification.
 *  AdjacentShadier — bed gets less sun than plant prefers (one step).
 *  AdjacentDrier   — bed gets more sun than plant prefers (one step).
 */
export function getPlantSunFit(plantPref: PlantSunPreference, shapeClass: SunClass): SunFit {
  const p = PREF_RANK[plantPref];
  if (p == null) return "Unknown";
  const s = RANK[shapeClass];
  const diff = p - s;
  if (diff === 0) return "Match";
  if (Math.abs(diff) === 1) return diff > 0 ? "AdjacentShadier" : "AdjacentDrier";
  return "Mismatch";
}

export type ShapeFitSummary = "fit" | "mixed" | "mismatch" | "unknown";

/** Aggregate per-shape fit summary across all linked plants. */
export function getShapeFitSummary(
  fits: SunFit[],
): ShapeFitSummary {
  if (fits.length === 0) return "unknown";
  const known = fits.filter((f) => f !== "Unknown");
  if (known.length === 0) return "unknown";

  const matches = known.filter((f) => f === "Match" || f === "AdjacentDrier" || f === "AdjacentShadier").length;
  const total = known.length;

  if (matches === total) return "fit";
  if (matches >= total / 2) return "mixed";
  return "mismatch";
}
