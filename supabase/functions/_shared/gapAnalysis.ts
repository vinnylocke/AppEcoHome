/**
 * gapAnalysis — deterministic goal-gap pre-computation for the Head Gardener.
 *
 * Pure + side-effect free (Deno-tested in supabase/tests/gapAnalysis.test.ts). Given
 * the home's stated goals and factual garden data, it computes concrete, grounded
 * gaps the AI then narrates — so the model reasons over real facts (which seasons
 * have no colour, whether anything edible is growing, toxic plants vs a family-safe
 * goal) rather than hallucinating. Season granularity, because plants store
 * flowering_season / harvest_season as season names ("Spring"|"Summer"|"Autumn"|"Winter").
 *
 * See docs/plans/head-gardener-ai-manager.md.
 */

export const ALL_SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
export type Season = (typeof ALL_SEASONS)[number];

export interface PlantFact {
  name: string;
  floweringSeasons: string[];
  harvestSeasons: string[];
  isEdible: boolean;
  flowers: boolean;
  attracts: string[];
  toxicPets: boolean;
  toxicHumans: boolean;
}

export interface GardenFacts {
  goals: string[];
  plants: PlantFact[];
  areaCount: number;
  plantedCount: number;
  postponeRate: number; // 0..1
  timePerWeek: string | null;
}

export interface GapFact {
  goal: string;
  code: string;
  detail: string;
}

const TITLE: Record<string, Season> = {
  spring: "Spring", summer: "Summer", autumn: "Autumn", fall: "Autumn", winter: "Winter",
};

/** Normalise a free-ish season string to the canonical Season, or null. */
function toSeason(s: string): Season | null {
  return TITLE[(s ?? "").trim().toLowerCase()] ?? null;
}

function seasonSet(values: string[][]): Set<Season> {
  const out = new Set<Season>();
  for (const arr of values) for (const v of arr) { const s = toSeason(v); if (s) out.add(s); }
  return out;
}

function list(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} and ${extra} more` : shown.join(", ");
}

/**
 * Compute the factual gaps for the home's active goals. Only emits a gap when there's
 * a real, grounded shortfall — an empty array means "nothing missing for these goals".
 */
export function analyseGaps(facts: GardenFacts): GapFact[] {
  const goals = new Set(facts.goals ?? []);
  const plants = facts.plants ?? [];
  const gaps: GapFact[] = [];

  // ── Year-round colour: which seasons have nothing in flower? ──
  if (goals.has("year_round_colour")) {
    if (facts.plantedCount === 0) {
      gaps.push({ goal: "year_round_colour", code: "no_plants", detail: "You have nothing planted yet, so there's no year-round colour to build on." });
    } else {
      const flowering = plants.filter((p) => p.flowers || p.floweringSeasons.length > 0);
      const covered = seasonSet(flowering.map((p) => p.floweringSeasons));
      const bare = ALL_SEASONS.filter((s) => !covered.has(s));
      if (flowering.length === 0) {
        gaps.push({ goal: "year_round_colour", code: "no_flowering", detail: "None of your plants are noted as flowering, so there's no seasonal colour tracked yet." });
      } else if (bare.length > 0) {
        gaps.push({ goal: "year_round_colour", code: "bare_seasons", detail: `Nothing in your garden flowers in ${list(bare, 4)}.` });
      }
    }
  }

  // ── Grow your own: is anything edible actually growing? ──
  if (goals.has("grow_your_own")) {
    const edible = plants.filter((p) => p.isEdible);
    if (edible.length === 0) {
      gaps.push({ goal: "grow_your_own", code: "no_edibles", detail: "You're not growing anything edible yet despite wanting to grow your own." });
    } else {
      const harvestCovered = seasonSet(edible.map((p) => p.harvestSeasons));
      // A productive-season harvest gap (spring–autumn); a bare winter is expected, so ignore it.
      const productiveBare = (["Spring", "Summer", "Autumn"] as Season[]).filter((s) => !harvestCovered.has(s));
      if (harvestCovered.size > 0 && productiveBare.length > 0) {
        gaps.push({ goal: "grow_your_own", code: "harvest_gap", detail: `Your edibles give you a harvest, but nothing crops in ${list(productiveBare, 3)} — succession planting would close the gap.` });
      }
    }
  }

  // ── Attract wildlife: do any plants draw pollinators/wildlife? ──
  if (goals.has("attract_wildlife")) {
    const wildlife = plants.filter((p) => (p.attracts ?? []).length > 0);
    if (wildlife.length === 0) {
      gaps.push({ goal: "attract_wildlife", code: "no_wildlife_plants", detail: "None of your plants are noted for attracting bees, butterflies or other wildlife." });
    }
  }

  // ── Low maintenance: is the upkeep heavier than they want? ──
  if (goals.has("low_maintenance") && facts.postponeRate > 0.4) {
    gaps.push({
      goal: "low_maintenance",
      code: "maintenance_overload",
      detail: `You're postponing about ${Math.round(facts.postponeRate * 100)}% of tasks — the upkeep looks heavier than the low-maintenance garden you asked for.`,
    });
  }

  // ── Family & pet safe: any toxic plants in the ground? ──
  if (goals.has("family_safe")) {
    const toxicPets = plants.filter((p) => p.toxicPets);
    const toxicPeople = plants.filter((p) => p.toxicHumans);
    if (toxicPets.length > 0) {
      gaps.push({ goal: "family_safe", code: "toxic_pets", detail: `You're growing ${toxicPets.length} plant(s) toxic to pets (${list(toxicPets.map((p) => p.name))}) despite wanting a pet-safe garden.` });
    }
    if (toxicPeople.length > 0) {
      gaps.push({ goal: "family_safe", code: "toxic_humans", detail: `You're growing ${toxicPeople.length} plant(s) toxic to people (${list(toxicPeople.map((p) => p.name))}).` });
    }
  }

  return gaps;
}
