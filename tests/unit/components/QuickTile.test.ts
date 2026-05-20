import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import QuickTile from "../../../src/components/quick/QuickTile";

describe("QuickTile", () => {
  test("renders title and description", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "🌿"),
        title: "Visual Lens",
        description: "Analyse a plant from a photo",
        testId: "quick-tile-lens",
        onClick: () => {},
      }),
    );
    expect(screen.getByText("Visual Lens")).toBeTruthy();
    expect(screen.getByText("Analyse a plant from a photo")).toBeTruthy();
  });

  test("live variant — no 'Coming soon' badge, click fires handler", () => {
    const onClick = vi.fn();
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "📷"),
        title: "Visual Lens",
        description: "Analyse a plant from a photo",
        testId: "quick-tile-lens",
        onClick,
      }),
    );
    expect(screen.queryByTestId("quick-tile-lens-coming-soon")).toBeNull();
    fireEvent.click(screen.getByTestId("quick-tile-lens"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("coming-soon variant shows the badge", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "📅"),
        title: "Today",
        description: "Tasks and rain forecast",
        testId: "quick-tile-calendar",
        variant: "coming-soon",
        onClick: () => {},
      }),
    );
    const badge = screen.getByTestId("quick-tile-calendar-coming-soon");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("Coming soon");
  });

  test("coming-soon variant — click still fires handler so parent can toast", () => {
    const onClick = vi.fn();
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "📝"),
        title: "Quick Capture",
        description: "Snap and write a note",
        testId: "quick-tile-journal",
        variant: "coming-soon",
        onClick,
      }),
    );
    fireEvent.click(screen.getByTestId("quick-tile-journal"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
