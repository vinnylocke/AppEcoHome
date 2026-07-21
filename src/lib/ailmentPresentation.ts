// Ailment presentation maps + matchers (ailment-library-shed-search overhaul
// Stage 1). Pure — no React, no supabase — so the library cards, the detail
// takeover, and the watchlist can share one visual language and the pieces are
// unit-testable. Colours are the HC-aware status-* token families, replacing
// the page's legacy stock-palette chips (migrate-on-touch).

import type { AilmentKind, AilmentSeverity } from "../services/ailmentLibraryService";

/** Kind → status-token chip classes + label. Icons stay in the component
 *  (src/lib is React-free); this maps the meaning-colour only. */
export const AILMENT_KIND_CLASSES: Record<AilmentKind, { label: string; chip: string; tile: string }> = {
  // Pests are the "keeping watch" family (rose) — matches the watchlist's own
  // watch framing; diseases caution (orange); invasives weather (amber — a
  // spreading, environmental problem); disorders sensor (sky — a reading that
  // is off, not an organism).
  pest:     { label: "Pest",     chip: "bg-status-watch-fill text-status-watch-ink border border-status-watch-line",       tile: "bg-status-watch-fill text-status-watch-ink" },
  disease:  { label: "Disease",  chip: "bg-status-caution-fill text-status-caution-ink border border-status-caution-line", tile: "bg-status-caution-fill text-status-caution-ink" },
  invasive: { label: "Invasive", chip: "bg-status-weather-fill text-status-weather-ink border border-status-weather-line", tile: "bg-status-weather-fill text-status-weather-ink" },
  disorder: { label: "Disorder", chip: "bg-status-sensor-fill text-status-sensor-ink border border-status-sensor-line",   tile: "bg-status-sensor-fill text-status-sensor-ink" },
};

/** Severity → status-token chip classes + label. low→success, moderate→caution,
 *  high→watch, critical→danger (the escalation ladder). */
export const AILMENT_SEVERITY_CLASSES: Record<AilmentSeverity, { label: string; chip: string }> = {
  low:      { label: "Low",      chip: "bg-status-success-fill text-status-success-ink border border-status-success-line" },
  moderate: { label: "Moderate", chip: "bg-status-caution-fill text-status-caution-ink border border-status-caution-line" },
  high:     { label: "High",     chip: "bg-status-watch-fill text-status-watch-ink border border-status-watch-line" },
  critical: { label: "Critical", chip: "bg-status-danger-fill text-status-danger-ink border border-status-danger-line" },
};

/**
 * "Could this affect your garden?" — match a library entry's affected plant
 * types/families against the home's plant names. Deliberately conservative:
 * matching is at the WORD level — an affected-type stem must equal one of the
 * plant name's word stems (naive singular/plural bridging via trailing "s"/
 * "es") — never bare substring containment, so "ash" can't match "Squash"
 * (review finding). Returns matched plant names, de-duplicated, capped.
 */
export function matchAffectedPlants(
  affected: string[],
  plantNames: string[],
  limit = 3,
): string[] {
  const stems = (s: string): string[] => {
    const n = s.trim().toLowerCase();
    const out = [n];
    if (n.endsWith("es")) out.push(n.slice(0, -2));
    if (n.endsWith("s")) out.push(n.slice(0, -1));
    return out;
  };
  // Every affected TYPE may itself be multi-word ("fruit trees") — stem each word.
  const tokens = (affected ?? [])
    .flatMap((a) => a.split(/[\s,/]+/))
    .flatMap(stems)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  const tokenSet = new Set(tokens);

  const matches: string[] = [];
  for (const name of plantNames ?? []) {
    const wordStems = (name ?? "").split(/[\s,/-]+/).flatMap(stems).filter((w) => w.length >= 3);
    const hit = wordStems.some((w) => tokenSet.has(w));
    if (hit && !matches.includes(name)) {
      matches.push(name);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
