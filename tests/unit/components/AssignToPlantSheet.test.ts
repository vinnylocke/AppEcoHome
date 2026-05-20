import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const { inventoryRows } = vi.hoisted(() => ({
  inventoryRows: [
    {
      id: "inv-1",
      plant_name: "Tomato",
      status: "Planted",
      plants: { common_name: "Tomato" },
      areas: { name: "South Bed", locations: { name: "Back Garden" } },
    },
    {
      id: "inv-2",
      plant_name: "Basil",
      status: "Planted",
      plants: { common_name: "Basil" },
      areas: { name: "Windowsill", locations: { name: "Indoor" } },
    },
    {
      id: "inv-3-archived",
      plant_name: "Mint",
      status: "Archived",
      plants: { common_name: "Mint" },
      areas: null,
    },
  ] as unknown as Array<Record<string, unknown>>,
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (_table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.neq = (_col: string, val: string) => {
        // Mirror real query: .neq("status", "Archived")
        if (val === "Archived") {
          const filtered = inventoryRows.filter(
            (r) => (r as { status: string }).status !== "Archived",
          );
          builder.order = (_sortCol: string, _opts: unknown) => ({
            limit: (_n: number) =>
              Promise.resolve({ data: filtered, error: null }),
          });
        }
        return builder;
      };
      builder.order = () => builder;
      builder.limit = () => Promise.resolve({ data: inventoryRows, error: null });
      return builder;
    },
  },
}));

vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn() },
}));

// Real focus-trap is fine — jsdom supports it.

import AssignToPlantSheet from "../../../src/components/quick/AssignToPlantSheet";

const onAssignMock = vi.fn(async () => {});
const onCloseMock = vi.fn();

beforeEach(() => {
  onAssignMock.mockReset();
  onCloseMock.mockReset();
});

function renderSheet(overrides?: Partial<React.ComponentProps<typeof AssignToPlantSheet>>) {
  return render(
    React.createElement(AssignToPlantSheet, {
      homeId: "home-1",
      entryId: "j1",
      entrySubject: "Yellow spots on leaves",
      onAssign: onAssignMock,
      onClose: onCloseMock,
      ...overrides,
    }),
  );
}

describe("AssignToPlantSheet", () => {
  test("renders the entry subject in the header", async () => {
    renderSheet();
    await waitFor(() =>
      expect(screen.getByText("Yellow spots on leaves")).toBeTruthy(),
    );
  });

  test("lists non-archived inventory items", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("assign-sheet-item-inv-1")).toBeTruthy());
    expect(screen.getByTestId("assign-sheet-item-inv-2")).toBeTruthy();
    expect(screen.queryByTestId("assign-sheet-item-inv-3-archived")).toBeNull();
  });

  test("search filters by plant name", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("assign-sheet-item-inv-1")).toBeTruthy());
    fireEvent.change(screen.getByTestId("assign-sheet-search"), { target: { value: "basil" } });
    expect(screen.queryByTestId("assign-sheet-item-inv-1")).toBeNull();
    expect(screen.getByTestId("assign-sheet-item-inv-2")).toBeTruthy();
  });

  test("picking an item calls onAssign with the right ids and then onClose", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("assign-sheet-item-inv-2")).toBeTruthy());
    fireEvent.click(screen.getByTestId("assign-sheet-item-inv-2"));
    await waitFor(() => expect(onAssignMock).toHaveBeenCalled());
    expect(onAssignMock).toHaveBeenCalledWith("j1", "inv-2");
    await waitFor(() => expect(onCloseMock).toHaveBeenCalledTimes(1));
  });

  test("close button calls onClose", async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("assign-sheet-close"));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test("empty-search result renders the no-matches empty state", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("assign-sheet-item-inv-1")).toBeTruthy());
    fireEvent.change(screen.getByTestId("assign-sheet-search"), { target: { value: "zzz" } });
    expect(screen.getByTestId("assign-sheet-empty")).toBeTruthy();
  });
});
