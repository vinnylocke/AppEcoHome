import type { Page, Locator } from "@playwright/test";

export class ShedPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly noMatchState: Locator;
  readonly activeTab: Locator;
  readonly archivedTab: Locator;
  readonly inactiveChip: Locator;
  readonly addButton: Locator;
  readonly clearSearchButton: Locator;
  readonly sourceFilterSelect: Locator;

  // ── Add-to-Shed (BulkSearchModal → shared <PlantSearch>) ──────────────
  readonly bulkSearchInput: Locator;
  readonly bulkSearchExternalBtn: Locator;
  readonly bulkResultFirst: Locator;
  readonly bulkResultAddFirst: Locator;
  readonly bulkDetailModal: Locator;
  readonly bulkDetailClose: Locator;
  readonly bulkReviewBtn: Locator;
  readonly bulkStartImportBtn: Locator;

  // Plant edit modal — Light tab (opened from the tile's light icon)
  readonly modalLightTab: Locator;
  readonly lightTabContent: Locator;

  // Delete-with-instances choice modal
  readonly deleteWithInstancesModal: Locator;
  readonly deleteKeepEol: Locator;
  readonly deleteEverything: Locator;

  // Multi-select / bulk actions
  readonly selectModeBtn: Locator;
  readonly bulkActionBar: Locator;
  readonly bulkAssignBtn: Locator;
  readonly bulkDeleteBtn: Locator;
  readonly bulkDeleteModal: Locator;
  readonly bulkDeleteKeepEol: Locator;
  readonly bulkDeleteEverything: Locator;
  readonly bulkAssignModal: Locator;
  readonly bulkAssignNoArea: Locator;
  readonly bulkAssignConfirm: Locator;

  // Hub-level tabs + the view toggle local to TheShed
  readonly hubTabShed: Locator;
  readonly hubTabWatchlist: Locator;
  readonly hubTabSenescence: Locator;
  readonly viewToggle: Locator;
  readonly viewPlantsBtn: Locator;
  readonly viewNurseryBtn: Locator;

  // Cross-home favourites (Phase 1)
  readonly scopeToggle: Locator;
  readonly scopeHomeBtn: Locator;
  readonly scopeFavouritesBtn: Locator;
  readonly favouritesGrid: Locator;
  readonly favouritesHintBanner: Locator;
  readonly favouritesHintDismiss: Locator;
  readonly favouritesEmptyState: Locator;
  readonly hiddenCollectionHint: Locator;

  // Bulk add modal (RHO-4 — paste + CSV upload)
  readonly bulkAddButton: Locator;
  readonly bulkAddModal: Locator;
  readonly bulkAddModePaste: Locator;
  readonly bulkAddModeCsv: Locator;
  readonly csvTemplateDownload: Locator;
  readonly csvFileInput: Locator;
  readonly bulkAddSave: Locator;
  readonly bulkAddFavouriteAll: Locator;
  readonly bulkAddFileIssues: Locator;

  // Sort dropdown (aria-label only — no testid in source)
  readonly sortSelect: Locator;

  // Filters disclosure (Phase 4.3)
  readonly filtersButton: Locator;
  readonly filtersPanel: Locator;

  // Credit badge (any plant on the page)
  readonly anyCreditBadge: Locator;
  readonly creditPopover: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Plants" });
    this.searchInput = page.getByLabel("Search your saved plants");
    this.emptyState = page.getByText("No plants here");
    this.noMatchState = page.getByText("No matches found");
    // Hub v3 Stage C: the presence chips ("Active · n" etc.). ^-anchored so
    // "Active" never strict-clashes with "Inactive". archivedTab exists only
    // under the legacy filter flag (rhozly_legacy_shed_filters=on).
    this.activeTab = page.getByRole("tab", { name: /^Active/ });
    this.archivedTab = page.getByRole("tab", { name: "Archived" });
    this.inactiveChip = page.getByTestId("shed-chip-inactive");
    // Hub v3: the canonical opener is the search launcher (testid is the
    // Shepherd anchor + stable across viewports/labels).
    this.addButton = page.getByTestId("shed-add-plant-btn");
    this.clearSearchButton = page.getByLabel("Clear search");
    this.sourceFilterSelect = page.getByLabel("Filter by source");

    this.bulkSearchInput = page.locator('[data-testid="plant-search-input"]');
    this.bulkSearchExternalBtn = page.locator('[data-testid="plant-search-external"]');
    // Overlay result contract (Stage 1): the row BODY opens the detail modal;
    // the trailing `-add` button selects into the cart.
    this.bulkResultFirst = page.locator('[data-testid^="plant-search-result-"]:not([data-testid$="-info"]):not([data-testid$="-add"]):not([data-testid$="-other-names"])').first();
    this.bulkResultAddFirst = page.locator('[data-testid^="plant-search-result-"][data-testid$="-add"]').first();
    this.bulkDetailModal = page.locator('[data-testid="plant-detail-modal"]');
    this.bulkDetailClose = page.locator('[data-testid="plant-detail-close"]');
    this.bulkReviewBtn = page.locator('[data-testid="bulk-search-review"]');
    this.bulkStartImportBtn = page.locator('[data-testid="bulk-search-start-import"]');

    this.modalLightTab = page.locator('[data-testid="plant-modal-tab-light"]');
    this.lightTabContent = page.locator('[data-testid^="light-tab-"]').first();

    this.deleteWithInstancesModal = page.locator('[data-testid="delete-with-instances-modal"]');
    this.deleteKeepEol = page.locator('[data-testid="delete-keep-eol"]');
    this.deleteEverything = page.locator('[data-testid="delete-everything"]');

    this.selectModeBtn = page.locator('[data-testid="shed-select-mode-btn"]');
    this.bulkActionBar = page.locator('[data-testid="shed-bulk-action-bar"]');
    this.bulkAssignBtn = page.locator('[data-testid="shed-bulk-assign"]');
    this.bulkDeleteBtn = page.locator('[data-testid="shed-bulk-delete"]');
    this.bulkDeleteModal = page.locator('[data-testid="bulk-delete-modal"]');
    this.bulkDeleteKeepEol = page.locator('[data-testid="bulk-delete-keep-eol"]');
    this.bulkDeleteEverything = page.locator('[data-testid="bulk-delete-everything"]');
    this.bulkAssignModal = page.locator('[data-testid="bulk-assign-modal"]');
    this.bulkAssignNoArea = page.locator('[data-testid="bulk-assign-no-area"]');
    this.bulkAssignConfirm = page.locator('[data-testid="bulk-assign-confirm"]');

    this.hubTabShed = page.locator('[data-testid="garden-hub-tab-shed"]');
    this.hubTabWatchlist = page.locator('[data-testid="garden-hub-tab-watchlist"]');
    this.hubTabSenescence = page.locator('[data-testid="garden-hub-tab-senescence"]');
    // Stage 4: the Plants|Nursery toggle died — the Nursery is a hub tab.
    this.viewToggle = page.locator('[role="tablist"][aria-label="Garden sections"]');
    this.viewPlantsBtn = page.getByTestId("garden-hub-tab-shed");
    this.viewNurseryBtn = page.getByTestId("garden-hub-tab-nursery");

    this.scopeToggle = page.locator('[data-testid="shed-scope-toggle"]');
    this.scopeHomeBtn = page.locator('[data-testid="shed-scope-home"]');
    this.scopeFavouritesBtn = page.locator('[data-testid="shed-scope-favourites"]');
    this.favouritesGrid = page.locator('[data-testid="favourites-grid"]');
    this.favouritesHintBanner = page.locator('[data-testid="favourites-hint-banner"]');
    this.favouritesHintDismiss = page.locator('[data-testid="favourites-hint-dismiss"]');
    this.favouritesEmptyState = page.getByText("No favourites yet");
    // v3 feedback polish — the where-did-it-go safety net (visibility law).
    this.hiddenCollectionHint = page.locator('[data-testid="shed-hidden-collection-hint"]');

    this.bulkAddButton = page.locator('[data-testid="shed-bulk-paste-btn"]');
    this.bulkAddModal = page.locator('[data-testid="bulk-paste-plants-modal"]');
    this.bulkAddModePaste = page.locator('[data-testid="bulk-add-mode-paste"]');
    this.bulkAddModeCsv = page.locator('[data-testid="bulk-add-mode-csv"]');
    this.csvTemplateDownload = page.locator('[data-testid="csv-template-download"]');
    this.csvFileInput = page.locator('[data-testid="csv-file-input"]');
    this.bulkAddSave = page.locator('[data-testid="bulk-paste-save"]');
    this.bulkAddFavouriteAll = page.locator('[data-testid="bulk-add-favourite-all"]');
    this.bulkAddFileIssues = page.locator('[data-testid="bulk-add-file-issues"]');

    this.sortSelect = page.getByLabel("Sort plants");
    this.filtersButton = page.locator('[data-testid="shed-filters-btn"]');
    this.filtersPanel = page.locator('[data-testid="shed-filters-panel"]');

    this.anyCreditBadge = page.locator('[data-testid="image-credit-badge"]').first();
    this.creditPopover = page.locator('[data-testid="image-credit-popover"]');
  }

  /** Bulk-assign quantity stepper input for a specific plant id. */
  bulkAssignQty(plantId: string | number): Locator {
    return this.page.locator(`[data-testid="bulk-assign-qty-${plantId}"]`);
  }

  /** Multi-select checkbox area on the plant card (the card itself is clickable
   *  when select mode is on; the click toggles selection). */
  selectPlantCard(name: string): Locator {
    return this.plantCard(name);
  }

  /** The light-needs icon on a plant tile (opens the edit modal's Light tab). */
  lightButtonFor(name: string): Locator {
    return this.plantCard(name).locator('[data-testid^="plant-card-light-"]');
  }

  /** The favourite heart on a Home-tab plant card (matched by card heading). */
  heartFor(name: string): Locator {
    return this.plantCard(name).locator('[data-testid^="favourite-plant-"]');
  }

  /** The favourite heart for a specific plant id (avoids duplicate-name cards). */
  heartForId(plantId: string | number): Locator {
    return this.page.locator(`[data-testid="favourite-plant-${plantId}"]`);
  }

  /** v3 feedback #3 — the "N past" chip on a card, by plant id. */
  pastCountFor(plantId: string | number): Locator {
    return this.page.locator(`[data-testid="plant-past-count-${plantId}"]`);
  }

  /** A favourite card in the Favourites scope, matched by its heading. */
  favouriteCard(name: string): Locator {
    return this.favouritesGrid
      .locator('[data-testid^="favourite-card-"]')
      .filter({
        has: this.page.locator("h3").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }),
      });
  }

  favouriteAddToHomeIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-add-to-home-"]');
  }

  favouriteInHomeBadgeIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-in-home-"]');
  }

  favouriteRemoveIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-remove-"]');
  }

  favouriteTombstoneIn(card: Locator): Locator {
    return card.locator('[data-testid^="favourite-tombstone-"]');
  }

  async goto() {
    await this.page.goto("/shed");
  }

  async gotoFavourites() {
    await this.page.goto("/shed?scope=favourites");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  plantCard(name: string): Locator {
    // Match the plant card whose primary heading is `name`, not just any card
    // containing the word — otherwise descriptions or related fields cause
    // strict-mode violations when other plants mention the same word.
    return this.page
      .locator("[data-plant-card]")
      .filter({
        has: this.page.locator("h2, h3").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }),
      });
  }

  /** Open the Filters disclosure panel (Phase 4.3 — the source/sort selects
   *  and smart chips live inside it; their aria-labels are unchanged). */
  // Stage 3: Filters is a bottom SHEET (portal) — open it, use the controls,
  // then closeFilters() before asserting on the grid (the sheet covers it).
  async openFilters() {
    if (!(await this.filtersPanel.isVisible().catch(() => false))) {
      await this.filtersButton.click();
    }
    await this.filtersPanel.waitFor({ state: "visible", timeout: 5000 });
  }

  async closeFilters() {
    if (await this.filtersPanel.isVisible().catch(() => false)) {
      await this.page.getByTestId("shed-filters-done").click();
      await this.filtersPanel.waitFor({ state: "hidden", timeout: 5000 });
    }
  }

  /** Open the ⋯ overflow menu (Select mode / Garden layout / Bulk add). */
  async openOverflowMenu() {
    await this.page.getByTestId("shed-overflow-menu").click();
  }

  /** Open a plant card's kebab overflow menu (Phase 4.3 — layout / light /
   *  Ask AI / archive / delete live inside it; menu items keep their original
   *  aria-labels, so the *ButtonFor helpers below work once this has run). */
  async openCardMenu(name: string) {
    const kebab = this.plantCard(name).locator('[data-testid^="plant-card-kebab-"]');
    // The kebab is a toggle — clicking an already-open menu would close it,
    // so guard on aria-expanded like openFilters().
    if ((await kebab.getAttribute("aria-expanded")) !== "true") {
      await kebab.click();
    }
    await this.page
      .locator('[data-testid^="plant-card-menu-"]')
      .first()
      .waitFor({ state: "visible", timeout: 5000 });
  }

  archiveButtonFor(name: string): Locator {
    return this.page.getByLabel(`Archive ${name}`);
  }

  restoreButtonFor(name: string): Locator {
    return this.page.getByLabel(`Restore ${name}`);
  }

  deleteButtonFor(name: string): Locator {
    return this.page.getByLabel(`Delete ${name}`);
  }

  assignButtonFor(name: string): Locator {
    return this.plantCard(name).getByRole("button", { name: "Assign", exact: true });
  }

  // ── Bulk add modal helpers (RHO-4) ─────────────────────────────────────────
  /** Open the Bulk add modal — Stage 3: it lives in the ⋯ overflow menu. */
  async openBulkAdd() {
    await this.openOverflowMenu();
    await this.bulkAddButton.click();
    await this.bulkAddModal.waitFor({ state: "visible", timeout: 8000 });
  }

  /** A CSV review candidate card by index. */
  bulkAddCandidate(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-paste-candidate-${idx}"]`);
  }

  /** The per-row favourite checkbox in the review step. */
  bulkAddCandidateFavourite(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-paste-candidate-favourite-${idx}"]`);
  }

  /** The per-row error block (present only for invalid rows). */
  bulkAddCandidateErrors(idx: number): Locator {
    return this.page.locator(`[data-testid="bulk-paste-candidate-errors-${idx}"]`);
  }

  /** Upload a CSV into the file input by buffer (no fixture file on disk). */
  async uploadCsv(fileName: string, content: string) {
    await this.csvFileInput.setInputFiles({
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from(content, "utf-8"),
    });
  }
}
