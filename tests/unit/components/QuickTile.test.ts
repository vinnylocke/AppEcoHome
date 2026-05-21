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

  test("defaults to the primary accent when no accent prop is provided", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "🌿"),
        title: "Visual Lens",
        description: "Analyse a plant from a photo",
        testId: "quick-tile-lens",
        onClick: () => {},
      }),
    );
    expect(screen.getByTestId("quick-tile-lens").getAttribute("data-accent")).toBe(
      "primary",
    );
    expect(screen.getByTestId("quick-tile-lens-glow")).toBeTruthy();
  });

  test("tertiary accent renders the peachy top-glow", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "📅"),
        title: "Today",
        description: "Tasks + weather",
        testId: "quick-tile-calendar",
        accent: "tertiary",
        onClick: () => {},
      }),
    );
    const tile = screen.getByTestId("quick-tile-calendar");
    expect(tile.getAttribute("data-accent")).toBe("tertiary");
    const glow = screen.getByTestId("quick-tile-calendar-glow");
    expect(glow.className).toContain("rhozly-tertiary");
  });

  test("container accent renders the lighter-green top-glow", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "📝"),
        title: "Quick Capture",
        description: "Capture and file later",
        testId: "quick-tile-journal",
        accent: "container",
        onClick: () => {},
      }),
    );
    const tile = screen.getByTestId("quick-tile-journal");
    expect(tile.getAttribute("data-accent")).toBe("container");
    const glow = screen.getByTestId("quick-tile-journal-glow");
    expect(glow.className).toContain("rhozly-primary-container");
  });

  test("coming-soon tiles have data-accent='disabled' and no glow", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "🧪"),
        title: "Future",
        description: "Not ready yet",
        testId: "quick-tile-future",
        variant: "coming-soon",
        accent: "tertiary",
        onClick: () => {},
      }),
    );
    expect(
      screen.getByTestId("quick-tile-future").getAttribute("data-accent"),
    ).toBe("disabled");
    expect(screen.queryByTestId("quick-tile-future-glow")).toBeNull();
  });
});
