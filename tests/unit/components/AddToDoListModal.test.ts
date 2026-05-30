import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import React from "react";

// Mocks for the supabase chain — hoisted so vi.mock factory can reference them.
const { insertListMock, insertTasksMock, supabaseMock } = vi.hoisted(() => {
  const insertListMock = vi.fn();
  const insertTasksMock = vi.fn();
  const supabaseMock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn((table: string) => {
      if (table === "todo_lists") {
        return {
          insert: (payload: unknown) => ({
            select: () => ({ single: () => insertListMock(payload) }),
          }),
        };
      }
      if (table === "tasks") {
        return { insert: (rows: unknown[]) => insertTasksMock(rows) };
      }
      return {};
    }),
  };
  return { insertListMock, insertTasksMock, supabaseMock };
});

vi.mock("../../../src/lib/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../../../src/lib/errorHandler", () => ({ Logger: { error: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../src/hooks/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

import AddToDoListModal from "../../../src/components/todo/AddToDoListModal";

beforeEach(() => {
  insertListMock.mockReset();
  insertTasksMock.mockReset();
  supabaseMock.from.mockClear();
});

const renderModal = (props: Partial<React.ComponentProps<typeof AddToDoListModal>> = {}) =>
  render(
    React.createElement(AddToDoListModal, {
      homeId: "home-1",
      onClose: vi.fn(),
      ...props,
    }),
  );

describe("AddToDoListModal", () => {
  test("renders one task row by default with date + name fields", () => {
    renderModal();
    expect(screen.getByTestId("add-todo-due-date")).toBeTruthy();
    expect(screen.getByTestId("add-todo-list-name")).toBeTruthy();
    expect(screen.getByTestId("add-todo-task-row-0")).toBeTruthy();
    expect(screen.queryByTestId("add-todo-task-row-1")).toBeNull();
  });

  test("Add task button appends a new row", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("add-todo-add-row"));
    expect(screen.getByTestId("add-todo-task-row-1")).toBeTruthy();
  });

  test("submit is disabled until at least one task has a title", () => {
    renderModal();
    const submit = screen.getByTestId("add-todo-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("add-todo-task-title-0"), { target: { value: "Weed beds" } });
    expect((screen.getByTestId("add-todo-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  test("submitting inserts a todo_lists row + a bulk tasks insert with todo_list_id", async () => {
    insertListMock.mockResolvedValue({ data: { id: "list-9" }, error: null });
    insertTasksMock.mockResolvedValue({ error: null });
    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    fireEvent.change(screen.getByTestId("add-todo-due-date"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByTestId("add-todo-list-name"), { target: { value: "Weekend prep" } });
    fireEvent.change(screen.getByTestId("add-todo-task-title-0"), { target: { value: "Weed beds" } });
    fireEvent.change(screen.getByTestId("add-todo-task-type-0"), { target: { value: "Maintenance" } });
    fireEvent.click(screen.getByTestId("add-todo-add-row"));
    fireEvent.change(screen.getByTestId("add-todo-task-title-1"), { target: { value: "Water tomatoes" } });
    fireEvent.change(screen.getByTestId("add-todo-task-type-1"), { target: { value: "Watering" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("add-todo-submit"));
    });

    await waitFor(() => expect(insertListMock).toHaveBeenCalled());
    expect(insertListMock).toHaveBeenCalledWith(expect.objectContaining({
      home_id: "home-1",
      name: "Weekend prep",
      due_date: "2026-06-01",
      created_by: "user-1",
    }));
    expect(insertTasksMock).toHaveBeenCalledTimes(1);
    const rows = insertTasksMock.mock.calls[0][0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      home_id: "home-1",
      title: "Weed beds",
      type: "Maintenance",
      due_date: "2026-06-01",
      status: "Pending",
      todo_list_id: "list-9",
    });
    expect(rows[1]).toMatchObject({ title: "Water tomatoes", type: "Watering" });
    expect(onSuccess).toHaveBeenCalledWith("list-9");
  });

  test("blank list-name is stored as null (UI renders the auto-name from the date)", async () => {
    insertListMock.mockResolvedValue({ data: { id: "list-10" }, error: null });
    insertTasksMock.mockResolvedValue({ error: null });
    renderModal();
    fireEvent.change(screen.getByTestId("add-todo-task-title-0"), { target: { value: "X" } });
    await act(async () => { fireEvent.click(screen.getByTestId("add-todo-submit")); });
    await waitFor(() => expect(insertListMock).toHaveBeenCalled());
    expect(insertListMock).toHaveBeenCalledWith(expect.objectContaining({ name: null }));
  });
});
