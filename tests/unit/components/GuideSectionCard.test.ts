import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import GuideSectionCard from "../../../src/components/growGuide/GuideSectionCard";
import type { GrowGuideSection } from "../../../src/services/plantDoctorService";

function makeSection(overrides: Partial<GrowGuideSection> = {}): GrowGuideSection {
  return {
    category: "water",
    applicable: true,
    title: "Watering",
    summary: "Water deeply every few days.",
    key_facts: [{ label: "Frequency", value: "Every 3-4 days" }],
    steps: [],
    tips: ["Avoid wet leaves."],
    notes: null,
    ...overrides,
  };
}

describe("GuideSectionCard", () => {
  test("renders the title + summary in the header", () => {
    render(React.createElement(GuideSectionCard, { section: makeSection() }));
    expect(screen.getByText("Watering")).toBeTruthy();
    // Summary shows in the collapsed header line-clamp.
    expect(screen.getAllByText("Water deeply every few days.").length).toBeGreaterThan(0);
  });

  test("body is hidden when defaultOpen is false (default)", () => {
    render(React.createElement(GuideSectionCard, { section: makeSection() }));
    expect(screen.queryByTestId("guide-section-water-body")).toBeNull();
  });

  test("body is visible when defaultOpen is true", () => {
    render(
      React.createElement(GuideSectionCard, { section: makeSection(), defaultOpen: true }),
    );
    expect(screen.getByTestId("guide-section-water-body")).toBeTruthy();
  });

  test("toggle button expands and collapses the body", () => {
    render(React.createElement(GuideSectionCard, { section: makeSection() }));
    expect(screen.queryByTestId("guide-section-water-body")).toBeNull();
    fireEvent.click(screen.getByTestId("guide-section-water-toggle"));
    expect(screen.getByTestId("guide-section-water-body")).toBeTruthy();
    fireEvent.click(screen.getByTestId("guide-section-water-toggle"));
    expect(screen.queryByTestId("guide-section-water-body")).toBeNull();
  });

  test("renders key_facts when populated", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({
          key_facts: [
            { label: "Frequency", value: "Every 3-4 days" },
            { label: "Method", value: "Water at soil level" },
          ],
        }),
        defaultOpen: true,
      }),
    );
    expect(screen.getByTestId("guide-section-water-facts")).toBeTruthy();
    expect(screen.getByText("Every 3-4 days")).toBeTruthy();
    expect(screen.getByText("Water at soil level")).toBeTruthy();
  });

  test("hides key_facts block when empty", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ key_facts: [] }),
        defaultOpen: true,
      }),
    );
    expect(screen.queryByTestId("guide-section-water-facts")).toBeNull();
  });

  test("renders ordered steps for action sections", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({
          category: "propagation",
          title: "Propagation",
          steps: [
            { step: 1, title: "Take cutting", detail: "5cm tip cutting." },
            { step: 2, title: "Strip leaves", detail: "Remove bottom leaves." },
          ],
        }),
        defaultOpen: true,
      }),
    );
    expect(screen.getByTestId("guide-section-propagation-steps")).toBeTruthy();
    expect(screen.getByText("Take cutting")).toBeTruthy();
    expect(screen.getByText("Strip leaves")).toBeTruthy();
    expect(screen.getByText("5cm tip cutting.")).toBeTruthy();
  });

  test("hides steps block when empty", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ steps: [] }),
        defaultOpen: true,
      }),
    );
    expect(screen.queryByTestId("guide-section-water-steps")).toBeNull();
  });

  test("renders tips list when populated", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ tips: ["Tip one.", "Tip two."] }),
        defaultOpen: true,
      }),
    );
    expect(screen.getByTestId("guide-section-water-tips")).toBeTruthy();
    expect(screen.getByText("Tip one.")).toBeTruthy();
    expect(screen.getByText("Tip two.")).toBeTruthy();
  });

  test("hides tips block when empty", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ tips: [] }),
        defaultOpen: true,
      }),
    );
    expect(screen.queryByTestId("guide-section-water-tips")).toBeNull();
  });

  test("renders notes block when notes is non-empty", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ notes: "Highly variable in coastal microclimates" }),
        defaultOpen: true,
      }),
    );
    expect(screen.getByTestId("guide-section-water-notes")).toBeTruthy();
  });

  test("hides notes block when notes is null", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ notes: null }),
        defaultOpen: true,
      }),
    );
    expect(screen.queryByTestId("guide-section-water-notes")).toBeNull();
  });

  test("hides notes block when notes is empty string", () => {
    render(
      React.createElement(GuideSectionCard, {
        section: makeSection({ notes: "   " }),
        defaultOpen: true,
      }),
    );
    expect(screen.queryByTestId("guide-section-water-notes")).toBeNull();
  });
});
