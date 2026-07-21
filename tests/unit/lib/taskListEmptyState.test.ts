import { describe, test, expect } from "vitest";
import { taskListEmptyVariant } from "../../../src/lib/taskListEmptyState";

describe("taskListEmptyVariant — which empty state to show (B1)", () => {
  test("cleared today's list (some done, none pending) → celebratory 'all-done'", () => {
    expect(taskListEmptyVariant(0, 3)).toBe("all-done");
  });

  test("brand-new / quiet day (nothing done, nothing pending) → 'nothing' (keeps the Routine CTA)", () => {
    expect(taskListEmptyVariant(0, 0)).toBe("nothing");
  });

  test("pending tasks still exist → 'nothing' (never falsely celebrate)", () => {
    expect(taskListEmptyVariant(2, 5)).toBe("nothing");
    expect(taskListEmptyVariant(2, 0)).toBe("nothing");
  });
});
