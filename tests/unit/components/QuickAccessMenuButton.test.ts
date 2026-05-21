import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// The project's test env has a partial localStorage stub. Replace it with a
// real in-memory implementation for these tests so getItem/setItem work.
const memStore: Record<string, string> = {};
const memLocalStorage = {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => {
    memStore[k] = v;
  },
  removeItem: (k: string) => {
    delete memStore[k];
  },
  clear: () => {
    for (const k of Object.keys(memStore)) delete memStore[k];
  },
  key: () => null,
  get length() {
    return Object.keys(memStore).length;
  },
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memLocalStorage,
});

import QuickAccessMenuButton from "../../../src/components/QuickAccessMenuButton";

const onClickMock = vi.fn();

beforeEach(() => {
  onClickMock.mockReset();
  memLocalStorage.clear();
});

function renderButton() {
  return render(
    React.createElement(QuickAccessMenuButton, { onClick: onClickMock }),
  );
}

describe("QuickAccessMenuButton", () => {
  test("first-visit shows the 'Menu' label", () => {
    renderButton();
    expect(screen.getByTestId("quick-access-menu-button-label")).toBeTruthy();
    expect(screen.getByTestId("quick-access-menu-button-label").textContent).toBe(
      "Menu",
    );
  });

  test("returning visitor (flag set) does NOT show the label", () => {
    window.localStorage.setItem("rhozly_quick_menu_seen", "true");
    renderButton();
    expect(screen.queryByTestId("quick-access-menu-button-label")).toBeNull();
  });

  test("clicking the button fires onClick", () => {
    renderButton();
    fireEvent.click(screen.getByTestId("quick-access-menu-button"));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  test("clicking the button (first-visit) persists the seen flag and hides the label", () => {
    renderButton();
    expect(screen.getByTestId("quick-access-menu-button-label")).toBeTruthy();
    fireEvent.click(screen.getByTestId("quick-access-menu-button"));
    expect(window.localStorage.getItem("rhozly_quick_menu_seen")).toBe("true");
    expect(screen.queryByTestId("quick-access-menu-button-label")).toBeNull();
  });

  test("aria-label is present for screen readers", () => {
    renderButton();
    const btn = screen.getByTestId("quick-access-menu-button");
    expect(btn.getAttribute("aria-label")).toBe("Open navigation menu");
  });
});
