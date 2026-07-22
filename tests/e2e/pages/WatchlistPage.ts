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
  readonly detailModalCloseButton: Locator;
  readonly detailModalDeleteButton: Locator;

  // Cross-home favourites (Phase 2)
  readonly scopeToggle: Locator;
  readonly scopeHomeBtn: Locator;
  readonly scopeFavouritesBtn: Locator;
  readonly favouritesGrid: Locator;
  readonly favouritesHintBanner: Locator;
  readonly favouritesHintDismiss: Locator;

  // Bulk add modal (RHO-4 Phase 2 — paste + CSV upload)
  readonly bulkAddButton: Locator;
  readonly bulkAddModal: Locator;
  readonly bulkAddModePaste: Locator;
  readonly bulkAddModeCsv: Locator;
  readonly bulkAddTextarea: Locator;
  readonly bulkAddParse: Locator;
  readonly csvTemplateDownload: Locator;
  readonly csvFileInput: Locator;
  readonly bulkAddSave: Locator;
  readonly bulkAddFavouriteAll: Locator;
  readonly bulkAddFileIssues: Locator;

  constructor(page: Page) {
    this.page = page;
    // Batch-1 HubHeader diet renamed the page h1 to just "Watchlist", and
    // the count badge renders INSIDE the heading (accessible name
    // "Watchlist6") — anchored prefix matches both loading and loaded
    // states without colliding with "Your watchlist is empty.".
    this.heading = page.getByRole("heading", { name: /^Watchlist/ });
    // Primary CTA — renamed "Add" → "Find an ailment" to parallel the Shed's
    // "Find a plant". Target by testid so the label can evolve.
    this.addButton = page.locator('[data-testid="watchlist-add-btn"]');
    // Hub v3 Stage C: chips carry role="tab" (both the derived axis and the
    // legacy fallback). ^-anchored so "Active" never clashes with "Inactive".
    this.activeTab = page.getByRole("tab", { name: /^Active/ });
    this.archivedTab = page.getByRole("tab", { name: "Archived" });
    this.emptyState = page.getByText(/Your watchlist is empty\.|No matching ailments\./);
    this.noMatchState = page.getByText("No matching ailments.");

    this.filterAll = page.getByRole("button", { name: /^All/ });
    this.filterInvasive = page.getByRole("button", { name: /^Invasive/ });
    this.filterPests = page.getByRole("button", { name: /^Pests/ });
    this.filterDiseases = page.getByRole("button", { name: /^Diseases/ });

    // Stage 2 overlay: the takeover is input-first (no "Add to Watchlist"
    // title) — the pinned search input IS the takeover's identity.
    this.addModalHeading = page.locator('[data-testid="ailment-search-input"]');
    // Stage-2 overlay gave the mode toggles role="tab" — target testids.
    this.manualModeTab = page.getByTestId("ailment-tab-manual");
    // The AI tier is the escalation row now (appears only after a query
    // exhausts the library) — WL-012/013 self-skip while it's hidden.
    this.aiModeTab = page.getByTestId("ailment-search-ai");
    this.aiSearchInput = page.getByPlaceholder(/rose pests|black spot|aphids/i);
    this.aiSearchButton = page.getByLabel("Search with AI");
    this.nameInput = page.getByLabel(/Name \*/i);
    this.typeSelect = page.getByLabel(/Type \*/i);
    this.descriptionInput = page.getByLabel(/Description/i);
    this.addToWatchlistButton = page.getByRole("button", { name: /Add to Watchlist/i });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });

    // Scope detail modal locators to the panel so they don't resolve against card buttons
    this.detailModal = page.locator('[data-testid="detail-modal"]');
    // Stage F unified shell: the back arrow carries aria-label "Close";
    // Delete keeps aria-label "Delete ailment". Both live in the shell chrome.
    this.detailModalCloseButton = this.detailModal.getByLabel("Close");
    this.detailModalDeleteButton = this.detailModal.getByLabel("Delete ailment");

    this.scopeToggle = page.locator('[data-testid="watchlist-scope-toggle"]');
    this.scopeHomeBtn = page.locator('[data-testid="watchlist-scope-home"]');
    this.scopeFavouritesBtn = page.locator('[data-testid="watchlist-scope-favourites"]');
    this.favouritesGrid = page.locator('[data-testid="watchlist-favourites-grid"]');
    this.favouritesHintBanner = page.locator('[data-testid="watchlist-favourites-hint-banner"]');
    this.favouritesHintDismiss = page.locator('[data-testid="watchlist-favourites-hint-dismiss"]');

    this.bulkAddButton = page.locator('[data-testid="watchlist-bulk-add-btn"]');
    this.bulkAddModal = page.locator('[data-testid="bulk-add-ailments-modal"]');
    this.bulkAddModePaste = page.locator('[data-testid="bulk-ailment-mode-paste"]');
    this.bulkAddModeCsv = page.locator('[data-testid="bulk-ailment-mode-csv"]');
    this.bulkAddTextarea = page.locator('[data-testid="bulk-ailment-textarea"]');
    this.bulkAddParse = page.locator('[data-testid="bulk-ailment-parse"]');
    this.csvTemplateDownload = page.locator('[data-testid="csv-template-download"]');
    this.csvFileInput = page.locator('[data-testid="csv-file-input"]');
    this.bulkAddSave = page.locator('[data-testid="bulk-ailment-save"]');
    this.bulkAddFavouriteAll = page.locator('[data-testid="bulk-ailment-favourite-all"]');
    this.bulkAddFileIssues = page.locator('[data-testid="bulk-ailment-file-issues"]');
  }

  // ── Bulk add modal helpers (RHO-4 Phase 2) ─────────────────────────────────
  /** Open the Bulk add modal — Stage 3: it lives in the ⋯ overflow menu. */
  async openBulkAdd() {
    await this.page.getByTestId("watchlist-overflow-menu").click();
    await this.bulkAddButton.click();
    await this.bulkAddModal.waitFor({ state: "visible", timeout: 8000 });
  }

  /** A review candidate card by index. */
  bulkAddCandidate(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-ailment-candidate-${idx}"]`);
  }

  /** The per-row favourite checkbox in the review step. */
  bulkAddCandidateFavourite(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-ailment-candidate-favourite-${idx}"]`);
  }

  /** The per-row error block (present only for invalid rows). */
  bulkAddCandidateErrors(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-ailment-candidate-errors-${idx}"]`);
  }

  /** Upload a CSV into the file input by buffer (no fixture file on disk). */
  async uploadCsv(fileName: string, content: string) {
    await this.csvFileInput.setInputFiles({
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from(content, "utf-8"),
    });
  }

  async goto() {
    await this.page.goto("/watchlist");
  }

  /** Land directly on the Favourites scope (deep link). */
  async gotoFavourites() {
    await this.page.goto("/shed?tab=watchlist&scope=favourites");
  }

  /** The favourite heart on a Home-tab ailment card (matched by name). */
  heartFor(name: string): Locator {
    return this.ailmentCard(name).locator('[data-testid^="favourite-ailment-"]');
  }

  /** A favourite card in the Favourites scope, matched by its heading. */
  favouriteCard(name: string): Locator {
    return this.favouritesGrid
      .locator('[data-testid^="favourite-ailment-card-"]')
      .filter({
        has: this.page.locator("h3").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }),
      });
  }

  favouriteAddToHomeIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-ailment-add-to-home-"]');
  }

  favouriteInHomeBadgeIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-ailment-in-home-"]');
  }

  favouriteRemoveIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-ailment-remove-"]');
  }

  favouriteTombstoneIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-ailment-tombstone-"]');
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
