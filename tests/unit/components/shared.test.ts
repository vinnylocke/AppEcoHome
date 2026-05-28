import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { __resetPersonaCacheForTests, notifyPersonaChanged } from "../../../src/hooks/usePersona";

// ─── Mock supabase before importing components ───────────────────────
vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null })),
        })),
      })),
    })),
  },
}));

import InfoTooltip from "../../../src/components/InfoTooltip";
import EmptyState from "../../../src/components/shared/EmptyState";
import SurfaceLoader from "../../../src/components/shared/SurfaceLoader";

beforeEach(() => {
  __resetPersonaCacheForTests();
  notifyPersonaChanged(null);
});

// ─── InfoTooltip ─────────────────────────────────────────────────────

describe("InfoTooltip", () => {
  test("renders a trigger button with default aria-label", () => {
    render(React.createElement(InfoTooltip, null, "Soil pH affects which plants thrive."));
    const trigger = screen.getByRole("button", { name: "More information" });
    expect(trigger).toBeTruthy();
  });

  test("respects a custom label prop", () => {
    render(
      React.createElement(InfoTooltip, { label: "pH explained" }, "pH body"),
    );
    expect(screen.getByRole("button", { name: "pH explained" })).toBeTruthy();
  });

  test("popover is hidden by default and appears on click", () => {
    render(
      React.createElement(InfoTooltip, null, "Soil pH affects which plants thrive."),
    );
    expect(screen.queryByText("Soil pH affects which plants thrive.")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Soil pH affects which plants thrive.")).toBeTruthy();
  });

  test("popover closes on second click", () => {
    render(React.createElement(InfoTooltip, null, "Body text"));
    const trigger = screen.getByRole("button", { name: "More information" });
    fireEvent.click(trigger);
    expect(screen.getByText("Body text")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByText("Body text")).toBeNull();
  });

  test("dims trigger when persona is 'experienced'", () => {
    notifyPersonaChanged("experienced");
    render(React.createElement(InfoTooltip, null, "x"));
    const trigger = screen.getByRole("button", { name: "More information" });
    expect(trigger.getAttribute("data-persona-dimmed")).toBe("true");
  });

  test("does NOT dim when persona is 'new'", () => {
    notifyPersonaChanged("new");
    render(React.createElement(InfoTooltip, null, "x"));
    const trigger = screen.getByRole("button", { name: "More information" });
    expect(trigger.getAttribute("data-persona-dimmed")).toBe("false");
  });

  test("alwaysShow forces full attention even for experienced persona", () => {
    notifyPersonaChanged("experienced");
    render(React.createElement(InfoTooltip, { alwaysShow: true }, "x"));
    const trigger = screen.getByRole("button", { name: "More information" });
    expect(trigger.getAttribute("data-persona-dimmed")).toBe("false");
  });
});

// ─── EmptyState ──────────────────────────────────────────────────────

describe("EmptyState", () => {
  test("renders title + body", () => {
    render(
      React.createElement(EmptyState, {
        icon: React.createElement("span", null, "🌱"),
        title: "No plants yet",
        body: "Your Shed is empty.",
      }),
    );
    expect(screen.getByText("No plants yet")).toBeTruthy();
    expect(screen.getByText("Your Shed is empty.")).toBeTruthy();
  });

  test("renders the primary CTA when provided + fires onClick", () => {
    const onClick = vi.fn();
    render(
      React.createElement(EmptyState, {
        icon: React.createElement("span", null, "🌱"),
        title: "Empty",
        primaryCta: { label: "Add a plant", onClick },
      }),
    );
    const btn = screen.getByRole("button", { name: "Add a plant" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("renders BOTH primary and secondary CTAs when provided", () => {
    render(
      React.createElement(EmptyState, {
        icon: React.createElement("span", null, "🌱"),
        title: "Empty",
        primaryCta: { label: "Add a plant", onClick: vi.fn() },
        secondaryCta: { label: "Scan a label", onClick: vi.fn() },
      }),
    );
    expect(screen.getByRole("button", { name: "Add a plant" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan a label" })).toBeTruthy();
  });

  test("renders no CTAs when none provided", () => {
    render(
      React.createElement(EmptyState, {
        icon: React.createElement("span", null, "🌱"),
        title: "Empty",
      }),
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// ─── SurfaceLoader ───────────────────────────────────────────────────

describe("SurfaceLoader", () => {
  test("renders a spinner with label", () => {
    render(
      React.createElement(SurfaceLoader, {
        shape: "spinner",
        label: "Searching the library…",
      }),
    );
    expect(screen.getByText("Searching the library…")).toBeTruthy();
    expect(screen.getByTestId("surface-loader-spinner")).toBeTruthy();
  });

  test("card-grid defaults to 3 skeleton cards", () => {
    const { container } = render(
      React.createElement(SurfaceLoader, { shape: "card-grid" }),
    );
    const grid = screen.getByTestId("surface-loader-card-grid");
    expect(grid.children).toHaveLength(3);
    // Pulse class present somewhere
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  test("card-grid respects custom count", () => {
    render(React.createElement(SurfaceLoader, { shape: "card-grid", count: 6 }));
    expect(screen.getByTestId("surface-loader-card-grid").children).toHaveLength(6);
  });

  test("list defaults to 5 rows", () => {
    render(React.createElement(SurfaceLoader, { shape: "list" }));
    expect(screen.getByTestId("surface-loader-list").children).toHaveLength(5);
  });

  test("form renders 4 field skeletons by default", () => {
    render(React.createElement(SurfaceLoader, { shape: "form" }));
    expect(screen.getByTestId("surface-loader-form").children).toHaveLength(4);
  });

  test("stats-strip renders 4 stat skeletons by default", () => {
    render(React.createElement(SurfaceLoader, { shape: "stats-strip" }));
    expect(screen.getByTestId("surface-loader-stats-strip").children).toHaveLength(4);
  });

  test("detail-page renders the hero + title block + content sections", () => {
    render(React.createElement(SurfaceLoader, { shape: "detail-page", count: 2 }));
    // Hero + title block + grid of content sections
    const root = screen.getByTestId("surface-loader-detail-page");
    expect(root).toBeTruthy();
  });
});
