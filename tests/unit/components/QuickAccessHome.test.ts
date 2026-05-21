import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Mock navigate so we can assert routing intent.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

// Mock the hook so we can flip mobile/desktop per test.
const isMobileMock = vi.fn<() => boolean>(() => true);
vi.mock("../../../src/hooks/useIsMobile", () => ({
  useIsMobile: () => isMobileMock(),
}));

// Mock react-hot-toast to assert toast calls. Hoisted so it's defined
// before the mock factory runs.
const { toastFn } = vi.hoisted(() => ({ toastFn: vi.fn() }));
vi.mock("react-hot-toast", () => ({
  toast: Object.assign(toastFn, {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import QuickAccessHome from "../../../src/components/QuickAccessHome";

function renderHome(props?: { firstName?: string | null }) {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(QuickAccessHome, props ?? {}),
    ),
  );
}

describe("QuickAccessHome", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastFn.mockReset();
    isMobileMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders all three tiles", () => {
    renderHome();
    expect(screen.getByTestId("quick-tile-lens")).toBeTruthy();
    expect(screen.getByTestId("quick-tile-calendar")).toBeTruthy();
    expect(screen.getByTestId("quick-tile-journal")).toBeTruthy();
  });

  test("tapping Visual Lens navigates to /quick/lens", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("quick-tile-lens"));
    expect(navigateMock).toHaveBeenCalledWith("/quick/lens");
  });

  test("tapping Calendar tile navigates to /quick/calendar (live in Wave 3)", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("quick-tile-calendar"));
    expect(navigateMock).toHaveBeenCalledWith("/quick/calendar");
    expect(toastFn).not.toHaveBeenCalled();
  });

  test("tapping Journal tile navigates to /quick/journal (live in Wave 4)", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("quick-tile-journal"));
    expect(navigateMock).toHaveBeenCalledWith("/quick/journal");
    expect(toastFn).not.toHaveBeenCalled();
  });

  test("escape-hatch link navigates to /dashboard", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("quick-access-open-dashboard"));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  test("desktop preview banner appears when useIsMobile is false", () => {
    isMobileMock.mockReturnValue(false);
    renderHome();
    expect(screen.getByTestId("quick-access-desktop-banner")).toBeTruthy();
  });

  test("desktop preview banner is hidden on mobile", () => {
    isMobileMock.mockReturnValue(true);
    renderHome();
    expect(screen.queryByTestId("quick-access-desktop-banner")).toBeNull();
  });

  // ─── Wave 7 redesign ────────────────────────────────────────────────────

  test("falls back to generic greeting when firstName is null", () => {
    renderHome({ firstName: null });
    expect(screen.getByTestId("quick-access-hero-greeting").textContent).toBe(
      "What can I help with?",
    );
  });

  test("renders the personalised greeting when firstName is provided", () => {
    renderHome({ firstName: "Vinny" });
    const heading = screen.getByTestId("quick-access-hero-greeting");
    // Includes one of "Good morning" / "Good afternoon" / "Good evening" + "Vinny".
    expect(heading.textContent).toMatch(/Good (morning|afternoon|evening), Vinny/);
  });

  test("trims whitespace from firstName before greeting", () => {
    renderHome({ firstName: "  Marcus  " });
    expect(screen.getByTestId("quick-access-hero-greeting").textContent).toContain(
      "Marcus",
    );
    expect(
      screen.getByTestId("quick-access-hero-greeting").textContent,
    ).not.toContain("  ");
  });

  test("treats empty firstName as missing (falls back to generic copy)", () => {
    renderHome({ firstName: "   " });
    expect(screen.getByTestId("quick-access-hero-greeting").textContent).toBe(
      "What can I help with?",
    );
  });

  test("mounts the hero decoration (glow + sprout) for the redesigned landing", () => {
    renderHome({ firstName: "Vinny" });
    expect(screen.getByTestId("quick-access-hero-glow")).toBeTruthy();
    expect(screen.getByTestId("quick-access-hero-sprout")).toBeTruthy();
  });

  // ─── Wave 8 ─ green hero card + Rhozly brand stamp ─────────────────────

  test("renders the hero card wrapper (Wave 8)", () => {
    renderHome({ firstName: "Vinny" });
    expect(screen.getByTestId("quick-access-hero-card")).toBeTruthy();
  });

  test("renders the Rhozly logo + wordmark inside the hero", () => {
    renderHome({ firstName: "Vinny" });
    const brand = screen.getByTestId("quick-access-hero-brand");
    expect(brand).toBeTruthy();
    const logo = screen.getByTestId("quick-access-hero-logo") as HTMLImageElement;
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("alt")).toBe("Rhozly");
    expect(logo.getAttribute("src")).toContain("logo_small_rhozly");
    // Wordmark text lives inside the brand container
    expect(brand.textContent).toContain("Rhozly");
  });

  test("logo + greeting still render when firstName is missing", () => {
    renderHome({ firstName: null });
    expect(screen.getByTestId("quick-access-hero-logo")).toBeTruthy();
    expect(screen.getByTestId("quick-access-hero-greeting").textContent).toBe(
      "What can I help with?",
    );
  });

  test("each tile receives a distinct theme accent (primary / tertiary / container)", () => {
    renderHome({ firstName: "Vinny" });
    expect(
      screen.getByTestId("quick-tile-lens").getAttribute("data-accent"),
    ).toBe("primary");
    expect(
      screen.getByTestId("quick-tile-calendar").getAttribute("data-accent"),
    ).toBe("tertiary");
    expect(
      screen.getByTestId("quick-tile-journal").getAttribute("data-accent"),
    ).toBe("container");
  });

  // ─── Wave 9 ─ green page wash ───────────────────────────────────────────

  test("renders the full-bleed page wrapper with the green wash gradient", () => {
    renderHome({ firstName: "Vinny" });
    const page = screen.getByTestId("quick-access-page");
    expect(page).toBeTruthy();
    // Outer wrapper applies the gradient using the primary-container token.
    expect(page.className).toContain("from-rhozly-primary-container");
    expect(page.className).toContain("via-rhozly-bg");
  });
});
