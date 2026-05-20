import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import SourceChip from "../../../src/components/aiPlants/SourceChip";

describe("SourceChip", () => {
  test("renders nothing for non-AI source", () => {
    const { container } = render(
      React.createElement(SourceChip, { source: "api", overriddenFields: [] }),
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing for manual source", () => {
    const { container } = render(
      React.createElement(SourceChip, { source: "manual", overriddenFields: null }),
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders 'AI' variant when overriddenFields is null", () => {
    render(React.createElement(SourceChip, { source: "ai", overriddenFields: null }));
    const chip = screen.getByTestId("ai-source-chip-catalogue");
    expect(chip.textContent?.trim()).toContain("AI");
    // Make sure we no longer leak the old jargon.
    expect(chip.textContent).not.toContain("catalogue");
    expect(chip.textContent).not.toContain("Auto-updating");
  });

  test("renders 'AI' variant when overriddenFields is empty array", () => {
    render(React.createElement(SourceChip, { source: "ai", overriddenFields: [] }));
    expect(screen.getByTestId("ai-source-chip-catalogue")).toBeTruthy();
  });

  test("renders 'AI · Edited' variant when overriddenFields has entries", () => {
    render(
      React.createElement(SourceChip, {
        source: "ai",
        overriddenFields: ["watering_min_days"],
      }),
    );
    const chip = screen.getByTestId("ai-source-chip-custom");
    expect(chip.textContent).toContain("Edited");
    expect(chip.textContent).not.toContain("Custom");
  });
});
