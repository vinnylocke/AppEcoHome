import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Stub the two heavy child surfaces — the hub's job is tab routing, not their
// internals. Each stub identifies which tab is mounted.
vi.mock("../../../src/components/GlobalJournal", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "stub-journal" }, "journal"),
}));
vi.mock("../../../src/components/notes/NotesPage", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "stub-notes" }, "notes"),
}));

import JournalNotesHub from "../../../src/components/JournalNotesHub";

function renderHub(initialEntry: string) {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      React.createElement(JournalNotesHub, { homeId: "home-1" }),
    ),
  );
}

describe("JournalNotesHub — Phase 5 Journal/Notes merge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("defaults to the Journal tab with no query param", () => {
    renderHub("/journal");
    expect(screen.getByTestId("stub-journal")).toBeTruthy();
    expect(screen.queryByTestId("stub-notes")).toBeNull();
    expect(screen.getByTestId("journal-notes-switch")).toBeTruthy();
  });

  test("renders the Notes tab when ?tab=notes", () => {
    renderHub("/journal?tab=notes");
    expect(screen.getByTestId("stub-notes")).toBeTruthy();
    expect(screen.queryByTestId("stub-journal")).toBeNull();
  });

  test("tapping the Notes tab swaps in the Notes surface", () => {
    renderHub("/journal");
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByTestId("stub-notes")).toBeTruthy();
    expect(screen.queryByTestId("stub-journal")).toBeNull();
  });

  test("tapping Journal returns from the Notes tab", () => {
    renderHub("/journal?tab=notes");
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    expect(screen.getByTestId("stub-journal")).toBeTruthy();
    expect(screen.queryByTestId("stub-notes")).toBeNull();
  });
});
