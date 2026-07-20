// AddLocationSheet (stats+locations redesign Stage 4b) — the inline add-location
// modal on the home garden grid. These tests pin the DEFENSE-IN-DEPTH permission
// re-check: even if a trigger opens the sheet ungated, handleSave must refuse to
// create for a caller without `locations.create` (a repointed empty-garden CTA
// once opened it ungated — review finding). RLS gates only home membership, so
// this client check is the sole guard.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const { canMock, createLocationMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  canMock: vi.fn(),
  createLocationMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

// ModalShell → passthrough so the form renders in jsdom when open.
vi.mock("../../../src/components/ui/ModalShell", () => ({
  ModalShell: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? React.createElement("div", null, children) : null,
}));
vi.mock("../../../src/context/HomePermissionsContext", () => ({
  usePermissions: () => ({ can: canMock }),
}));
vi.mock("../../../src/lib/locationMutations", () => ({
  createLocation: createLocationMock,
}));
vi.mock("../../../src/events/registry", () => ({
  logEvent: vi.fn(),
  EVENT: { LOCATION_CREATED: "location_created" },
}));
vi.mock("../../../src/lib/errorHandler", () => ({ Logger: { error: vi.fn() } }));
vi.mock("react-hot-toast", () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}));

import AddLocationSheet from "../../../src/components/home/AddLocationSheet";

function renderSheet(overrides: Partial<React.ComponentProps<typeof AddLocationSheet>> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    React.createElement(AddLocationSheet, {
      isOpen: true,
      onClose,
      homeId: "home-1",
      onCreated,
      ...overrides,
    }),
  );
  return { onCreated, onClose };
}

beforeEach(() => {
  canMock.mockReset();
  createLocationMock.mockReset().mockResolvedValue({ error: null });
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("AddLocationSheet — permission re-check (security)", () => {
  test("a caller WITHOUT locations.create cannot create — save is blocked, no DB call", async () => {
    canMock.mockReturnValue(false);
    const { onCreated } = renderSheet();

    fireEvent.change(screen.getByTestId("home-add-location-name-input"), {
      target: { value: "Sneaky Bed" },
    });
    fireEvent.click(screen.getByTestId("home-add-location-save"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(createLocationMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test("a caller WITH locations.create creates the location and calls onCreated", async () => {
    canMock.mockReturnValue(true);
    const { onCreated } = renderSheet();

    fireEvent.change(screen.getByTestId("home-add-location-name-input"), {
      target: { value: "Back Garden" },
    });
    fireEvent.click(screen.getByTestId("home-add-location-save"));

    await waitFor(() => expect(createLocationMock).toHaveBeenCalledTimes(1));
    expect(createLocationMock).toHaveBeenCalledWith({ name: "Back Garden", isOutside: false, homeId: "home-1" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  test("an empty name is rejected before any DB call even when permitted", async () => {
    canMock.mockReturnValue(true);
    renderSheet();

    fireEvent.click(screen.getByTestId("home-add-location-save"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(createLocationMock).not.toHaveBeenCalled();
  });
});
