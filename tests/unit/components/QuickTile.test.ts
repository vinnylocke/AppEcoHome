import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import QuickTile from "../../../src/components/quick/QuickTile";

// The "coming-soon" variant (subdued tile + amber badge) was removed in the
// never-promise sweep (docs/plans/remove-app-promise-strings.md) — every tile
// is live and navigates. Tests for that variant were retired with it.

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

  test("no 'Coming soon' badge is ever rendered, click fires handler", () => {
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

  test("compact layout renders the launcher tile with its accent", () => {
    render(
      React.createElement(QuickTile, {
        icon: React.createElement("span", null, "🩺"),
        title: "Plant Doctor",
        description: "Identify and diagnose",
        testId: "quick-tile-doctor",
        accent: "green",
        layout: "compact",
        onClick: () => {},
      }),
    );
    const tile = screen.getByTestId("quick-tile-doctor");
    expect(tile.getAttribute("data-layout")).toBe("compact");
    expect(tile.getAttribute("data-accent")).toBe("green");
    expect(screen.queryByTestId("quick-tile-doctor-coming-soon")).toBeNull();
  });
});
