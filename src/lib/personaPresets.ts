import type { UserProfile } from "../types";

type Persona = UserProfile["persona"];

/**
 * Home-page posture presets — "The Porch" (new gardener) and "The Workbench"
 * (experienced). See docs/plans/home-redesign-two-postures.md.
 *
 * The persona decides WHAT the homepage contains, not just its copy density:
 * each preset is a declarative recipe (ordered visible sections + per-section
 * variants) rendered by HomeMain's single section loop. This mirrors the
 * quickLauncherCatalogue/resolvePins pattern — one registry, one renderer,
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
  | "week"
  | "snapshot";

export interface HomePreset {
  /** Ordered list of VISIBLE sections — omission hides a section. */
  sectionOrder: HomeSectionId[];
  /** Per-section presentation variant (consumed by each section's renderer). */
  variants: Partial<Record<HomeSectionId, string>>;
  /** Whether the Garden Snapshot starts expanded (only meaningful when
   *  "snapshot" is in sectionOrder). */
  snapshotOpen: boolean;
}

export const HOME_PRESETS: Record<HomePosture, HomePreset> = {
  // 🪴 The Porch — a warm guided welcome. Sentence hero, one Next Best
  // Action, plants as photos, gentle today list, learning strip. Almost no
  // numbers.
  porch: {
    sectionOrder: [
      "hero",
      "nextBestAction",
      "promo",
      "garden",
      "today",
      "quickActions",
      "learn",
      "brief",
    ],
    variants: {
      hero: "sentence",
      promo: "card",
      garden: "photos",
      today: "gentle",
      brief: "gentle",
    },
    snapshotOpen: false,
  },
  // 🛠️ The Workbench — an operations console. Console-line hero, attention
  // inbox, telemetry grid, compact tasks + "Open board", the merged Brief,
  // week ahead, collapsed snapshot. Almost no hand-holding.
  workbench: {
    sectionOrder: [
      "hero",
      "attention",
      "garden",
      "today",
      "brief",
      "week",
      "quickActions",
      "promo",
      "snapshot",
    ],
    variants: {
      hero: "console",
      promo: "line",
      garden: "telemetry",
      today: "throughput",
      brief: "full",
    },
    snapshotOpen: false,
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
