import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Mock router navigate.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

// Mock useIsMobile so we can drive the banner per test.
const isMobileMock = vi.fn<() => boolean>(() => true);
vi.mock("../../../src/hooks/useIsMobile", () => ({
  useIsMobile: () => isMobileMock(),
}));

// Mock the data hook.
const { hookState, hookFns } = vi.hoisted(() => ({
  hookState: {
    entries: [] as Array<{
      id: string;
      subject: string;
      description: string | null;
      image_url: string | null;
      created_at: string;
    }>,
    loading: false,
    error: null as string | null,
  },
  hookFns: {
    refresh: vi.fn(async () => {}),
    assign: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock("../../../src/hooks/useUnassignedJournals", () => ({
  useUnassignedJournals: () => ({
    entries: hookState.entries,
    loading: hookState.loading,
    error: hookState.error,
    ...hookFns,
  }),
}));

// Stub PhotoUploader so we can drive imageUrl via the onChange prop.
vi.mock("../../../src/components/PhotoUploader", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (url: string | null) => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "stub-photo-uploader", "data-value": value ?? "" },
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "stub-photo-uploader-set",
          onClick: () => onChange("https://example.com/photo.jpg"),
        },
        "set photo",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "stub-photo-uploader-clear",
          onClick: () => onChange(null),
        },
        "clear",
      ),
    ),
}));

// Stub the assign sheet so we can confirm it's mounted with the right props.
vi.mock("../../../src/components/quick/AssignToPlantSheet", () => ({
  default: ({
    entryId,
    onAssign,
    onClose,
  }: {
    entryId: string;
    onAssign: (entryId: string, inventoryItemId: string) => Promise<void>;
    onClose: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "stub-assign-sheet", "data-entry-id": entryId },
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "stub-assign-pick",
          onClick: async () => {
            await onAssign(entryId, "inv-99");
          },
        },
        "pick",
      ),
      React.createElement(
        "button",
        { type: "button", "data-testid": "stub-assign-close", onClick: onClose },
        "close",
      ),
    ),
}));

// Mock supabase insert.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: {
    inserts: [] as Array<Record<string, unknown>>,
    forceError: null as string | null,
  },
}));

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (supabaseState.forceError) {
          return Promise.resolve({ error: { message: supabaseState.forceError } });
        }
        supabaseState.inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

vi.mock("../../../src/lib/errorHandler", () => ({
  Logger: { error: vi.fn() },
}));

vi.mock("../../../src/events/registry", () => ({
  EVENT: { JOURNAL_ENTRY_ADDED: "JOURNAL_ENTRY_ADDED" },
  logEvent: vi.fn(),
}));

const { toastFn, toastErrorFn, toastSuccessFn } = vi.hoisted(() => ({
  toastFn: vi.fn(),
  toastErrorFn: vi.fn(),
  toastSuccessFn: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(toastFn, {
    error: toastErrorFn,
    success: toastSuccessFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  toast: Object.assign(toastFn, {
    error: toastErrorFn,
    success: toastSuccessFn,
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import QuickCapture from "../../../src/components/quick/QuickCapture";

beforeEach(() => {
  navigateMock.mockReset();
  isMobileMock.mockReset();
  isMobileMock.mockReturnValue(true);
  hookState.entries = [];
  hookState.loading = false;
  hookState.error = null;
  hookFns.refresh.mockReset();
  hookFns.assign.mockReset();
  hookFns.remove.mockReset();
  supabaseState.inserts.length = 0;
  supabaseState.forceError = null;
  toastFn.mockReset();
  toastErrorFn.mockReset();
  toastSuccessFn.mockReset();
});

function renderScreen() {
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(QuickCapture, { homeId: "home-1" }),
    ),
  );
}

describe("QuickCapture", () => {
  test("Save is disabled when both photo and description are empty", () => {
    renderScreen();
    expect(
      (screen.getByTestId("quick-capture-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("Save enables with description only and triggers insert + refresh", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("quick-capture-description"), {
      target: { value: "Yellow leaves on the south side" },
    });
    const btn = screen.getByTestId("quick-capture-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => expect(supabaseState.inserts.length).toBe(1));
    const row = supabaseState.inserts[0];
    expect(row.home_id).toBe("home-1");
    expect(row.inventory_item_id).toBeNull();
    expect(row.description).toBe("Yellow leaves on the south side");
    expect(row.image_url).toBeNull();
    expect(String(row.subject)).toMatch(/Capture · /);
    expect(hookFns.refresh).toHaveBeenCalled();
    expect(toastSuccessFn).toHaveBeenCalledWith("Saved to your captures");
  });

  test("Save enables with photo only (no description)", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("stub-photo-uploader-set"));
    const btn = screen.getByTestId("quick-capture-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => expect(supabaseState.inserts.length).toBe(1));
    const row = supabaseState.inserts[0];
    expect(row.image_url).toBe("https://example.com/photo.jpg");
    expect(row.description).toBeNull();
  });

  test("Save clears the composer after success", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("quick-capture-description"), {
      target: { value: "note" },
    });
    fireEvent.click(screen.getByTestId("stub-photo-uploader-set"));
    fireEvent.click(screen.getByTestId("quick-capture-save"));

    await waitFor(() => expect(supabaseState.inserts.length).toBe(1));
    expect(
      (screen.getByTestId("quick-capture-description") as HTMLTextAreaElement)
        .value,
    ).toBe("");
    expect(
      screen.getByTestId("stub-photo-uploader").getAttribute("data-value"),
    ).toBe("");
  });

  test("renders empty state when no recent captures", () => {
    renderScreen();
    expect(screen.getByTestId("quick-capture-empty")).toBeTruthy();
  });

  test("renders recent captures list with assign + delete affordances", () => {
    hookState.entries = [
      {
        id: "j1",
        subject: "Capture · 18 May, 09:00",
        description: "Yellow spots",
        image_url: null,
        created_at: "2026-05-18T09:00:00Z",
      },
    ];
    renderScreen();
    expect(screen.getByTestId("quick-capture-entry-j1")).toBeTruthy();
    expect(screen.getByTestId("quick-capture-assign-j1")).toBeTruthy();
    expect(screen.getByTestId("quick-capture-delete-j1")).toBeTruthy();
  });

  test("Assign button opens the sheet and clicking pick assigns", async () => {
    hookState.entries = [
      {
        id: "j1",
        subject: "Capture · 18 May",
        description: null,
        image_url: null,
        created_at: "2026-05-18T09:00:00Z",
      },
    ];
    renderScreen();
    fireEvent.click(screen.getByTestId("quick-capture-assign-j1"));
    expect(screen.getByTestId("stub-assign-sheet")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stub-assign-pick"));
    await waitFor(() => expect(hookFns.assign).toHaveBeenCalledWith("j1", "inv-99"));
  });

  test("Delete button opens confirm; confirming removes the entry", async () => {
    hookState.entries = [
      {
        id: "j1",
        subject: "Capture · 18 May",
        description: null,
        image_url: null,
        created_at: "2026-05-18T09:00:00Z",
      },
    ];
    renderScreen();
    fireEvent.click(screen.getByTestId("quick-capture-delete-j1"));
    expect(screen.getByTestId("quick-capture-delete-confirm")).toBeTruthy();
    fireEvent.click(screen.getByTestId("quick-capture-delete-confirm-btn"));
    await waitFor(() => expect(hookFns.remove).toHaveBeenCalledWith("j1"));
  });

  test("Desktop banner renders when useIsMobile is false", () => {
    isMobileMock.mockReturnValue(false);
    renderScreen();
    expect(screen.getByTestId("quick-capture-desktop-banner")).toBeTruthy();
  });

  test("Desktop banner is hidden on mobile", () => {
    isMobileMock.mockReturnValue(true);
    renderScreen();
    expect(screen.queryByTestId("quick-capture-desktop-banner")).toBeNull();
  });

  test("back button routes to /quick", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("quick-capture-back"));
    expect(navigateMock).toHaveBeenCalledWith("/quick");
  });

  test("save shows toast on insert error", async () => {
    supabaseState.forceError = "RLS denied";
    renderScreen();
    fireEvent.change(screen.getByTestId("quick-capture-description"), {
      target: { value: "test" },
    });
    fireEvent.click(screen.getByTestId("quick-capture-save"));
    await waitFor(() => expect(toastErrorFn).toHaveBeenCalled());
    expect(hookFns.refresh).not.toHaveBeenCalled();
  });
});
