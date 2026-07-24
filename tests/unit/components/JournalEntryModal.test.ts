import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import JournalEntryModal from "../../../src/components/journal/JournalEntryModal";

const entry = {
  id: "e1",
  home_id: "h1",
  subject: "First bloom",
  description: "The roses opened this morning",
  image_url: null,
  created_at: "2026-07-24T09:00:00.000Z",
  inventory_item_id: null,
  location_id: null,
  area_id: null,
  plan_id: null,
  task_id: null,
} as any;

describe("JournalEntryModal (#9) — View mode", () => {
  afterEach(() => cleanup());

  test("renders the entry read-only with subject + description + Edit button", () => {
    render(React.createElement(JournalEntryModal, { entry, homeId: "h1", onClose: vi.fn() }));
    expect(screen.getByTestId("journal-entry-modal")).toBeTruthy();
    expect(screen.getByText("First bloom")).toBeTruthy();
    expect(screen.getByText("The roses opened this morning")).toBeTruthy();
    // Edit lives inside the modal; view mode does not mount the composer.
    expect(screen.getByTestId("journal-entry-edit")).toBeTruthy();
    expect(screen.queryByTestId("journal-composer")).toBeNull();
  });

  test("the close button calls onClose", () => {
    const onClose = vi.fn();
    render(React.createElement(JournalEntryModal, { entry, homeId: "h1", onClose }));
    fireEvent.click(screen.getByTestId("journal-entry-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("an unassigned entry shows the 'Unassigned' target chip", () => {
    render(React.createElement(JournalEntryModal, { entry, homeId: "h1", onClose: vi.fn() }));
    expect(screen.getByText("Unassigned")).toBeTruthy();
  });
});
