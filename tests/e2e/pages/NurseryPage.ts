import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Nursery surface — mounts inside `TheShed` when
 * the user flips the Plants / Nursery view toggle. Exposes the tab,
 * add/scan/paste modals, packet detail, log-sowing / observe / plant-out
 * flows + the bulk-paste modal.
 *
 * Used by `nursery-lifecycle.spec.ts` (NURSERY-001..052).
 */
export class NurseryPage {
  readonly page: Page;

  // Shed view toggle (shared with ShedPage but duplicated here for spec ergonomics).
  readonly shedViewPlantsBtn: Locator;
  readonly shedViewNurseryBtn: Locator;

  // Nursery tab
  readonly nurseryTab: Locator;
  readonly nurseryList: Locator;
  readonly nurseryEmpty: Locator;
  readonly nurseryAddEmpty: Locator;
  readonly nurseryAddPackets: Locator;
  readonly nurseryPasteEmpty: Locator;
  readonly nurseryPastePackets: Locator;

  // Add Seed Packet modal
  readonly addPacketModal: Locator;
  readonly addPacketShedSearch: Locator;
  readonly addPacketShedList: Locator;
  readonly addPacketFreetextToggle: Locator;
  readonly addPacketFreetextName: Locator;
  readonly addPacketNext: Locator;
  readonly addPacketSave: Locator;
  readonly packetVarietyInput: Locator;
  readonly packetVendorInput: Locator;
  readonly packetSowByInput: Locator;

  // Seed Packet Detail modal
  readonly packetDetailModal: Locator;
  readonly packetDetailTitle: Locator;
  readonly packetDetailLogSowing: Locator;
  readonly packetDetailSowings: Locator;
  readonly packetDetailEdit: Locator;
  readonly packetDetailArchive: Locator;

  // Log Sowing modal
  readonly logSowingModal: Locator;
  readonly logSowingDate: Locator;
  readonly logSowingCount: Locator;
  readonly logSowingNotes: Locator;
  readonly logSowingSave: Locator;

  // Observe Germination modal
  readonly observeModal: Locator;
  readonly observeInput: Locator;
  readonly observeSave: Locator;

  // Plant Out modal
  readonly plantOutModal: Locator;
  readonly plantOutLocation: Locator;
  readonly plantOutArea: Locator;
  readonly plantOutQuantity: Locator;
  readonly plantOutPlantedAt: Locator;
  readonly plantOutSave: Locator;

  // Bulk Paste / Add modal (RHO-4 Phase 3 — CSV mode added)
  readonly bulkPasteModal: Locator;
  readonly bulkPasteTextarea: Locator;
  readonly bulkPasteParse: Locator;
  readonly bulkPasteSave: Locator;
  readonly bulkPasteModePaste: Locator;
  readonly bulkPasteModeCsv: Locator;
  readonly csvTemplateDownload: Locator;
  readonly csvFileInput: Locator;
  readonly bulkPasteFavouriteAll: Locator;
  readonly bulkPasteFileIssues: Locator;

  // Nursery packet picker (in AddTaskModal)
  readonly nurseryPacketPicker: Locator;
  readonly nurseryPacketPickerSelect: Locator;

  // Care Guide tab pill
  readonly careGuideNurseryPackets: Locator;

  // Shopping refill banner
  readonly seedRefillBanner: Locator;
  readonly seedRefillBannerAdd: Locator;

  // Cross-home favourites (Phase 3 — component-state scope pill, no URL param)
  readonly scopeToggle: Locator;
  readonly scopeHomeBtn: Locator;
  readonly scopeFavouritesBtn: Locator;
  readonly favouritesGrid: Locator;
  readonly favouritesHintBanner: Locator;
  readonly favouritesHintDismiss: Locator;

  constructor(page: Page) {
    this.page = page;

    this.shedViewPlantsBtn = page.getByTestId("shed-view-plants");
    this.shedViewNurseryBtn = page.getByTestId("shed-view-nursery");

    this.nurseryTab = page.getByTestId("nursery-tab");
    this.nurseryList = page.getByTestId("nursery-list");
    this.nurseryEmpty = page.getByTestId("nursery-empty");
    this.nurseryAddEmpty = page.getByTestId("nursery-add-empty");
    this.nurseryAddPackets = page.getByTestId("nursery-add-packets");
    this.nurseryPasteEmpty = page.getByTestId("nursery-paste-empty");
    this.nurseryPastePackets = page.getByTestId("nursery-paste-packets");

    this.addPacketModal = page.getByTestId("add-seed-packet-modal");
    this.addPacketShedSearch = page.getByTestId("add-seed-packet-shed-search");
    this.addPacketShedList = page.getByTestId("add-seed-packet-shed-list");
    this.addPacketFreetextToggle = page.getByTestId("add-seed-packet-freetext-toggle");
    this.addPacketFreetextName = page.getByTestId("add-seed-packet-freetext-name");
    this.addPacketNext = page.getByTestId("add-seed-packet-next");
    this.addPacketSave = page.getByTestId("add-seed-packet-save");
    // Inputs live inside the testid-wrapper rows from _packetForm.tsx.
    this.packetVarietyInput = page.getByTestId("packet-variety").locator("input");
    this.packetVendorInput = page.getByTestId("packet-vendor").locator("input");
    this.packetSowByInput = page.getByTestId("packet-sow-by").locator("input");

    this.packetDetailModal = page.getByTestId("seed-packet-detail-modal");
    this.packetDetailTitle = page.getByTestId("packet-detail-title");
    this.packetDetailLogSowing = page.getByTestId("packet-detail-log-sowing");
    this.packetDetailSowings = page.getByTestId("packet-detail-sowings");
    this.packetDetailEdit = page.getByTestId("packet-detail-edit");
    this.packetDetailArchive = page.getByTestId("packet-detail-archive");

    this.logSowingModal = page.getByTestId("log-sowing-modal");
    this.logSowingDate = page.getByTestId("log-sowing-date").locator("input");
    this.logSowingCount = page.getByTestId("log-sowing-count").locator("input");
    this.logSowingNotes = page.getByTestId("log-sowing-notes").locator("textarea");
    this.logSowingSave = page.getByTestId("log-sowing-save");

    this.observeModal = page.getByTestId("observe-germination-modal");
    this.observeInput = page.getByTestId("observe-input");
    this.observeSave = page.getByTestId("observe-save");

    this.plantOutModal = page.getByTestId("plant-out-sowing-modal");
    this.plantOutLocation = page.getByTestId("plant-out-location");
    this.plantOutArea = page.getByTestId("plant-out-area");
    this.plantOutQuantity = page.getByTestId("plant-out-quantity");
    this.plantOutPlantedAt = page.getByTestId("plant-out-planted-at");
    this.plantOutSave = page.getByTestId("plant-out-save");

    this.bulkPasteModal = page.getByTestId("bulk-paste-seed-packets-modal");
    this.bulkPasteTextarea = page.getByTestId("bulk-paste-textarea");
    this.bulkPasteParse = page.getByTestId("bulk-paste-parse");
    this.bulkPasteSave = page.getByTestId("bulk-paste-save");
    this.bulkPasteModePaste = page.getByTestId("bulk-paste-mode-paste");
    this.bulkPasteModeCsv = page.getByTestId("bulk-paste-mode-csv");
    this.csvTemplateDownload = page.getByTestId("csv-template-download");
    this.csvFileInput = page.locator('[data-testid="csv-file-input"]');
    this.bulkPasteFavouriteAll = page.getByTestId("bulk-paste-favourite-all");
    this.bulkPasteFileIssues = page.getByTestId("bulk-paste-file-issues");

    this.nurseryPacketPicker = page.getByTestId("nursery-packet-picker");
    this.nurseryPacketPickerSelect = page.getByTestId("nursery-packet-picker-select");

    this.careGuideNurseryPackets = page.getByTestId("care-guide-nursery-packets");

    this.seedRefillBanner = page.getByTestId("seed-refill-banner");
    this.seedRefillBannerAdd = page.getByTestId("seed-refill-banner-add");

    this.scopeToggle = page.getByTestId("nursery-scope-toggle");
    this.scopeHomeBtn = page.getByTestId("nursery-scope-home");
    this.scopeFavouritesBtn = page.getByTestId("nursery-scope-favourites");
    this.favouritesGrid = page.getByTestId("nursery-favourites-grid");
    this.favouritesHintBanner = page.getByTestId("nursery-favourites-hint-banner");
    this.favouritesHintDismiss = page.getByTestId("nursery-favourites-hint-dismiss");
  }

  /** Open The Shed, flip to the Nursery view (Home scope). */
  async goto() {
    await this.gotoShed();
    await this.shedViewNurseryBtn.waitFor({ state: "visible", timeout: 15000 });
    await this.shedViewNurseryBtn.click();
    await this.scopeToggle.waitFor({ state: "visible", timeout: 15000 });
  }

  /** Open the Nursery and switch to the Favourites scope (component state). */
  async gotoFavourites() {
    await this.goto();
    await this.scopeFavouritesBtn.click();
    await this.favouritesGrid.waitFor({ state: "visible", timeout: 15000 });
  }

  /** The favourite heart on a Home-tab packet row (scoped to its <li>). */
  heartFor(name: string): Locator {
    return this.page
      .locator("li")
      .filter({
        has: this.page
          .locator("[data-testid^='nursery-row-']")
          .filter({ hasText: name }),
      })
      .locator("[data-testid^='favourite-packet-']");
  }

  /** A favourite packet card in the Favourites scope, matched by its heading. */
  favouriteCard(name: string): Locator {
    return this.favouritesGrid
      .locator("[data-testid^='favourite-packet-card-']")
      .filter({
        has: this.page.locator("h3").filter({ hasText: new RegExp(name) }),
      });
  }

  favouriteAddToHomeIn(card: Locator): Locator {
    return card.locator("[data-testid^='favourite-packet-add-to-home-']");
  }

  favouriteInHomeBadgeIn(card: Locator): Locator {
    return card.locator("[data-testid^='favourite-packet-in-home-']");
  }

  favouriteRemoveIn(card: Locator): Locator {
    return card.locator("[data-testid^='favourite-packet-remove-']");
  }

  favouriteTombstoneIn(card: Locator): Locator {
    return card.locator("[data-testid^='favourite-packet-tombstone-']");
  }

  async gotoShed() {
    await this.page.goto("/shed");
    await this.waitForLoad();
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  async openNursery() {
    await this.shedViewNurseryBtn.click();
  }

  bulkPasteRow(i: number): Locator {
    return this.page.getByTestId(`bulk-paste-row-${i}`);
  }

  nurseryRow(packetId: string): Locator {
    return this.page.getByTestId(`nursery-row-${packetId}`);
  }

  sowingRow(sowingId: string): Locator {
    return this.page.getByTestId(`sowing-row-${sowingId}`);
  }

  sowingObserveBtn(sowingId: string): Locator {
    return this.page.getByTestId(`sowing-${sowingId}-observe`);
  }

  sowingPlantOutBtn(sowingId: string): Locator {
    return this.page.getByTestId(`sowing-${sowingId}-plant-out`);
  }

  sowingDiscardBtn(sowingId: string): Locator {
    return this.page.getByTestId(`sowing-${sowingId}-discard`);
  }

  sowingLinkPlantBtn(sowingId: string): Locator {
    return this.page.getByTestId(`sowing-${sowingId}-link-plant`);
  }

  anyNurseryRow(): Locator {
    return this.page.locator("[data-testid^='nursery-row-']");
  }

  anySowingRow(): Locator {
    return this.page.locator("[data-testid^='sowing-row-']");
  }

  anyBulkPasteRow(): Locator {
    return this.page.locator("[data-testid^='bulk-paste-row-']").filter({
      hasNot: this.page.locator("[data-testid$='-remove']"),
    });
  }

  /** Upload a CSV file into the bulk-add modal's file input (RHO-4 Phase 3). */
  async uploadCsv(fileName: string, content: string) {
    await this.csvFileInput.setInputFiles({
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from(content, "utf-8"),
    });
  }

  /** The per-row review-card favourite checkbox (RHO-4 Phase 3). */
  bulkPasteRowFavourite(i: number): Locator {
    return this.page.getByTestId(`bulk-paste-row-${i}-favourite`);
  }

  /** The per-row review-card error block (RHO-4 Phase 3). */
  bulkPasteRowErrors(i: number): Locator {
    return this.page.getByTestId(`bulk-paste-row-${i}-errors`);
  }
}
