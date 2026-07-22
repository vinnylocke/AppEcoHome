// AddToCalendarSheet (2026-07-22 portal fix) — the sheet must portal to
// document.body so its `position: fixed` overlay resolves against the viewport
// (not a transformed scroll-container ancestor, which sent it off-screen and
// left the page clickable when opened inline from the Seasonal Picks card).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("../../../src/lib/supabase", () => {
  const q: any = {
    select: () => q, eq: () => q, neq: () => q,
    then: (res: any) => res({ data: [], error: null }),
  };
  return { supabase: { from: () => q } };
});
vi.mock("../../../src/lib/plantCatalogue", () => ({
  findHomePlantForCatalogue: vi.fn().mockResolvedValue(null),
  saveCataloguePlantToShed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/lib/blueprintDuplicateCheck", () => ({
  findLikelyDuplicates: () => new Set<number>(),
}));
vi.mock("../../../src/components/TaskActionButtons", () => ({
  TaskActionButtons: () => React.createElement("div", { "data-testid": "mock-task-action-buttons" }),
}));
vi.mock("../../../src/lib/errorHandler", () => ({ Logger: { error: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import AddToCalendarSheet from "../../../src/components/growGuide/AddToCalendarSheet";

const TASKS = [{
  title: "Sow", description: "d", task_type: "Planting", is_recurring: false,
  frequency_days: null, active_months: ["Mar"], duration_days: null, priority: "Medium", depends_on_index: null,
}];

function renderSheet(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  render(
    React.createElement(AddToCalendarSheet as any, {
      open: true, homeId: "home-1", plantId: 5, plantName: "Lettuce",
      schedulableTasks: TASKS, onClose, ...overrides,
    }),
  );
  return { onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("AddToCalendarSheet — portal + backdrop", () => {
  test("mounts into document.body (portaled, not nested in the caller)", async () => {
    renderSheet();
    const sheet = await screen.findByTestId("add-to-calendar-sheet");
    expect(sheet.parentElement).toBe(document.body);
    // The inner panel is a proper dialog (focus target).
    expect(sheet.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy();
  });

  test("clicking the backdrop closes; clicking the panel does not", async () => {
    const { onClose } = renderSheet();
    const sheet = await screen.findByTestId("add-to-calendar-sheet");

    fireEvent.click(sheet.querySelector('[role="dialog"]')!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(sheet); // the overlay/backdrop
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape closes the sheet", async () => {
    const { onClose } = renderSheet();
    await screen.findByTestId("add-to-calendar-sheet");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("open=false renders nothing", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("add-to-calendar-sheet")).toBeNull();
  });
});
