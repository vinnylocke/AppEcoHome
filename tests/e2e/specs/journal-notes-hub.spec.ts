import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

// Section — Journal/Notes hub (Phase 5 IA merge).
// /journal is now a tabbed hub (Journal | Notes). /notes redirects into it.

test.describe("Journal/Notes hub (Phase 5 merge)", () => {
  test("JNH-001: /journal shows the switch and defaults to the Journal tab", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/journal");

    const switcher = authenticatedPage.getByTestId("journal-notes-switch");
    await expect(switcher).toBeVisible({ timeout: 10000 });

    // Journal is the default tab; the Notes surface is not mounted.
    await expect(
      authenticatedPage.getByRole("tab", { name: "Journal" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(authenticatedPage.getByTestId("notes-page")).toHaveCount(0);
  });

  test("JNH-002: tapping the Notes tab swaps in Notes and updates the URL", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/journal");
    await authenticatedPage.getByRole("tab", { name: "Notes" }).click();

    await expect(authenticatedPage).toHaveURL(/\/journal\?tab=notes$/, {
      timeout: 8000,
    });
    await expect(authenticatedPage.getByTestId("notes-page")).toBeVisible({
      timeout: 10000,
    });
  });

  test("JNH-003: /notes redirects into the hub's Notes tab", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/notes");

    await expect(authenticatedPage).toHaveURL(/\/journal\?tab=notes$/, {
      timeout: 8000,
    });
    await expect(authenticatedPage.getByTestId("notes-page")).toBeVisible({
      timeout: 10000,
    });
  });
});
