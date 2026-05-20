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

  test("renders 'N fields updated' for count >= 2", () => {
    render(React.createElement(UpdatedChip, { count: 3 }));
    expect(screen.getByTestId("ai-updated-chip").textContent).toContain("3 fields updated");
  });

  test("renders singular '1 field updated' for count 1", () => {
    render(React.createElement(UpdatedChip, { count: 1 }));
    expect(screen.getByTestId("ai-updated-chip").textContent).toContain("1 field updated");
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
