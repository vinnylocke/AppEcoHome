// Next Best Action (redesign Stage 4) — the Porch's single guided suggestion.
// These tests exercise the priority ladder (attention → first task → seasonal
// fallback) and the deliberate "no counts" contract, plus the navigation
// intent for each rung.
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import type { AttentionItem } from "../../../src/hooks/useHomeOverview";

// Mock navigate so we can assert routing intent for each rung.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import NextBestAction from "../../../src/components/home/NextBestAction";

function renderNBA(props: {
  attentionItems: AttentionItem[];
  firstTaskTitle?: string | null;
}) {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NextBestAction, props),
    ),
  );
}

const harvestItem: AttentionItem = {
  kind: "harvest_closing",
  title: "Harvest window closing on your tomatoes",
  body: "Pick within 3 days for the best flavour.",
  route: "/shed?filter=harvest",
};

describe("NextBestAction — priority ladder", () => {
  beforeEach(() => navigateMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  test("rung 1: leads with the first attention item and navigates to its route", () => {
    renderNBA({ attentionItems: [harvestItem], firstTaskTitle: "Water the beds" });
    expect(screen.getByTestId("next-best-action")).toBeTruthy();
    // Attention wins over the task title when both are present.
    expect(screen.getByText(harvestItem.title)).toBeTruthy();
    fireEvent.click(screen.getByTestId("next-best-action-cta"));
    expect(navigateMock).toHaveBeenCalledWith(harvestItem.route);
  });

  test("rung 2: falls to the first pending task when no attention items", () => {
    renderNBA({ attentionItems: [], firstTaskTitle: "Water the beds" });
    expect(screen.getByText("Water the beds")).toBeTruthy();
    fireEvent.click(screen.getByTestId("next-best-action-cta"));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard?view=calendar");
  });

  test("rung 3: seasonal fallback when neither attention nor a task title is present", () => {
    renderNBA({ attentionItems: [] });
    expect(screen.getByText("Browse what to plant right now")).toBeTruthy();
    // No learn section mounted in the test DOM → deep-links to the add-plant flow.
    fireEvent.click(screen.getByTestId("next-best-action-cta"));
    expect(navigateMock).toHaveBeenCalledWith("/shed?open=add-plant");
  });

  test("seasonal fallback scrolls to the learn section when it has content (no navigation)", () => {
    const learn = document.createElement("div");
    learn.setAttribute("data-section", "learn");
    // A populated Seasonal Picks card → the wrapper has element children.
    learn.appendChild(document.createElement("article"));
    learn.scrollIntoView = vi.fn();
    document.body.appendChild(learn);

    renderNBA({ attentionItems: [] });
    fireEvent.click(screen.getByTestId("next-best-action-cta"));
    expect(learn.scrollIntoView).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();

    document.body.removeChild(learn);
  });

  test("seasonal fallback navigates when the learn section is present but EMPTY (SeasonalPicks self-hid)", () => {
    // The wrapper is always in the Porch DOM but `empty:hidden` when Seasonal
    // Picks returns null — the CTA must still go somewhere useful, not no-op.
    const learn = document.createElement("div");
    learn.setAttribute("data-section", "learn"); // no children
    learn.scrollIntoView = vi.fn();
    document.body.appendChild(learn);

    renderNBA({ attentionItems: [] });
    fireEvent.click(screen.getByTestId("next-best-action-cta"));
    expect(learn.scrollIntoView).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/shed?open=add-plant");

    document.body.removeChild(learn);
  });

  test("renders no raw counts (the Porch's no-metrics contract)", () => {
    const { container } = renderNBA({ attentionItems: [harvestItem] });
    // The card's copy carries advice, never a bare tally like "3 tasks".
    expect(container.textContent).not.toMatch(/\d+\s+(task|overdue|alert)/i);
  });
});
