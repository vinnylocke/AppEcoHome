import { describe, test, expect } from "vitest";
import {
  findLikelyDuplicates,
  type BlueprintRow,
} from "../../../src/lib/blueprintDuplicateCheck";
import type { SuggestedTask } from "../../../src/components/TaskActionButtons";

function task(over: Partial<SuggestedTask> = {}): SuggestedTask {
  return {
    title: "Water Roma",
    description: "",
    task_type: "Watering" as any,
    due_in_days: 0,
    is_recurring: true,
    frequency_days: 3,
    end_offset_days: 90,
    depends_on_index: null,
    ...over,
  };
}

function bp(over: Partial<BlueprintRow> = {}): BlueprintRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Water Roma weekly",
    task_type: "Watering",
    frequency_days: 4,
    is_recurring: true,
    ...over,
  };
}

describe("findLikelyDuplicates", () => {
  test("matches by type + recurrence + similar frequency + overlapping word", () => {
    const proposed = [task()];
    const existing = [bp()];
    expect(Array.from(findLikelyDuplicates(proposed, existing))).toEqual([0]);
  });

  test("different task_type → not a duplicate", () => {
    const proposed = [task({ task_type: "Watering" as any })];
    const existing = [bp({ task_type: "Pruning" })];
    expect(findLikelyDuplicates(proposed, existing).size).toBe(0);
  });

  test("recurring vs one-off → not a duplicate", () => {
    const proposed = [task({ is_recurring: false })];
    const existing = [bp({ is_recurring: true })];
    expect(findLikelyDuplicates(proposed, existing).size).toBe(0);
  });

  test("frequency more than 2 days apart → not a duplicate", () => {
    const proposed = [task({ frequency_days: 3 })];
    const existing = [bp({ frequency_days: 10 })];
    expect(findLikelyDuplicates(proposed, existing).size).toBe(0);
  });

  test("frequency within 2 days → still a duplicate (3 vs 4 same job)", () => {
    const proposed = [task({ frequency_days: 3 })];
    const existing = [bp({ frequency_days: 4 })];
    expect(findLikelyDuplicates(proposed, existing).size).toBe(1);
  });

  test("no overlapping significant words → not a duplicate", () => {
    const proposed = [task({ title: "Water Roma" })];
    const existing = [bp({ title: "Watering schedule" })];
    // significant words: "water","roma" vs "watering","schedule"
    // ("water" ≠ "watering" — exact word match required)
    expect(findLikelyDuplicates(proposed, existing).size).toBe(0);
  });

  test("only stopwords overlap → not a duplicate", () => {
    const proposed = [task({ title: "The job" })];
    const existing = [bp({ title: "The other thing" })];
    expect(findLikelyDuplicates(proposed, existing).size).toBe(0);
  });

  test("multiple proposed tasks: each matched independently", () => {
    const proposed = [
      task({ title: "Water Roma" }),
      // Same Pruning frequency as the existing blueprint → counts as dupe.
      task({ title: "Prune Lavender", task_type: "Pruning" as any, frequency_days: 28 }),
      task({ title: "Feed Tomatoes",  task_type: "Fertilizing" as any }),
    ];
    const existing = [
      bp({ title: "Water Roma weekly", task_type: "Watering" }),
      bp({ title: "Lavender pruning",  task_type: "Pruning", frequency_days: 28 }),
    ];
    const dupes = findLikelyDuplicates(proposed, existing);
    expect(Array.from(dupes).sort()).toEqual([0, 1]);
  });

  test("returns empty when existing is empty", () => {
    expect(findLikelyDuplicates([task()], []).size).toBe(0);
  });

  test("returns empty when proposed is empty", () => {
    expect(findLikelyDuplicates([], [bp()]).size).toBe(0);
  });
});
