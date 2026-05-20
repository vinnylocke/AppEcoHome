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

function renderHome() {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(QuickAccessHome, null),
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

  test("tapping Journal tile shows a toast and does NOT navigate", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("quick-tile-journal"));
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn.mock.calls[0][0]).toContain("Journal");
    expect(navigateMock).not.toHaveBeenCalled();
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
});
