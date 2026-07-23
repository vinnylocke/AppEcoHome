/**
 * Seasonal Picks — "What can I grow right now?"
 *
 * Shared schema + prompt + types between:
 *   - The `seasonal_picks` action on the plant-doctor edge fn (lazy/on-demand)
 *   - The `refresh-seasonal-picks` cron (weekly pre-warm)
 *
 * Sage+ tiers get an AI-personalised list via Gemini with this schema. Sprout/
 * Botanist tiers route to the deterministic fallback in `./seasonalPicksFallback.ts`.
 */

import { stripPropagationMethod } from "./plantNameMatch.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type SowMethod =
  | "direct"      // direct-sow outdoors
  | "indoor"      // start under cover / on a windowsill
  | "cutting"     // softwood / hardwood propagation
  | "division"    // lift + split established clumps
  | "transplant"; // move on / plant out an established start

export type Sun =
  | "full_sun"
  | "part_sun"
  | "part_shade"
  | "full_shade";

export type Effort = "easy" | "moderate" | "advanced";

export interface SeasonalPick {
  common_name: string;
  scientific_name: string;
  sow_method: SowMethod;
  /** ISO YYYY-MM-DD — first day of the suggested sowing window. */
  sow_window_start: string;
  /** ISO YYYY-MM-DD — last day of the suggested sowing window. */
  sow_window_end: string;
  /** Optional — for edibles only. Null for ornamentals. */
  harvest_window: { start: string; end: string } | null;
  /** One sentence — why this pick this week, calibrated to the user's context. */
  reasoning: string;
  effort: Effort;
  sun: Sun[];
  edible: boolean;
  /** Catalogue id when the AI / fallback matched against an existing plant. */
  plant_id?: number | null;
  /** plant_library id when the pick matches an existing global library row.
   *  Set by the seasonal picks handler after generation. When present the
   *  client preview path can skip Gemini and clone the library row instead. */
  plant_library_id?: number | null;
}

export interface SeasonalPicksPayload {
  picks: SeasonalPick[];
}

// ── Gemini schema ──────────────────────────────────────────────────────────

const ISO_DATE_DESC = "ISO 8601 date (YYYY-MM-DD).";

export const SEASONAL_PICKS_SCHEMA = {
  type: "OBJECT",
  properties: {
    picks: {
      type: "ARRAY",
      description:
        "Between 4 and 6 ordered picks. Each pick MUST be plantable, sowable, or propagatable in the user's hemisphere/climate this week — never out-of-season suggestions.",
      items: {
        type: "OBJECT",
        properties: {
          common_name: {
            type: "STRING",
            description: "The plant name, INCLUDING the specific variety/cultivar in quotes when you have one in mind — e.g. \"Tomato 'Sungold'\", \"Lettuce 'Lollo Rossa'\", \"Carrot 'Autumn King'\". Keeping the variety is valuable to the gardener. The ONLY thing to exclude is the propagation method/action: write \"Geranium\", not \"Geranium softwood cuttings\"; \"Lavender 'Hidcote'\", not \"Lavender 'Hidcote' cuttings\" — the method belongs in sow_method.",
          },
          scientific_name: {
            type: "STRING",
            description: "Binomial — e.g. \"Solanum lycopersicum\". Best-guess if uncertain; never empty.",
          },
          sow_method: {
            type: "STRING",
            enum: ["direct", "indoor", "cutting", "division", "transplant"],
            description:
              "direct = direct-sow outdoors. indoor = start under cover. cutting / division = propagation. transplant = plant out an established start (e.g. bought plug plants).",
          },
          sow_window_start: { type: "STRING", description: ISO_DATE_DESC },
          sow_window_end:   { type: "STRING", description: ISO_DATE_DESC },
          harvest_window: {
            type: "OBJECT",
            nullable: true,
            description: "Edibles only. Null for ornamentals.",
            properties: {
              start: { type: "STRING", description: ISO_DATE_DESC },
              end:   { type: "STRING", description: ISO_DATE_DESC },
            },
            required: ["start", "end"],
          },
          reasoning: {
            type: "STRING",
            description:
              "One sentence (max ~25 words) explaining why now, calibrated to the user's frost dates / climate / Shed. Examples: 'Direct-sow now for cut-and-come-again leaves from late May.' 'Start indoors on a sunny windowsill — transplant outside after May 12 (your last-frost date).'",
          },
          effort: {
            type: "STRING",
            enum: ["easy", "moderate", "advanced"],
            description:
              "Match the user's quiz answer when available. easy = quick wins for beginners. advanced = needs propagation kit / experience.",
          },
          sun: {
            type: "ARRAY",
            description: "Sun positions where the plant thrives. Provide every applicable position.",
            items: {
              type: "STRING",
              enum: ["full_sun", "part_sun", "part_shade", "full_shade"],
            },
          },
          edible: { type: "BOOLEAN" },
        },
        required: [
          "common_name",
          "scientific_name",
          "sow_method",
          "sow_window_start",
          "sow_window_end",
          "reasoning",
          "effort",
          "sun",
          "edible",
        ],
      },
    },
  },
  required: ["picks"],
};

// ── Prompt builder ─────────────────────────────────────────────────────────

export interface SeasonalPicksPromptContext {
  /** Today's date as ISO YYYY-MM-DD in the user's timezone. */
  currentDate: string;
  /** Northern or Southern hemisphere. */
  hemisphere: "Northern" | "Southern";
  /** ISO week the picks are for — e.g. "2026-W19". */
  weekIso: string;
  /** Country name when known (e.g. "United Kingdom"). Threads into climate calibration. */
  country: string | null;
  /** Coarse coordinates — round to 1 decimal place by the caller. */
  lat: number | null;
  lng: number | null;
  /** Cached frost dates from `home_climate`. */
  lastFrostIso: string | null;
  firstFrostIso: string | null;
  /** Garden-quiz preferences when the user completed it. */
  edibleFocus: "edible_only" | "ornamental_only" | "mixed" | null;
  effortPreference: Effort | null;
  /** Free-text "things I dislike" — drives don't-suggest. */
  dislikes: string | null;
  /**
   * The user's existing Shed — common_name + scientific_name only to keep
   * the prompt small. The model uses this to (a) avoid dupes for ornamentals
   * and (b) propose succession-sows for edibles they already grow.
   */
  shed: { common_name: string; scientific_name: string | null }[];
}

export function buildSeasonalPicksPrompt(ctx: SeasonalPicksPromptContext): string {
  const lines: string[] = [];

  lines.push(
    `You are an expert horticulturalist building a SHORT personalised "what to grow this week" list for a gardener.`,
    ``,
    `RETURN BETWEEN 4 AND 6 PICKS. No fewer than 4; no more than 6.`,
    ``,
    `Calibrate EVERY pick to be plantable, sowable, or propagatable RIGHT NOW in the gardener's climate. Out-of-season suggestions are unacceptable.`,
    ``,
    `── GARDENER CONTEXT ──`,
    `  Current date: ${ctx.currentDate}`,
    `  ISO week: ${ctx.weekIso}`,
    `  Hemisphere: ${ctx.hemisphere}`,
    ctx.country ? `  Country: ${ctx.country}` : `  Country: unknown`,
    ctx.lat != null && ctx.lng != null
      ? `  Approximate location: ${ctx.lat.toFixed(1)}, ${ctx.lng.toFixed(1)}`
      : `  Approximate location: unknown`,
    ctx.lastFrostIso
      ? `  Last frost (spring): ${ctx.lastFrostIso}`
      : `  Last frost: unknown (be cautious recommending tender crops)`,
    ctx.firstFrostIso
      ? `  First frost (autumn): ${ctx.firstFrostIso}`
      : `  First frost: unknown`,
    ``,
  );

  lines.push(`── GARDENER PREFERENCES ──`);
  if (ctx.edibleFocus) {
    const focus = ctx.edibleFocus === "edible_only"
      ? "EDIBLES ONLY — every pick must be edible (vegetables, herbs, fruit)."
      : ctx.edibleFocus === "ornamental_only"
        ? "ORNAMENTALS ONLY — every pick must be ornamental (no edibles)."
        : "Mixed — both edibles and ornamentals welcome; aim for a balance.";
    lines.push(`  Edible focus: ${focus}`);
  } else {
    lines.push(`  Edible focus: not specified — default to mixed.`);
  }
  if (ctx.effortPreference) {
    lines.push(
      `  Effort preference: ${ctx.effortPreference} — bias picks toward this level. Don't pad with advanced propagation if they answered "easy".`,
    );
  } else {
    lines.push(`  Effort preference: not specified — default to easy/moderate.`);
  }
  if (ctx.dislikes && ctx.dislikes.trim()) {
    lines.push(`  Dislikes / never suggest: ${ctx.dislikes.trim()}`);
  }
  lines.push(``);

  if (ctx.shed.length > 0) {
    lines.push(`── GARDENER'S SHED (existing plants) ──`);
    const list = ctx.shed
      .slice(0, 50)
      .map((p) => p.scientific_name ? `${p.common_name} (${p.scientific_name})` : p.common_name)
      .join("; ");
    lines.push(`  ${list}`);
    lines.push(
      `  Use this to: (a) AVOID duplicating ornamentals they already grow, (b) SUGGEST succession sows for edibles they grow (e.g. "another row of lettuce"), (c) GROUND your reasoning ("complements your tomato bed").`,
    );
    lines.push(``);
  } else {
    lines.push(`── GARDENER'S SHED ──`, `  Empty — this is a new gardener. Lean toward easy quick-wins.`, ``);
  }

  lines.push(
    `── OUTPUT RULES ──`,
    `  1. Each pick MUST have all required fields populated.`,
    `  2. "reasoning" is ONE short sentence — max ~25 words. Reference the user's frost date or Shed when relevant.`,
    `  3. "sow_window_start" and "sow_window_end" are concrete ISO dates that BRACKET this week (most should overlap the current ISO week ${ctx.weekIso}).`,
    `  4. For edibles, populate "harvest_window" with realistic dates given the user's frost calendar.`,
    `  5. For ornamentals, "harvest_window" MUST be null.`,
    `  6. "scientific_name" is best-guess binomial — never empty.`,
    `  7. NEVER recommend anything that violates the user's dislikes.`,
    `  8. NEVER pick the SAME species twice in one response.`,
    `  9. No emoji. No markdown. JSON only — the schema enforces shape.`,
    `  10. KEEP the variety/cultivar in "common_name" (e.g. "Lettuce 'Lollo Rossa'", "Carrot 'Autumn King'") — gardeners value it. The ONLY thing forbidden in the name is the propagation method, which goes in "sow_method" (write "Geranium", not "Geranium softwood cuttings").`,
  );

  return lines.join("\n");
}

// ── ISO week helper ────────────────────────────────────────────────────────

/**
 * Return the ISO 8601 week key for a date — e.g. "2026-W19".
 * Used by both the action handler and the cron to bucket picks per week.
 */
export function isoWeekKey(date: Date): string {
  // Copy + normalise to UTC Thursday of the same ISO week (the ISO algorithm).
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;             // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);     // Move to Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Defensive output normalisation ─────────────────────────────────────────

/**
 * Validate + normalise a model response into a safe `SeasonalPicksPayload`.
 * Returns null if the shape is unsalvageable. Trims invalid picks rather
 * than failing the whole response — so a stray malformed pick doesn't lose
 * the user the other 4 good ones.
 */
export function normaliseSeasonalPicks(raw: unknown): SeasonalPicksPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { picks?: unknown }).picks;
  if (!Array.isArray(arr)) return null;
  const valid: SeasonalPick[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.common_name !== "string" || !r.common_name.trim() ||
      typeof r.scientific_name !== "string" || !r.scientific_name.trim() ||
      typeof r.sow_method !== "string" ||
      typeof r.sow_window_start !== "string" ||
      typeof r.sow_window_end !== "string" ||
      typeof r.reasoning !== "string" ||
      typeof r.effort !== "string" ||
      !Array.isArray(r.sun) ||
      typeof r.edible !== "boolean"
    ) continue;
    const sowMethod = r.sow_method as SowMethod;
    if (!["direct","indoor","cutting","division","transplant"].includes(sowMethod)) continue;
    const effort = r.effort as Effort;
    if (!["easy","moderate","advanced"].includes(effort)) continue;
    const sun = (r.sun as unknown[]).filter(
      (s) => typeof s === "string" && ["full_sun","part_sun","part_shade","full_shade"].includes(s),
    ) as Sun[];
    if (sun.length === 0) continue;
    const harvest = r.harvest_window as { start?: unknown; end?: unknown } | null | undefined;
    const harvestNorm = harvest && typeof harvest === "object"
      && typeof harvest.start === "string" && typeof harvest.end === "string"
      ? { start: harvest.start, end: harvest.end }
      : null;
    valid.push({
      // Strip any propagation method the model baked into the name ("Geranium
      // softwood cuttings" → "Geranium") — the method lives in sow_method.
      common_name: stripPropagationMethod(r.common_name.trim()),
      scientific_name: r.scientific_name.trim(),
      sow_method: sowMethod,
      sow_window_start: r.sow_window_start,
      sow_window_end: r.sow_window_end,
      harvest_window: harvestNorm,
      reasoning: r.reasoning.trim(),
      effort,
      sun,
      edible: r.edible,
      plant_id: typeof r.plant_id === "number" ? r.plant_id : null,
    });
  }
  if (valid.length === 0) return null;
  // Hard cap at 6 (schema asks for max 6 but a stubborn model can ignore it).
  return { picks: valid.slice(0, 6) };
}
