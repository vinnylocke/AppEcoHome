/**
 * Deterministic Seasonal Picks fallback — used when:
 *   - The user is on Sprout / Botanist (no AI tier).
 *   - The AI call fails / quota exhausted on Sage+ (graceful degrade).
 *
 * Calibrated to temperate climates (UK-skewed). Hemisphere-aware. The
 * picker walks a small built-in table of common garden plants, filters
 * to those whose sow window covers the current month, and returns 4-6
 * matches biased toward easy + edible-mixed.
 *
 * Reasoning strings are templated rather than personalised — that's the
 * trade-off versus the AI path. The card still gives the gardener a
 * real, plantable list every week.
 */

import type { SeasonalPick, SeasonalPicksPayload } from "./seasonalPicks.ts";

interface FallbackEntry {
  common_name: string;
  scientific_name: string;
  /** Months (1-12) where this is plantable. Northern-hemisphere baseline. */
  months_north: number[];
  sow_method: SeasonalPick["sow_method"];
  effort: SeasonalPick["effort"];
  sun: SeasonalPick["sun"];
  edible: boolean;
  /** Rough days from sow to first harvest (edibles). */
  days_to_harvest?: number;
  /** Templated reasoning — `{month_label}` interpolated. */
  reasoning_template: string;
}

const FALLBACK_TABLE: FallbackEntry[] = [
  // ── Edibles ────────────────────────────────────────────────────────────
  {
    common_name: "Lettuce 'Lollo Rossa'",
    scientific_name: "Lactuca sativa",
    months_north: [3, 4, 5, 6, 7, 8],
    sow_method: "direct",
    effort: "easy",
    sun: ["part_sun", "part_shade"],
    edible: true,
    days_to_harvest: 50,
    reasoning_template:
      "Direct-sow now for cut-and-come-again leaves in about seven weeks — a reliable {month_label} starter.",
  },
  {
    common_name: "Radish 'French Breakfast'",
    scientific_name: "Raphanus sativus",
    months_north: [3, 4, 5, 6, 7, 8, 9],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun", "part_sun"],
    edible: true,
    days_to_harvest: 28,
    reasoning_template:
      "Quick win — direct-sow this {month_label} and harvest crisp roots inside a month.",
  },
  {
    common_name: "Spinach 'Bloomsdale'",
    scientific_name: "Spinacia oleracea",
    months_north: [3, 4, 8, 9],
    sow_method: "direct",
    effort: "easy",
    sun: ["part_sun", "part_shade"],
    edible: true,
    days_to_harvest: 45,
    reasoning_template:
      "Cool-season leaf — direct-sow now while {month_label} temperatures are still mild.",
  },
  {
    common_name: "Tomato 'Sungold'",
    scientific_name: "Solanum lycopersicum",
    months_north: [2, 3, 4],
    sow_method: "indoor",
    effort: "moderate",
    sun: ["full_sun"],
    edible: true,
    days_to_harvest: 130,
    reasoning_template:
      "Start indoors on a sunny windowsill this {month_label} — transplant out after your last frost.",
  },
  {
    common_name: "Courgette 'Defender'",
    scientific_name: "Cucurbita pepo",
    months_north: [4, 5],
    sow_method: "indoor",
    effort: "easy",
    sun: ["full_sun"],
    edible: true,
    days_to_harvest: 70,
    reasoning_template:
      "Sow indoors this {month_label} — pot on after 3 weeks, plant out once the frost risk passes.",
  },
  {
    common_name: "Runner Bean 'Painted Lady'",
    scientific_name: "Phaseolus coccineus",
    months_north: [4, 5, 6],
    sow_method: "indoor",
    effort: "easy",
    sun: ["full_sun"],
    edible: true,
    days_to_harvest: 90,
    reasoning_template:
      "Sow under cover this {month_label} so plants are ready to climb a wigwam by early summer.",
  },
  {
    common_name: "Beetroot 'Boltardy'",
    scientific_name: "Beta vulgaris",
    months_north: [3, 4, 5, 6, 7],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun", "part_sun"],
    edible: true,
    days_to_harvest: 70,
    reasoning_template:
      "Direct-sow a row this {month_label}; succession-sow every fortnight for continuous harvest.",
  },
  {
    common_name: "Carrot 'Autumn King'",
    scientific_name: "Daucus carota",
    months_north: [4, 5, 6, 7],
    sow_method: "direct",
    effort: "moderate",
    sun: ["full_sun"],
    edible: true,
    days_to_harvest: 110,
    reasoning_template:
      "Direct-sow into fine soil this {month_label} for a satisfying autumn harvest.",
  },
  {
    common_name: "Pea 'Hurst Greenshaft'",
    scientific_name: "Pisum sativum",
    months_north: [3, 4, 5, 6],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun", "part_sun"],
    edible: true,
    days_to_harvest: 80,
    reasoning_template:
      "Sow a row in well-drained soil this {month_label}; supports on standby for when they reach 15 cm.",
  },
  {
    common_name: "Basil 'Sweet Genovese'",
    scientific_name: "Ocimum basilicum",
    months_north: [3, 4, 5, 6],
    sow_method: "indoor",
    effort: "easy",
    sun: ["full_sun"],
    edible: true,
    days_to_harvest: 60,
    reasoning_template:
      "Sow indoors this {month_label} for fresh leaves all summer — keep on the sunniest sill.",
  },
  // ── Ornamentals ───────────────────────────────────────────────────────
  {
    common_name: "Sunflower 'Russian Giant'",
    scientific_name: "Helianthus annuus",
    months_north: [4, 5, 6],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun"],
    edible: false,
    reasoning_template:
      "Direct-sow into a sunny spot this {month_label} — visible growth within four weeks.",
  },
  {
    common_name: "Sweet Pea 'Cupani'",
    scientific_name: "Lathyrus odoratus",
    months_north: [3, 4, 5, 10],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun", "part_sun"],
    edible: false,
    reasoning_template:
      "Sow against a trellis this {month_label} for scented flowers from early summer.",
  },
  {
    common_name: "Cosmos 'Sensation Mix'",
    scientific_name: "Cosmos bipinnatus",
    months_north: [3, 4, 5, 6],
    sow_method: "indoor",
    effort: "easy",
    sun: ["full_sun"],
    edible: false,
    reasoning_template:
      "Start indoors this {month_label} for a wave of pink and white flowers from July.",
  },
  {
    common_name: "Nasturtium 'Empress of India'",
    scientific_name: "Tropaeolum majus",
    months_north: [4, 5, 6],
    sow_method: "direct",
    effort: "easy",
    sun: ["full_sun", "part_sun"],
    edible: true, // flowers/leaves edible
    reasoning_template:
      "Direct-sow under sunny windows or along a path this {month_label} — covers ground quickly.",
  },
  {
    common_name: "Marigold 'French Sparky'",
    scientific_name: "Tagetes patula",
    months_north: [3, 4, 5],
    sow_method: "indoor",
    effort: "easy",
    sun: ["full_sun"],
    edible: false,
    reasoning_template:
      "Sow indoors this {month_label}; a classic pest-deterrent for the veg patch when planted out.",
  },
  // ── Propagation cues ──────────────────────────────────────────────────
  {
    common_name: "Geranium",
    scientific_name: "Pelargonium x hortorum",
    months_north: [4, 5, 6, 7, 8],
    sow_method: "cutting",
    effort: "moderate",
    sun: ["full_sun"],
    edible: false,
    reasoning_template:
      "Take softwood cuttings this {month_label} — overwinter them indoors as backups.",
  },
  {
    common_name: "Lavender 'Hidcote'",
    scientific_name: "Lavandula angustifolia",
    months_north: [5, 6, 7, 8],
    sow_method: "cutting",
    effort: "moderate",
    sun: ["full_sun"],
    edible: false,
    reasoning_template:
      "Take 8-10 cm semi-ripe cuttings this {month_label} — root in gritty compost.",
  },
];

// ── Month mapping ──────────────────────────────────────────────────────────

const MONTH_LABEL = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Translate a Northern-hemisphere month list to Southern by adding 6 months.
 * "Sow in March" (Northern spring) → "Sow in September" (Southern spring).
 */
function translateMonthsToHemisphere(
  months: number[],
  hemisphere: "Northern" | "Southern",
): number[] {
  if (hemisphere === "Northern") return months;
  return months.map((m) => ((m + 5) % 12) + 1);
}

// ── Picker ─────────────────────────────────────────────────────────────────

export interface FallbackContext {
  currentDate: Date;
  hemisphere: "Northern" | "Southern";
  /** Optional: skews the picker toward this focus when set. */
  edibleFocus: "edible_only" | "ornamental_only" | "mixed" | null;
  /** When set, picks at or below this effort level are preferred. */
  effortPreference: SeasonalPick["effort"] | null;
  /** Common names already in the user's Shed — used to dedupe ornamentals. */
  shedCommonNames: string[];
}

const EFFORT_ORDER: Record<SeasonalPick["effort"], number> = {
  easy: 0,
  moderate: 1,
  advanced: 2,
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function fallbackSeasonalPicks(ctx: FallbackContext): SeasonalPicksPayload {
  const month = ctx.currentDate.getUTCMonth() + 1; // 1-12
  const monthLabel = MONTH_LABEL[month];
  const shedSet = new Set(
    ctx.shedCommonNames.map((n) => n.toLowerCase()),
  );

  // 1. Filter to entries whose window covers the current month after
  //    hemisphere translation, minus any ornamentals already in the Shed.
  const candidates = FALLBACK_TABLE.filter((e) => {
    const translated = translateMonthsToHemisphere(e.months_north, ctx.hemisphere);
    if (!translated.includes(month)) return false;
    if (!e.edible && shedSet.has(e.common_name.toLowerCase())) return false;
    if (ctx.edibleFocus === "edible_only" && !e.edible) return false;
    if (ctx.edibleFocus === "ornamental_only" && e.edible) return false;
    return true;
  });

  // 2. Rank: respect effort preference, prefer mixed sow methods so the card
  //    feels varied (don't ship 5 direct-sows in a row).
  const ranked = [...candidates].sort((a, b) => {
    if (ctx.effortPreference) {
      const aGap = Math.abs(EFFORT_ORDER[a.effort] - EFFORT_ORDER[ctx.effortPreference]);
      const bGap = Math.abs(EFFORT_ORDER[b.effort] - EFFORT_ORDER[ctx.effortPreference]);
      if (aGap !== bGap) return aGap - bGap;
    }
    return EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort];
  });

  // 3. Spread by sow_method — round-robin pick.
  const byMethod = new Map<SeasonalPick["sow_method"], FallbackEntry[]>();
  for (const e of ranked) {
    const list = byMethod.get(e.sow_method) ?? [];
    list.push(e);
    byMethod.set(e.sow_method, list);
  }
  const methodOrder: SeasonalPick["sow_method"][] = [
    "direct", "indoor", "cutting", "division", "transplant",
  ];
  const result: FallbackEntry[] = [];
  let safety = 0;
  while (result.length < 6 && safety++ < 50) {
    let pulled = false;
    for (const m of methodOrder) {
      const list = byMethod.get(m);
      if (list && list.length > 0) {
        result.push(list.shift()!);
        pulled = true;
        if (result.length >= 6) break;
      }
    }
    if (!pulled) break;
  }

  // 4. Materialise into SeasonalPick shape.
  const picks: SeasonalPick[] = result.slice(0, Math.max(4, Math.min(6, result.length))).map((e) => {
    const windowStart = ctx.currentDate;
    const windowEnd = addDays(ctx.currentDate, 21);
    let harvest: SeasonalPick["harvest_window"] = null;
    if (e.edible && e.days_to_harvest) {
      const harvestStart = addDays(ctx.currentDate, e.days_to_harvest);
      const harvestEnd = addDays(harvestStart, 30);
      harvest = { start: isoDate(harvestStart), end: isoDate(harvestEnd) };
    }
    return {
      common_name: e.common_name,
      scientific_name: e.scientific_name,
      sow_method: e.sow_method,
      sow_window_start: isoDate(windowStart),
      sow_window_end: isoDate(windowEnd),
      harvest_window: harvest,
      reasoning: e.reasoning_template.replace("{month_label}", monthLabel),
      effort: e.effort,
      sun: e.sun,
      edible: e.edible,
      plant_id: null,
    };
  });

  // 5. If filtering left us with < 4 picks, top up from candidates without
  //    the dedupe filter so the card never renders empty.
  if (picks.length < 4) {
    const need = 4 - picks.length;
    const taken = new Set(picks.map((p) => p.common_name));
    const filler = FALLBACK_TABLE
      .filter((e) => {
        const translated = translateMonthsToHemisphere(e.months_north, ctx.hemisphere);
        return translated.includes(month) && !taken.has(e.common_name);
      })
      .slice(0, need);
    for (const e of filler) {
      const windowStart = ctx.currentDate;
      const windowEnd = addDays(ctx.currentDate, 21);
      picks.push({
        common_name: e.common_name,
        scientific_name: e.scientific_name,
        sow_method: e.sow_method,
        sow_window_start: isoDate(windowStart),
        sow_window_end: isoDate(windowEnd),
        harvest_window: null,
        reasoning: e.reasoning_template.replace("{month_label}", monthLabel),
        effort: e.effort,
        sun: e.sun,
        edible: e.edible,
        plant_id: null,
      });
    }
  }

  return { picks };
}
