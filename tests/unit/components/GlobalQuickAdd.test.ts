import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Mock navigate so we can assert routing intent for each launcher item.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import GlobalQuickAdd from "../../../src/components/GlobalQuickAdd";

function renderQuickAdd() {
  return render(
    React.createElement(MemoryRouter, null, React.createElement(GlobalQuickAdd)),
  );
}

function open() {
  fireEvent.click(screen.getByTestId("global-quick-add-button"));
}

describe("GlobalQuickAdd — Phase 5 pruned launcher", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("menu is collapsed until the button is tapped", () => {
    renderQuickAdd();
    expect(screen.queryByTestId("quick-add-add-plant")).toBeNull();
    open();
    expect(screen.getByTestId("quick-add-add-plant")).toBeTruthy();
  });

  test("renders exactly the five kept verbs", () => {
    renderQuickAdd();
    open();
    const kept = [
      "quick-add-add-plant",
      "quick-add-add-task",
      "quick-add-diagnose",
      "quick-add-create-plan",
      "quick-add-create-location",
    ];
    for (const id of kept) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // The menu holds only those five items.
    expect(screen.getAllByRole("menuitem")).toHaveLength(kept.length);
  });

  test("drops the four retired verbs", () => {
    renderQuickAdd();
    open();
    for (const id of [
      "quick-add-add-todo-list",
      "quick-add-todo-lists",
      "quick-add-create-task", // "Add Task Automation"
      "quick-add-log-ailment",
      "quick-add-create-guide",
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  test("Diagnose a Plant routes to the Plant Doctor", () => {
    renderQuickAdd();
    open();
    fireEvent.click(screen.getByTestId("quick-add-diagnose"));
    expect(navigateMock).toHaveBeenCalledWith("/doctor");
  });

  test("Add Plant routes to the Shed add-plant flow", () => {
    renderQuickAdd();
    open();
    fireEvent.click(screen.getByTestId("quick-add-add-plant"));
    expect(navigateMock).toHaveBeenCalledWith("/shed?open=add-plant");
  });
});
