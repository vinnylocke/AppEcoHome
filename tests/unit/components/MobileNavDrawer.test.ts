import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import MobileNavDrawer, {
  type MobileNavLink,
} from "../../../src/components/MobileNavDrawer";

const NAV_LINKS: MobileNavLink[] = [
  {
    id: "quick",
    icon: React.createElement("span", { "data-testid": "icon-quick" }, "Z"),
    label: "Quick",
    matchPaths: ["/quick"],
  },
  {
    id: "dashboard",
    icon: React.createElement("span", null, "D"),
    label: "Dashboard",
    matchPaths: ["/dashboard"],
    badge: 3,
    badgeTone: "rose",
  },
  {
    id: "shed",
    icon: React.createElement("span", null, "S"),
    label: "Plants",
    matchPaths: ["/shed", "/watchlist"],
  },
];

const TAB_URL: Record<string, string> = {
  quick: "/quick",
  dashboard: "/dashboard",
  shed: "/shed",
};

const handlers = {
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  onOpenHelp: vi.fn(),
  onOpenPrivacy: vi.fn(),
  onOpenCookies: vi.fn(),
  onVersionClick: vi.fn(),
};

beforeEach(() => {
  Object.values(handlers).forEach((h) => h.mockReset());
});

function renderDrawer(
  overrides?: Partial<React.ComponentProps<typeof MobileNavDrawer>>,
) {
  return render(
    React.createElement(MobileNavDrawer, {
      open: true,
      navLinks: NAV_LINKS,
      activePath: "/quick",
      onClose: handlers.onClose,
      onNavigate: handlers.onNavigate,
      pathFor: (id: string) => TAB_URL[id] ?? "/",
      onOpenHelp: handlers.onOpenHelp,
      onOpenPrivacy: handlers.onOpenPrivacy,
      onOpenCookies: handlers.onOpenCookies,
      appVersion: "1.2.3",
      onVersionClick: handlers.onVersionClick,
      ...overrides,
    }),
  );
}

describe("MobileNavDrawer", () => {
  test("renders nothing when open is false", () => {
    renderDrawer({ open: false });
    expect(screen.queryByTestId("mobile-nav-drawer")).toBeNull();
  });

  test("renders all nav links when open", () => {
    renderDrawer();
    expect(screen.getByText("Quick")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Plants")).toBeTruthy();
  });

  test("clicking the backdrop fires onClose only", () => {
    renderDrawer();
    fireEvent.click(screen.getByTestId("mobile-nav-drawer-backdrop"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onNavigate).not.toHaveBeenCalled();
  });

  test("clicking the close × button fires onClose", () => {
    renderDrawer();
    fireEvent.click(screen.getByTestId("mobile-nav-drawer-close"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape key fires onClose", () => {
    renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking a nav link fires onNavigate with the destination path", () => {
    renderDrawer();
    fireEvent.click(screen.getByText("Plants"));
    expect(handlers.onNavigate).toHaveBeenCalledWith("/shed");
  });

  test("Help / Privacy / Cookies buttons call onClose first, then their handler", () => {
    renderDrawer();
    fireEvent.click(screen.getByText("Help Center"));
    expect(handlers.onClose).toHaveBeenCalled();
    expect(handlers.onOpenHelp).toHaveBeenCalled();

    handlers.onClose.mockReset();
    fireEvent.click(screen.getByTestId("mobile-nav-drawer-privacy"));
    expect(handlers.onClose).toHaveBeenCalled();
    expect(handlers.onOpenPrivacy).toHaveBeenCalled();

    handlers.onClose.mockReset();
    fireEvent.click(screen.getByTestId("mobile-nav-drawer-cookies"));
    expect(handlers.onClose).toHaveBeenCalled();
    expect(handlers.onOpenCookies).toHaveBeenCalled();
  });

  test("version button is rendered and opens release notes when onVersionClick is set", () => {
    renderDrawer();
    const versionBtn = screen.getByTestId("mobile-nav-drawer-version");
    expect(versionBtn.textContent).toContain("1.2.3");
    fireEvent.click(versionBtn);
    expect(handlers.onClose).toHaveBeenCalled();
    expect(handlers.onVersionClick).toHaveBeenCalled();
  });
});
