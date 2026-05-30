import type { Page, Locator } from "@playwright/test";

export class ShedPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly noMatchState: Locator;
  readonly activeTab: Locator;
  readonly archivedTab: Locator;
  readonly addButton: Locator;
  readonly clearSearchButton: Locator;
  readonly sourceFilterSelect: Locator;

  // ── Add-to-Shed (BulkSearchModal → shared <PlantSearch>) ──────────────
  readonly bulkSearchInput: Locator;
  readonly bulkSearchExternalBtn: Locator;
  readonly bulkResultFirst: Locator;
  readonly bulkResultInfoFirst: Locator;
  readonly bulkPreviewPanel: Locator;
  readonly bulkFullCareBtn: Locator;
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

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Plants" });
    this.searchInput = page.getByLabel("Search your saved plants");
    this.emptyState = page.getByText("No plants here");
    this.noMatchState = page.getByText("No matches found");
    this.activeTab = page.getByRole("button", { name: "Active" });
    this.archivedTab = page.getByRole("button", { name: "Archived" });
    this.addButton = page.getByLabel("Find a plant");
    this.clearSearchButton = page.getByLabel("Clear search");
    this.sourceFilterSelect = page.getByLabel("Filter by source");

    this.bulkSearchInput = page.locator('[data-testid="plant-search-input"]');
    this.bulkSearchExternalBtn = page.locator('[data-testid="plant-search-external"]');
    this.bulkResultFirst = page.locator('[data-testid^="plant-search-result-"]:not([data-testid$="-info"])').first();
    this.bulkResultInfoFirst = page.locator('[data-testid^="plant-search-result-"][data-testid$="-info"]').first();
    this.bulkPreviewPanel = page.locator('[data-testid="plant-search-preview-panel"]').first();
    this.bulkFullCareBtn = page.locator('[data-testid^="plant-search-result-"][data-testid$="-full-care"]').first();
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
  }

  /** The light-needs icon on a plant tile (opens the edit modal's Light tab). */
  lightButtonFor(name: string): Locator {
    return this.plantCard(name).locator('[data-testid^="plant-card-light-"]');
  }

  async goto() {
    await this.page.goto("/shed");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  plantCard(name: string): Locator {
    return this.page.locator("[data-plant-card]").filter({ hasText: name });
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
}
