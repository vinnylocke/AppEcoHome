import type { UserProfile } from "../types";

type Persona = UserProfile["persona"];

/**
 * Home-page posture presets — "The Porch" (new gardener) and "The Workbench"
 * (experienced). See docs/plans/home-redesign-two-postures.md.
 *
 * The persona decides WHAT the homepage contains, not just its copy density:
 * each preset is a declarative recipe (an ordered list of visible sections)
 * rendered by HomeMain's single section loop — one registry, one renderer,
 * user override always wins.
 *
 * Resolution ladder (resolveHomePreset):
 *   1. explicit user override — localStorage `rhozly:home:preset`
 *   2. legacy density choice  — localStorage `rhozly:home:density`
 *      ("detailed" → workbench, "simple" → porch); kept so users who chose a
 *      density before the redesign keep their posture, and so existing e2e
 *      specs that pre-seed the key keep passing
 *   3. persona                — experienced → workbench, everything else
 *      (including null = never asked) → porch
 */

export type EffectivePersona = "new" | "experienced";

/** Collapse the nullable persona the way every client surface should:
 *  null (never asked / still loading) reads as "new" — the safer, more
 *  guided default. This is THE canonical null⇒new helper; do not re-derive
 *  with ad-hoc `persona !== "experienced"` checks in new code. */
export function effectivePersona(persona: Persona): EffectivePersona {
  return persona === "experienced" ? "experienced" : "new";
}

export type HomePosture = "porch" | "workbench";

/** Stable section ids for the home page's composition loop. */
export type HomeSectionId =
  | "hero"
  | "nextBestAction"
  | "promo"
  | "attention"
  | "garden"
  | "today"
  | "quickActions"
  | "learn"
  | "brief"
  | "week";

export interface HomePreset {
  /** Ordered list of VISIBLE sections — omission hides a section. */
  sectionOrder: HomeSectionId[];
}

export const HOME_PRESETS: Record<HomePosture, HomePreset> = {
  // 🪴 The Porch — a warm guided welcome. Sentence hero, one Next Best
  // Action, then today's tasks FIRST (dashboard-nav-tasks-tray redesign
  // Stage 1, 2026-07-21 — tasks are the most-used thing, promoted above the
  // garden), the Garden Walk tile, the garden grid, a learning strip, the
  // Brief. Almost no numbers.
  porch: {
    sectionOrder: [
      "hero",
      "nextBestAction",
      "promo",
      "today",
      "quickActions",
      "garden",
      "learn",
      "brief",
    ],
  },
  // 🛠️ The Workbench — an operations console. Console-line hero, attention
  // inbox, today's tasks (promoted above the garden — Stage 1), the Garden
  // Walk tile, telemetry grid, the merged Brief, week ahead. Almost no
  // hand-holding. (The Garden Snapshot stat wall was deleted outright in the
  // stats+locations redesign Stage 2 — 2026-07-20; the quick-actions launcher
  // grid was cut in Stage 1 — 2026-07-21, leaving only the Walk tile.)
  workbench: {
    sectionOrder: [
      "hero",
      "attention",
      "today",
      "quickActions",
      "garden",
      "brief",
      "week",
      "promo",
    ],
  },
};

/** localStorage key for the explicit posture override (set by the home's
 *  posture toggle — the old density control, re-pointed). */
export const PRESET_KEY = "rhozly:home:preset";
/** Legacy density key — pre-redesign Simple/Detailed choice, honoured as a
 *  posture alias so existing users and specs carry over. */
export const LEGACY_DENSITY_KEY = "rhozly:home:density";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Read the user's explicit posture override (null when none stored). */
export function readStoredPosture(): HomePosture | null {
  const stored = readStored(PRESET_KEY);
  if (stored === "porch" || stored === "workbench") return stored;
  const legacy = readStored(LEGACY_DENSITY_KEY);
  if (legacy === "detailed") return "workbench";
  if (legacy === "simple") return "porch";
  return null;
}

/** Persist the explicit posture override. */
export function storePosture(posture: HomePosture): void {
  try {
    localStorage.setItem(PRESET_KEY, posture);
  } catch {
    /* private mode — posture just won't persist */
  }
}

/**
 * Resolve the active posture: explicit override > legacy density alias >
 * persona default. Pure given its inputs — pass `stored` from
 * readStoredPosture() so tests can exercise the ladder without localStorage.
 */
export function resolveHomePosture(
  persona: Persona,
  stored: HomePosture | null,
): HomePosture {
  if (stored) return stored;
  return effectivePersona(persona) === "experienced" ? "workbench" : "porch";
}
