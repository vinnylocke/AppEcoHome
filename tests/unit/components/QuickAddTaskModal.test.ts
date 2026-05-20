import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Supabase mock — record the last insert + control insert errors.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: {
    lastInsert: null as Record<string, unknown> | null,
    forceError: null as string | null,
    userId: "user-1" as string | null,
  },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: supabaseState.userId
            ? { user: { id: supabaseState.userId } }
            : { user: null },
        }),
    },
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (supabaseState.forceError) {
          return Promise.resolve({ error: { message: supabaseState.forceError } });
        }
        supabaseState.lastInsert = row;
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn() },
}));

const { logEventMock } = vi.hoisted(() => ({ logEventMock: vi.fn() }));
vi.mock("../../../src/events/registry", () => ({
  EVENT: { TASK_CREATED: "task_created" },
  logEvent: logEventMock,
}));

const { toastSuccessFn, toastErrorFn } = vi.hoisted(() => ({
  toastSuccessFn: vi.fn(),
  toastErrorFn: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: toastSuccessFn,
    error: toastErrorFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  toast: Object.assign(vi.fn(), {
    success: toastSuccessFn,
    error: toastErrorFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import QuickAddTaskModal from "../../../src/components/quick/QuickAddTaskModal";

beforeEach(() => {
  supabaseState.lastInsert = null;
  supabaseState.forceError = null;
  supabaseState.userId = "user-1";
  logEventMock.mockReset();
  toastSuccessFn.mockReset();
  toastErrorFn.mockReset();
});

const onCloseMock = vi.fn();
const onSuccessMock = vi.fn();

beforeEach(() => {
  onCloseMock.mockReset();
  onSuccessMock.mockReset();
});

function renderModal(overrides?: Partial<React.ComponentProps<typeof QuickAddTaskModal>>) {
  return render(
    React.createElement(QuickAddTaskModal, {
      homeId: "home-1",
      onClose: onCloseMock,
      onSuccess: onSuccessMock,
      ...overrides,
    }),
  );
}

describe("QuickAddTaskModal", () => {
  test("Save is disabled until a title is entered", () => {
    renderModal();
    expect(
      (screen.getByTestId("quick-add-task-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByTestId("quick-add-task-title-input"), {
      target: { value: "Water tomatoes" },
    });
    expect(
      (screen.getByTestId("quick-add-task-save") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("default type is Maintenance; date is pre-filled to today", () => {
    renderModal();
    // Maintenance button is the active one — its class includes bg-rhozly-primary
    const maintenanceBtn = screen.getByTestId("quick-add-task-type-Maintenance");
    expect(maintenanceBtn.className).toContain("bg-rhozly-primary");

    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(
      (screen.getByTestId("quick-add-task-date-input") as HTMLInputElement).value,
    ).toBe(expected);
  });

  test("type picker switches the active type", () => {
    renderModal();
    const watering = screen.getByTestId("quick-add-task-type-Watering");
    fireEvent.click(watering);
    expect(watering.className).toContain("bg-rhozly-primary");
    expect(screen.getByTestId("quick-add-task-type-Maintenance").className).not.toContain(
      "bg-rhozly-primary",
    );
  });

  test("Save inserts the right row shape, then fires onSuccess + onClose", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("quick-add-task-title-input"), {
      target: { value: "  Prune the basil  " },
    });
    fireEvent.click(screen.getByTestId("quick-add-task-type-Pruning"));
    fireEvent.change(screen.getByTestId("quick-add-task-description-input"), {
      target: { value: "Pinch top leaves" },
    });
    fireEvent.change(screen.getByTestId("quick-add-task-date-input"), {
      target: { value: "2026-06-15" },
    });
    fireEvent.click(screen.getByTestId("quick-add-task-save"));

    await waitFor(() => expect(supabaseState.lastInsert).not.toBeNull());
    const row = supabaseState.lastInsert!;
    expect(row.home_id).toBe("home-1");
    expect(row.title).toBe("Prune the basil");
    expect(row.type).toBe("Pruning");
    expect(row.description).toBe("Pinch top leaves");
    expect(row.due_date).toBe("2026-06-15");
    expect(row.status).toBe("Pending");
    expect(row.scope).toBe("home");
    expect(row.created_by).toBe("user-1");

    expect(toastSuccessFn).toHaveBeenCalledWith("Task added");
    expect(onSuccessMock).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith(
      "task_created",
      expect.objectContaining({ source: "quick_add", type: "Pruning" }),
    );
  });

  test("empty description is written as null", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("quick-add-task-title-input"), {
      target: { value: "Quick water" },
    });
    fireEvent.click(screen.getByTestId("quick-add-task-save"));

    await waitFor(() => expect(supabaseState.lastInsert).not.toBeNull());
    expect(supabaseState.lastInsert!.description).toBeNull();
  });

  test("insert error renders inline error and does NOT close", async () => {
    supabaseState.forceError = "RLS denied";
    renderModal();
    fireEvent.change(screen.getByTestId("quick-add-task-title-input"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByTestId("quick-add-task-save"));

    await waitFor(() => expect(screen.getByTestId("quick-add-task-error")).toBeTruthy());
    expect(screen.getByTestId("quick-add-task-error").textContent).toContain("RLS denied");
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  test("Cancel button calls onClose without writing", () => {
    renderModal();
    fireEvent.change(screen.getByTestId("quick-add-task-title-input"), {
      target: { value: "Won't be saved" },
    });
    fireEvent.click(screen.getByTestId("quick-add-task-cancel"));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
    expect(supabaseState.lastInsert).toBeNull();
  });

  test("Close (×) button calls onClose without writing", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("quick-add-task-close"));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
    expect(supabaseState.lastInsert).toBeNull();
  });

  test("backdrop click closes the modal", () => {
    renderModal();
    // Click the wrapper (backdrop)
    fireEvent.click(screen.getByTestId("quick-add-task-modal"));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
