import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import CaptureSheet from "../../../src/components/CaptureSheet";

function renderSheet(open: boolean) {
  const onClose = vi.fn();
  const onNavigate = vi.fn();
  render(
    React.createElement(CaptureSheet, { open, onClose, onNavigate }),
  );
  return { onClose, onNavigate };
}

describe("CaptureSheet — Phase 6b phone create/capture hub", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByTestId("capture-sheet")).toBeNull();
  });

  test("open renders the Diagnose hero and the four create verbs", () => {
    renderSheet(true);
    expect(screen.getByTestId("capture-sheet")).toBeTruthy();
    for (const id of [
      "capture-diagnose",
      "capture-add-plant",
      "capture-journal",
      "capture-add-task",
      "capture-walk",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  test("the hero routes to the Plant Doctor and closes the sheet", () => {
    const { onNavigate, onClose } = renderSheet(true);
    fireEvent.click(screen.getByTestId("capture-diagnose"));
    expect(onNavigate).toHaveBeenCalledWith("/doctor");
    expect(onClose).toHaveBeenCalled();
  });

  test("Garden walk routes to /walk", () => {
    const { onNavigate } = renderSheet(true);
    fireEvent.click(screen.getByTestId("capture-walk"));
    expect(onNavigate).toHaveBeenCalledWith("/walk");
  });
});
