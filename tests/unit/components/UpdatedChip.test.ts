import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import UpdatedChip from "../../../src/components/aiPlants/UpdatedChip";

describe("UpdatedChip", () => {
  test("renders nothing when count is 0", () => {
    const { container } = render(React.createElement(UpdatedChip, { count: 0 }));
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when count is negative", () => {
    const { container } = render(React.createElement(UpdatedChip, { count: -1 }));
    expect(container.firstChild).toBeNull();
  });

  // 2026-07-08 calm-down: one quiet phrase, never a per-field count shout
  // (docs/plans/ai-plant-freshness-and-edit-ux-overhaul.md).
  test("renders the quiet 'Update available' label for any positive count", () => {
    render(React.createElement(UpdatedChip, { count: 3 }));
    expect(screen.getByTestId("ai-updated-chip").textContent).toContain("Update available");
    expect(screen.getByTestId("ai-updated-chip").textContent).not.toContain("fields");
  });

  test("count 1 uses the same label", () => {
    render(React.createElement(UpdatedChip, { count: 1 }));
    expect(screen.getByTestId("ai-updated-chip").textContent).toContain("Update available");
  });

  test("renders as button + fires onClick when handler provided", () => {
    const handleClick = vi.fn();
    render(React.createElement(UpdatedChip, { count: 2, onClick: handleClick }));

    const chip = screen.getByTestId("ai-updated-chip");
    expect(chip.tagName).toBe("BUTTON");
    fireEvent.click(chip);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  test("renders as span when no onClick provided", () => {
    render(React.createElement(UpdatedChip, { count: 2 }));
    const chip = screen.getByTestId("ai-updated-chip");
    expect(chip.tagName).toBe("SPAN");
  });
});
