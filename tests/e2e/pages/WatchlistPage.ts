import type { Page, Locator } from "@playwright/test";

export class WatchlistPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly addButton: Locator;
  readonly activeTab: Locator;
  readonly archivedTab: Locator;
  readonly emptyState: Locator;
  readonly noMatchState: Locator;

  // Type filter buttons (anchored to prevent substring match on card accessible names)
  readonly filterAll: Locator;
  readonly filterInvasive: Locator;
  readonly filterPests: Locator;
  readonly filterDiseases: Locator;

  // Add modal locators
  readonly addModalHeading: Locator;
  readonly manualModeTab: Locator;
  readonly aiModeTab: Locator;
  readonly aiSearchInput: Locator;
  readonly aiSearchButton: Locator;
  readonly nameInput: Locator;
  readonly typeSelect: Locator;
  readonly descriptionInput: Locator;
  readonly addToWatchlistButton: Locator;
  readonly cancelButton: Locator;

  // Detail modal — scoped to the panel so locators don't leak into the card grid
  readonly detailModal: Locator;
  readonly detailModalInfoTab: Locator;
  readonly detailModalPreventionTab: Locator;
  readonly detailModalRemedyTab: Locator;
  readonly detailModalCloseButton: Locator;
  readonly detailModalDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Watchlist" });
    this.addButton = page.getByRole("button", { name: "Add" }).first();
    this.activeTab = page.getByRole("button", { name: "Active" });
    this.archivedTab = page.getByRole("button", { name: "Archived" });
    this.emptyState = page.getByText(/Your watchlist is empty\.|No matching ailments\./);
    this.noMatchState = page.getByText("No matching ailments.");

    this.filterAll = page.getByRole("button", { name: /^All/ });
    this.filterInvasive = page.getByRole("button", { name: /^Invasive/ });
    this.filterPests = page.getByRole("button", { name: /^Pests/ });
    this.filterDiseases = page.getByRole("button", { name: /^Diseases/ });

    this.addModalHeading = page.getByText("Add to Watchlist").first();
    this.manualModeTab = page.getByRole("button", { name: /^Manual$/i });
    this.aiModeTab = page.getByRole("button", { name: /^AI$/i });
    this.aiSearchInput = page.getByPlaceholder(/rose pests|black spot|aphids/i);
    this.aiSearchButton = page.getByLabel("Search with AI");
    this.nameInput = page.getByLabel(/Name \*/i);
    this.typeSelect = page.getByLabel(/Type \*/i);
    this.descriptionInput = page.getByLabel(/Description/i);
    this.addToWatchlistButton = page.getByRole("button", { name: /Add to Watchlist/i });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });

    // Scope detail modal locators to the panel so they don't resolve against card buttons
    this.detailModal = page.locator('[data-testid="detail-modal"]');
    this.detailModalInfoTab = this.detailModal.getByRole("button", { name: /^Info$/i });
    this.detailModalPreventionTab = this.detailModal.getByRole("button", { name: /Prevention/i });
    this.detailModalRemedyTab = this.detailModal.getByRole("button", { name: /Remedy/i });
    this.detailModalCloseButton = this.detailModal.getByLabel("Close");
    this.detailModalDeleteButton = this.detailModal.getByLabel("Delete ailment");
  }

  async goto() {
    await this.page.goto("/watchlist");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  ailmentCard(name: string): Locator {
    // Cards are role="button" divs containing h3 with the ailment name
    return this.page
      .locator('[role="button"]')
      .filter({ has: this.page.getByRole("heading", { name, level: 3 }) });
  }

  archiveButtonFor(name: string): Locator {
    return this.ailmentCard(name).getByLabel("Archive ailment");
  }

  restoreButtonFor(name: string): Locator {
    return this.ailmentCard(name).getByLabel("Restore ailment");
  }

  deleteButtonFor(name: string): Locator {
    return this.ailmentCard(name).getByLabel("Delete ailment");
  }
}
