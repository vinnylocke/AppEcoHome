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

// Mock TaskEngine — we only need to assert the prefetch call shape for the
// Today tile.
const { prefetchMock } = vi.hoisted(() => ({ prefetchMock: vi.fn() }));
vi.mock("../../../src/lib/taskEngine", () => ({
  TaskEngine: { prefetch: prefetchMock },
  getLocalDateString: (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
}));

import QuickAccessHome from "../../../src/components/QuickAccessHome";

function renderHome(props?: { firstName?: string | null; homeId?: string | null }) {
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
    prefetchMock.mockReset();
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

  // Wave 11 trimmed the hero to fit four tiles in one viewport — the logo
  // + wordmark brand stamp was dropped to free vertical space. The eyebrow
  // pill + greeting remain.
  test("greeting falls back to the generic copy when firstName is missing", () => {
    renderHome({ firstName: null });
    expect(screen.getByTestId("quick-access-hero-greeting").textContent).toBe(
      "What can I help with?",
    );
  });

  // Wave 13 — soft tinted launcher tiles. Accents map onto colours already
  // used elsewhere in the app: green (brand), amber (warmth), red
  // (notebook/urgent), blue (info/lookup).
  test("each tile receives its own signature launcher accent", () => {
    renderHome({ firstName: "Vinny" });
    expect(
      screen.getByTestId("quick-tile-lens").getAttribute("data-accent"),
    ).toBe("green");
    expect(
      screen.getByTestId("quick-tile-calendar").getAttribute("data-accent"),
    ).toBe("amber");
    expect(
      screen.getByTestId("quick-tile-journal").getAttribute("data-accent"),
    ).toBe("red");
    expect(
      screen.getByTestId("quick-tile-library").getAttribute("data-accent"),
    ).toBe("blue");
  });

  // ─── Phase 2 ─ Today tile prefetch ────────────────────────────────────

  test("tapping Today fires TaskEngine.prefetch with today's date before navigating", () => {
    renderHome({ firstName: "Vinny", homeId: "home-1" });
    fireEvent.click(screen.getByTestId("quick-tile-calendar"));

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    const args = prefetchMock.mock.calls[0][0];
    expect(args.homeId).toBe("home-1");
    expect(args.includeOverdue).toBe(true);
    // start + end + today should all be today's local YYYY-MM-DD.
    expect(args.startDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.startDateStr).toBe(args.endDateStr);
    expect(args.startDateStr).toBe(args.todayStr);

    // Navigation still happens.
    expect(navigateMock).toHaveBeenCalledWith("/quick/calendar");
  });

  test("Today tile tap skips the prefetch when homeId is absent", () => {
    renderHome({ firstName: "Vinny" });
    fireEvent.click(screen.getByTestId("quick-tile-calendar"));
    expect(prefetchMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/quick/calendar");
  });

  // ─── Wave 11 — fixed (non-scrolling) page wrapper ──────────────────────
  // The Quick Access screen is one viewport — `h-full overflow-hidden`
  // pins the contents so the four tiles always fit without scrolling. The
  // 2×2 grid below the hero is what makes that work.

  test("renders a fixed-height page wrapper (no scroll)", () => {
    renderHome({ firstName: "Vinny" });
    const page = screen.getByTestId("quick-access-page");
    expect(page).toBeTruthy();
    expect(page.className).toContain("h-full");
    expect(page.className).toContain("overflow-hidden");
  });

  // Wave 13 — tiles auto-size to their content (no grid-rows-2) so the
  // small launcher tiles don't have to stretch to fill the viewport.
  test("tiles render inside a 2-column grid", () => {
    renderHome({ firstName: "Vinny" });
    const grid = screen.getByTestId("quick-tiles-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("grid-cols-2");
    expect(screen.getByTestId("quick-tile-library")).toBeTruthy();
  });

  test("each tile uses the compact layout", () => {
    renderHome({ firstName: "Vinny" });
    for (const id of [
      "quick-tile-lens",
      "quick-tile-calendar",
      "quick-tile-journal",
      "quick-tile-library",
    ]) {
      expect(screen.getByTestId(id).getAttribute("data-layout")).toBe("compact");
    }
  });
});
