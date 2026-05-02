import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { AutomationEngine } from "../../../src/lib/automationEngine";
import { supabase } from "../../../src/lib/supabase";
import { Logger } from "../../../src/lib/errorHandler";

/**
 * Returns a fluent Supabase query-builder mock that resolves to { data, error }.
 * Chained methods (select, insert, update, delete, eq, overlaps) all return `this`.
 * `.single()` returns a Promise (terminal).
 * Awaiting the chain directly uses the custom `.then()` (also terminal).
 */
function chain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const c: any = {
    select:   vi.fn().mockReturnThis(),
    insert:   vi.fn().mockReturnThis(),
    update:   vi.fn().mockReturnThis(),
    delete:   vi.fn().mockReturnThis(),
    eq:       vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    single:   vi.fn().mockResolvedValue(resolved),
    then: (res: (v: any) => any, rej?: (r?: any) => any) =>
      Promise.resolve(resolved).then(res, rej),
  };
  return c;
}

const fromMock = supabase.from as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ---- calculateSeasonalDate ----

describe("AutomationEngine.calculateSeasonalDate", () => {
  test("returns baseDateStr unchanged when reference and offset are null", () => {
    expect(AutomationEngine.calculateSeasonalDate(null, null, "2026-05-01")).toBe(
      "2026-05-01",
    );
  });

  test("adds offset days when there is no seasonal reference", () => {
    expect(AutomationEngine.calculateSeasonalDate(null, 10, "2026-05-01")).toBe(
      "2026-05-11",
    );
  });

  test("resolves a Seasonal:MM-DD reference to that date in the base year", () => {
    expect(
      AutomationEngine.calculateSeasonalDate("Seasonal:06-15", null, "2026-03-01"),
    ).toBe("2026-06-15");
  });

  test("applies offset days after resolving the seasonal reference", () => {
    expect(
      AutomationEngine.calculateSeasonalDate("Seasonal:06-15", 5, "2026-03-01"),
    ).toBe("2026-06-20");
  });

  test("undefined reference is treated the same as null (no shift)", () => {
    expect(AutomationEngine.calculateSeasonalDate(undefined, 3, "2026-05-01")).toBe(
      "2026-05-04",
    );
  });

  test("non-Seasonal reference string is ignored (no shift applied)", () => {
    expect(
      AutomationEngine.calculateSeasonalDate("Planted", null, "2026-05-01"),
    ).toBe("2026-05-01");
  });

  test("offset of 0 behaves as no offset (falsy guard in source)", () => {
    expect(AutomationEngine.calculateSeasonalDate(null, 0, "2026-05-01")).toBe(
      "2026-05-01",
    );
  });
});

// ---- ailmentTaskType ----

describe("AutomationEngine.ailmentTaskType", () => {
  test.each([
    ["inspect", "Inspection"],
    ["spray", "Pest Control"],
    ["prune", "Pruning"],
    ["remove", "Maintenance"],
    ["water", "Watering"],
    ["fertilize", "Fertilizing"],
    ["other", "Maintenance"],
  ] as const)('maps "%s" → "%s"', (input, expected) => {
    expect(AutomationEngine.ailmentTaskType(input)).toBe(expected);
  });

  test("returns the input unchanged for unrecognised step types", () => {
    expect(AutomationEngine.ailmentTaskType("custom_action")).toBe("custom_action");
  });
});

// ---- frequencyDays ----

describe("AutomationEngine.frequencyDays", () => {
  test('"daily" → 1', () => {
    expect(AutomationEngine.frequencyDays("daily")).toBe(1);
  });

  test('"weekly" → 7', () => {
    expect(AutomationEngine.frequencyDays("weekly")).toBe(7);
  });

  test('"monthly" → 30', () => {
    expect(AutomationEngine.frequencyDays("monthly")).toBe(30);
  });

  test('"every_n_days" with an explicit value returns that value', () => {
    expect(AutomationEngine.frequencyDays("every_n_days", 14)).toBe(14);
  });

  test('"every_n_days" without everyNDays defaults to 7', () => {
    expect(AutomationEngine.frequencyDays("every_n_days")).toBe(7);
  });

  test('"every_n_days" with null everyNDays defaults to 7', () => {
    expect(AutomationEngine.frequencyDays("every_n_days", null)).toBe(7);
  });

  test('"once" → null (non-recurring)', () => {
    expect(AutomationEngine.frequencyDays("once")).toBeNull();
  });

  test("unrecognised frequency type → null", () => {
    expect(AutomationEngine.frequencyDays("biweekly")).toBeNull();
  });
});

// ---- applyPlantedAutomations ----

const BASE_ITEM = { plant_id: "p1", id: "i1", home_id: "h1", location_id: "l1" };

const SCHEDULE_SEASONAL = {
  title: "Watering",
  task_type: "watering",
  description: "Water well",
  frequency_days: 7,
  is_recurring: true,
  start_reference: "Seasonal:06-15",
  start_offset_days: null,
  end_reference: null,
  end_offset_days: null,
};

const SCHEDULE_IMMEDIATE = {
  ...SCHEDULE_SEASONAL,
  start_reference: null, // no offset — start = baseDateStr
};

const CREATED_BP = {
  id: "bp-new",
  home_id: "h1",
  location_id: "l1",
  area_id: "area-1",
  title: "Watering",
  task_type: "watering",
  description: "Water well",
  inventory_item_ids: ["i1"],
};

describe("AutomationEngine.applyPlantedAutomations", () => {
  test("returns immediately without any Supabase calls when itemsToPlant is empty", async () => {
    await AutomationEngine.applyPlantedAutomations([], "area-1", "2026-05-01");
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("makes no inserts when the plant has no Planted schedules", async () => {
    fromMock
      .mockReturnValueOnce(chain([]))  // task_blueprints existing bps
      .mockReturnValueOnce(chain([])); // plant_schedules → none

    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-05-01");

    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  test("creates blueprint but no initial task when baseDateStr is before the seasonal window", async () => {
    // Seasonal:06-15 → window starts 2026-06-15; base is 2026-03-01 (before)
    fromMock
      .mockReturnValueOnce(chain([]))              // existing bps
      .mockReturnValueOnce(chain([SCHEDULE_SEASONAL])) // schedules
      .mockReturnValueOnce(chain(CREATED_BP));     // task_blueprints insert+single

    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-03-01");

    expect(fromMock).toHaveBeenCalledTimes(3);
    // No 4th call — task insert is skipped outside the window
  });

  test("creates blueprint AND initial task when baseDateStr is within the seasonal window", async () => {
    // 2026-06-20 >= Seasonal:06-15 and no end date → within window
    fromMock
      .mockReturnValueOnce(chain([]))                  // existing bps
      .mockReturnValueOnce(chain([SCHEDULE_SEASONAL])) // schedules
      .mockReturnValueOnce(chain(CREATED_BP))          // task_blueprints insert+single
      .mockReturnValueOnce(chain(null));               // tasks insert

    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-06-20");

    expect(fromMock).toHaveBeenCalledTimes(4);
    expect(fromMock).toHaveBeenNthCalledWith(4, "tasks");
  });

  test("creates blueprint with an end date when schedule has end_reference", async () => {
    const scheduleWithEnd = {
      ...SCHEDULE_SEASONAL,
      end_reference: "Seasonal:09-01",
      end_offset_days: null,
    };
    fromMock
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([scheduleWithEnd]))
      .mockReturnValueOnce(chain(CREATED_BP))
      .mockReturnValueOnce(chain(null));

    // 2026-07-01 is between 06-15 and 09-01
    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-07-01");

    expect(fromMock).toHaveBeenCalledTimes(4);
  });

  test("clamps initial task to today when baseDateStr is in the past", async () => {
    // SCHEDULE_IMMEDIATE has no start_reference so start = baseDateStr = past date
    vi.setSystemTime(new Date("2026-05-01"));
    fromMock
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([SCHEDULE_IMMEDIATE]))
      .mockReturnValueOnce(chain(CREATED_BP))
      .mockReturnValueOnce(chain(null));

    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2025-01-01");

    // Verify the tasks.insert call received due_date = today (clamped)
    const tasksChain = fromMock.mock.results[3].value;
    const insertArgs = tasksChain.insert.mock.calls[0][0];
    expect(insertArgs.due_date).toBe("2026-05-01");

    vi.useRealTimers();
  });

  test("updates existing blueprint and its pending tasks when a matching blueprint is found", async () => {
    const matchingBp = { id: "bp-existing", title: "Watering", task_type: "watering", inventory_item_ids: ["i0"] };
    const pendingTask = { id: "t-1", inventory_item_ids: ["i0"] };

    fromMock
      .mockReturnValueOnce(chain([matchingBp]))   // existing bps
      .mockReturnValueOnce(chain([SCHEDULE_SEASONAL])) // schedules
      .mockReturnValueOnce(chain(null))           // task_blueprints update
      .mockReturnValueOnce(chain([pendingTask]))  // tasks pending select
      .mockReturnValueOnce(chain(null));          // tasks update

    await AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-05-01");

    expect(fromMock).toHaveBeenCalledTimes(5);
    expect(fromMock).toHaveBeenNthCalledWith(3, "task_blueprints");
    expect(fromMock).toHaveBeenNthCalledWith(4, "tasks");
    expect(fromMock).toHaveBeenNthCalledWith(5, "tasks");
  });

  test("re-throws after logging when Supabase throws", async () => {
    fromMock.mockImplementation(() => { throw new Error("db error"); });

    await expect(
      AutomationEngine.applyPlantedAutomations([BASE_ITEM], "area-1", "2026-05-01"),
    ).rejects.toThrow("db error");
    expect(Logger.error).toHaveBeenCalled();
  });
});

// ---- applyAilmentAutomations ----

const PLANT_INSTANCE = { id: "pi-1", home_id: "h1", location_id: "l1", area_id: "a1" };

const AILMENT_EMPTY = { id: "ail-1", prevention_steps: [], remedy_steps: [] };

const AILMENT = {
  id: "ail-1",
  prevention_steps: [
    {
      title: "Spray leaves",
      description: "Use neem oil",
      task_type: "spray",
      frequency_type: "weekly",
      frequency_every_n_days: null,
    },
  ],
  remedy_steps: [],
};

const CREATED_AILMENT_BP = {
  id: "bp-ail-1",
  home_id: "h1",
  location_id: "l1",
  area_id: "a1",
  title: "Spray leaves",
  task_type: "spray",
  description: "Use neem oil",
  inventory_item_ids: ["pi-1"],
};

describe("AutomationEngine.applyAilmentAutomations", () => {
  test("returns immediately when ailment has no prevention or remedy steps", async () => {
    await AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, AILMENT_EMPTY, "2026-05-01");
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("creates blueprint and task when no matching blueprint exists", async () => {
    fromMock
      .mockReturnValueOnce(chain([]))                   // existing bps
      .mockReturnValueOnce(chain(CREATED_AILMENT_BP))   // task_blueprints insert+single
      .mockReturnValueOnce(chain(null));                 // tasks insert

    await AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, AILMENT, "2026-05-01");

    expect(fromMock).toHaveBeenCalledTimes(3);
    expect(fromMock).toHaveBeenNthCalledWith(2, "task_blueprints");
    expect(fromMock).toHaveBeenNthCalledWith(3, "tasks");
  });

  test("maps ailment step type correctly when inserting the task", async () => {
    fromMock
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain(CREATED_AILMENT_BP))
      .mockReturnValueOnce(chain(null));

    await AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, AILMENT, "2026-05-01");

    const tasksChain = fromMock.mock.results[2].value;
    const insertArgs = tasksChain.insert.mock.calls[0][0];
    // "spray" → "Pest Control" via ailmentTaskType
    expect(insertArgs.type).toBe("Pest Control");
  });

  test("updates existing blueprint inventory_item_ids when matching blueprint found", async () => {
    const matchingBp = { id: "bp-ail-1", title: "Spray leaves", inventory_item_ids: ["other-plant"] };

    fromMock
      .mockReturnValueOnce(chain([matchingBp]))  // existing bps
      .mockReturnValueOnce(chain(null));          // task_blueprints update

    await AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, AILMENT, "2026-05-01");

    expect(fromMock).toHaveBeenCalledTimes(2);
    const bpChain = fromMock.mock.results[1].value;
    // Should call update, not insert
    expect(bpChain.update).toHaveBeenCalled();
  });

  test("handles both prevention and remedy steps creating separate blueprints", async () => {
    const ailmentMulti = {
      id: "ail-2",
      prevention_steps: [{ title: "Spray", description: "", task_type: "spray", frequency_type: "weekly", frequency_every_n_days: null }],
      remedy_steps:     [{ title: "Prune", description: "", task_type: "prune", frequency_type: "once",   frequency_every_n_days: null }],
    };
    const bp1 = { ...CREATED_AILMENT_BP, id: "bp-1", title: "Spray" };
    const bp2 = { ...CREATED_AILMENT_BP, id: "bp-2", title: "Prune" };

    fromMock
      .mockReturnValueOnce(chain([]))     // existing bps
      .mockReturnValueOnce(chain(bp1))    // insert Spray blueprint
      .mockReturnValueOnce(chain(null))   // insert Spray task
      .mockReturnValueOnce(chain(bp2))    // insert Prune blueprint
      .mockReturnValueOnce(chain(null));  // insert Prune task

    await AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, ailmentMulti, "2026-05-01");

    expect(fromMock).toHaveBeenCalledTimes(5);
  });

  test("re-throws after logging when Supabase throws", async () => {
    fromMock.mockImplementation(() => { throw new Error("ailment fail"); });

    await expect(
      AutomationEngine.applyAilmentAutomations(PLANT_INSTANCE, AILMENT, "2026-05-01"),
    ).rejects.toThrow("ailment fail");
    expect(Logger.error).toHaveBeenCalled();
  });
});

// ---- scrubItemsFromAutomations ----

describe("AutomationEngine.scrubItemsFromAutomations", () => {
  test("returns immediately without any Supabase calls when itemIds is empty", async () => {
    await AutomationEngine.scrubItemsFromAutomations([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("updates blueprint when it still has other items after scrubbing", async () => {
    const bp = { id: "bp-1", inventory_item_ids: ["item-keep", "item-remove"] };

    fromMock
      .mockReturnValueOnce(chain([bp]))  // task_blueprints overlaps
      .mockReturnValueOnce(chain(null))  // task_blueprints update (item-keep remains)
      .mockReturnValueOnce(chain([]));   // tasks overlaps

    await AutomationEngine.scrubItemsFromAutomations(["item-remove"]);

    const bpChain = fromMock.mock.results[1].value;
    expect(bpChain.update).toHaveBeenCalled();
    expect(bpChain.delete).not.toHaveBeenCalled();
  });

  test("deletes blueprint when all its items are scrubbed", async () => {
    const bp = { id: "bp-1", inventory_item_ids: ["item-remove"] };

    fromMock
      .mockReturnValueOnce(chain([bp]))  // task_blueprints overlaps
      .mockReturnValueOnce(chain(null))  // task_blueprints delete (nothing left)
      .mockReturnValueOnce(chain([]));   // tasks overlaps

    await AutomationEngine.scrubItemsFromAutomations(["item-remove"]);

    const bpChain = fromMock.mock.results[1].value;
    expect(bpChain.delete).toHaveBeenCalled();
    expect(bpChain.update).not.toHaveBeenCalled();
  });

  test("updates task when it still has other items after scrubbing", async () => {
    const task = { id: "t-1", inventory_item_ids: ["item-keep", "item-remove"] };

    fromMock
      .mockReturnValueOnce(chain([]))    // task_blueprints overlaps (none)
      .mockReturnValueOnce(chain([task])) // tasks overlaps
      .mockReturnValueOnce(chain(null)); // tasks update

    await AutomationEngine.scrubItemsFromAutomations(["item-remove"]);

    const taskChain = fromMock.mock.results[2].value;
    expect(taskChain.update).toHaveBeenCalled();
    expect(taskChain.delete).not.toHaveBeenCalled();
  });

  test("deletes task when all its items are scrubbed", async () => {
    const task = { id: "t-1", inventory_item_ids: ["item-remove"] };

    fromMock
      .mockReturnValueOnce(chain([]))     // task_blueprints overlaps
      .mockReturnValueOnce(chain([task])) // tasks overlaps
      .mockReturnValueOnce(chain(null));  // tasks delete

    await AutomationEngine.scrubItemsFromAutomations(["item-remove"]);

    const taskChain = fromMock.mock.results[2].value;
    expect(taskChain.delete).toHaveBeenCalled();
    expect(taskChain.update).not.toHaveBeenCalled();
  });

  test("handles multiple itemIds — deduplicates remaining ids correctly", async () => {
    const bp = { id: "bp-1", inventory_item_ids: ["a", "b", "c"] };

    fromMock
      .mockReturnValueOnce(chain([bp]))
      .mockReturnValueOnce(chain(null))
      .mockReturnValueOnce(chain([]));

    await AutomationEngine.scrubItemsFromAutomations(["a", "b"]);

    const bpChain = fromMock.mock.results[1].value;
    // Only "c" remains → update, not delete
    expect(bpChain.update).toHaveBeenCalled();
  });

  test("re-throws after logging when Supabase throws", async () => {
    fromMock.mockImplementation(() => { throw new Error("scrub fail"); });

    await expect(
      AutomationEngine.scrubItemsFromAutomations(["item-1"]),
    ).rejects.toThrow("scrub fail");
    expect(Logger.error).toHaveBeenCalled();
  });
});
