import { describe, it, expect } from "vitest";
import {
  goalLabel, styleLabel, timeLabel, experienceLabel, budgetLabel,
  isBriefEmpty, isBriefConfirmed, summariseBrief, normaliseDraft,
} from "../../../src/lib/gardenBrief";

describe("gardenBrief labels", () => {
  it("maps known ids to human labels", () => {
    expect(goalLabel("grow_your_own")).toBe("Grow my own food");
    expect(styleLabel("cottage")).toBe("Cottage");
    expect(timeLabel("1_3h")).toBe("1–3 hours / week");
    expect(experienceLabel("improving")).toBe("Getting the hang of it");
    expect(budgetLabel("moderate")).toBe("Moderate");
  });

  it("falls back to the raw id for unknown values", () => {
    expect(goalLabel("mystery_goal")).toBe("mystery_goal");
    expect(timeLabel(null)).toBe("");
  });
});

describe("isBriefEmpty / isBriefConfirmed", () => {
  it("treats null and blank briefs as empty", () => {
    expect(isBriefEmpty(null)).toBe(true);
    expect(isBriefEmpty({ goals: [], styles: [], time_per_week: null, experience_level: null, notes: null })).toBe(true);
  });

  it("is non-empty when any meaningful field is set", () => {
    expect(isBriefEmpty({ goals: ["grow_your_own"] })).toBe(false);
    expect(isBriefEmpty({ notes: "front bed is shady" })).toBe(false);
  });

  it("only counts a brief confirmed when confirmed_at is set AND it isn't empty", () => {
    expect(isBriefConfirmed({ goals: ["grow_your_own"], confirmed_at: null })).toBe(false);
    expect(isBriefConfirmed({ goals: [], confirmed_at: "2026-06-22T00:00:00Z" })).toBe(false);
    expect(isBriefConfirmed({ goals: ["grow_your_own"], confirmed_at: "2026-06-22T00:00:00Z" })).toBe(true);
  });
});

describe("summariseBrief", () => {
  it("returns a placeholder for empty briefs", () => {
    expect(summariseBrief(null)).toBe("No brief yet");
  });

  it("joins goals, styles and time with separators", () => {
    const s = summariseBrief({
      goals: ["grow_your_own", "attract_wildlife"],
      styles: ["cottage"],
      time_per_week: "1_3h",
    });
    expect(s).toBe("Grow my own food, Attract wildlife · Cottage · 1–3 hours / week");
  });
});

describe("normaliseDraft", () => {
  it("drops unknown ids the model may invent and de-dupes", () => {
    const d = normaliseDraft({
      goals: ["grow_your_own", "grow_your_own", "make_money", "attract_wildlife"],
      styles: ["cottage", "brutalist"],
      time_per_week: "1_3h",
      budget_tier: "lavish",
      experience_level: "improving",
      ai_summary: "  A productive cottage garden.  ",
    });
    expect(d.goals).toEqual(["grow_your_own", "attract_wildlife"]);
    expect(d.styles).toEqual(["cottage"]);
    expect(d.time_per_week).toBe("1_3h");
    expect(d.budget_tier).toBeNull(); // "lavish" is not a valid budget
    expect(d.experience_level).toBe("improving");
    expect(d.ai_summary).toBe("A productive cottage garden.");
  });

  it("is total on garbage input", () => {
    const d = normaliseDraft(undefined);
    expect(d.goals).toEqual([]);
    expect(d.styles).toEqual([]);
    expect(d.time_per_week).toBeNull();
    expect(d.ai_summary).toBeNull();
  });

  it("caps goals at 5 and styles at 3", () => {
    const d = normaliseDraft({
      goals: ["grow_your_own", "year_round_colour", "attract_wildlife", "low_maintenance", "container_only", "family_safe", "calm_retreat"],
      styles: ["cottage", "modern_minimal", "tropical", "mediterranean"],
    });
    expect(d.goals).toHaveLength(5);
    expect(d.styles).toHaveLength(3);
  });
});
