/**
 * Pure helpers for the Head Gardener Garden Brief — labelling, emptiness checks,
 * one-line summaries, and sanitising an AI-drafted brief down to known option ids.
 * No React, no side effects (unit-tested in tests/unit/lib/gardenBrief.test.ts).
 */
import {
  GOAL_OPTIONS,
  STYLE_OPTIONS,
  TIME_OPTIONS,
  EXPERIENCE_OPTIONS,
  BUDGET_OPTIONS,
  type BriefOption,
} from "../constants/gardenBrief";

export interface GardenBrief {
  home_id: string;
  goals: string[];
  time_per_week: string | null;
  budget_tier: string | null;
  experience_level: string | null;
  styles: string[];
  notes: string | null;
  ai_summary: string | null;
  derived_from: unknown | null;
  confirmed_at: string | null;
  updated_at?: string;
  created_at?: string;
}

/** The editable subset the AI drafts and the form round-trips. */
export interface BriefDraft {
  goals: string[];
  time_per_week: string | null;
  budget_tier: string | null;
  experience_level: string | null;
  styles: string[];
  ai_summary: string | null;
}

const labelOf = (opts: BriefOption[], id: string | null | undefined): string =>
  (id && opts.find((o) => o.id === id)?.label) || (id ?? "");

export const goalLabel = (id: string) => labelOf(GOAL_OPTIONS, id);
export const styleLabel = (id: string) => labelOf(STYLE_OPTIONS, id);
export const timeLabel = (id: string | null) => labelOf(TIME_OPTIONS, id);
export const experienceLabel = (id: string | null) => labelOf(EXPERIENCE_OPTIONS, id);
export const budgetLabel = (id: string | null) => labelOf(BUDGET_OPTIONS, id);

/** True when the brief carries no meaningful content yet (worth prompting to set up). */
export function isBriefEmpty(b: Partial<GardenBrief> | null | undefined): boolean {
  if (!b) return true;
  return (
    (b.goals?.length ?? 0) === 0 &&
    (b.styles?.length ?? 0) === 0 &&
    !b.time_per_week &&
    !b.experience_level &&
    !b.notes
  );
}

/** A confirmed brief is one the user has reviewed (confirmed_at set) and isn't empty. */
export function isBriefConfirmed(b: Partial<GardenBrief> | null | undefined): boolean {
  return !!b?.confirmed_at && !isBriefEmpty(b);
}

/** One-line human summary, e.g. "Grow my own food, Year-round colour · Cottage · 1–3 hours / week". */
export function summariseBrief(b: Partial<GardenBrief> | null | undefined): string {
  if (isBriefEmpty(b)) return "No brief yet";
  const parts: string[] = [];
  if (b!.goals?.length) parts.push(b!.goals.map(goalLabel).join(", "));
  if (b!.styles?.length) parts.push(b!.styles.map(styleLabel).join(", "));
  if (b!.time_per_week) parts.push(timeLabel(b!.time_per_week));
  return parts.filter(Boolean).join(" · ");
}

const validIds = (opts: BriefOption[]) => new Set(opts.map((o) => o.id));

/**
 * Sanitise an AI-drafted (or otherwise untrusted) brief down to known option ids,
 * dropping anything the model invented and de-duplicating. Keeps the brief safe to
 * render and store regardless of what Gemini returned.
 */
export function normaliseDraft(raw: unknown): BriefDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  const filterArr = (val: unknown, opts: BriefOption[]): string[] => {
    const ok = validIds(opts);
    const arr = Array.isArray(val) ? val : [];
    return [...new Set(arr.filter((x): x is string => typeof x === "string" && ok.has(x)))];
  };
  const oneOf = (val: unknown, opts: BriefOption[]): string | null =>
    typeof val === "string" && validIds(opts).has(val) ? val : null;

  return {
    goals: filterArr(r.goals, GOAL_OPTIONS).slice(0, 5),
    styles: filterArr(r.styles, STYLE_OPTIONS).slice(0, 3),
    time_per_week: oneOf(r.time_per_week, TIME_OPTIONS),
    budget_tier: oneOf(r.budget_tier, BUDGET_OPTIONS),
    experience_level: oneOf(r.experience_level, EXPERIENCE_OPTIONS),
    ai_summary: typeof r.ai_summary === "string" ? r.ai_summary.trim().slice(0, 600) : null,
  };
}
