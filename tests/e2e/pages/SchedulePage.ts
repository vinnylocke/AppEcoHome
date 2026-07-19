import type { Page, Locator } from "@playwright/test";

export class SchedulePage {
  readonly page: Page;

  readonly heading: Locator;
  readonly newAutomationButton: Locator;
  readonly filtersButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly createFirstButton: Locator;
  readonly noMatchState: Locator;
  readonly filterDrawerHeading: Locator;
  readonly clearAllFiltersButton: Locator;

  // AddTaskModal locators (visible when creating/editing)
  readonly modalHeading: Locator;
  readonly titleInput: Locator;
  readonly saveButton: Locator;
  readonly taskTypeSelect: Locator;
  readonly titleError: Locator;

  // Tab bar
  readonly tabBlueprints: Locator;
  readonly tabOptimise: Locator;

  // Optimise tab locators
  readonly optimiseScopeSingle: Locator;
  readonly optimiseScopeWhole: Locator;
  readonly optimiseLocationSelect: Locator;
  readonly optimiseAreaSelect: Locator;
  readonly optimiseAnalyseBtn: Locator;
  readonly optimiseAiAnalyseBtn: Locator;
  readonly optimiseRegenerateBtn: Locator;
  readonly optimiseApplyBtn: Locator;
  readonly optimiseAllGood: Locator;
  readonly optimiseSuggestionsFound: Locator;
  readonly optimiseSelectedCount: Locator;
  readonly optimisationHistory: Locator;
  readonly regenerateReasonInput: Locator;
  readonly confirmModalConfirm: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /Automations|Routines|Schedules/i });
    // Source uses the testid `blueprint-new-btn` and the visible label
    // shifted from "New Automation" → "New Routine" — testid is the stable
    // selector.
    this.newAutomationButton = page.getByTestId("blueprint-new-btn");
    this.filtersButton = page.getByRole("button", { name: /Filters/i });
    this.searchInput = page.getByPlaceholder("Search routines...");
    this.emptyState = page.getByText("No routines yet");
    this.createFirstButton = page.getByRole("button", { name: /Create your first routine/i });
    this.noMatchState = page.getByText("No matches found");
    this.filterDrawerHeading = page.getByRole("heading", { name: "Filters" });
    this.clearAllFiltersButton = page.getByRole("button", { name: /Clear All/i });

    this.modalHeading = page.getByRole("heading", { name: /New Routine|Edit Routine/i });
    this.titleInput = page.getByPlaceholder("Task Name *");
    this.saveButton = page.getByRole("button", { name: /^Save$/i });
    this.taskTypeSelect = page.locator("select").first();
    this.titleError = page.getByText("Task name is required.");

    this.tabBlueprints = page.getByTestId("tab-blueprints");
    this.tabOptimise = page.getByTestId("tab-optimise");

    this.optimiseScopeSingle = page.getByTestId("optimise-scope-single");
    this.optimiseScopeWhole = page.getByTestId("optimise-scope-whole");
    this.optimiseLocationSelect = page.getByTestId("optimise-location-select");
    this.optimiseAreaSelect = page.getByTestId("optimise-area-select");
    this.optimiseAnalyseBtn = page.getByTestId("optimise-analyse-btn");
    this.optimiseAiAnalyseBtn = page.getByTestId("optimise-ai-analyse-btn");
    this.optimiseRegenerateBtn = page.getByTestId("optimise-regenerate-btn");
    this.optimiseApplyBtn = page.getByTestId("optimise-apply-btn");
    this.optimiseAllGood = page.getByTestId("optimise-all-good");
    this.optimiseSuggestionsFound = page.getByTestId("optimise-suggestions-found");
    this.optimiseSelectedCount = page.getByTestId("optimise-selected-count");
    this.optimisationHistory = page.getByTestId("optimisation-history");
    this.regenerateReasonInput = page.getByTestId("regenerate-reason-input");
    this.confirmModalConfirm = page.getByTestId("confirm-modal-confirm");
  }

  proposalCard(id: string): Locator {
    return this.page.getByTestId(`proposal-card-${id}`);
  }

  proposalToggle(id: string): Locator {
    return this.page.getByTestId(`proposal-toggle-${id}`);
  }

  proposalThumbsUp(id: string): Locator {
    return this.page.getByTestId(`proposal-thumbs-up-${id}`);
  }

  anyProposalCard(): Locator {
    return this.page.locator("[data-testid^='proposal-card-']");
  }

  anyProposalToggle(): Locator {
    return this.page.locator("[data-testid^='proposal-toggle-']");
  }

  anySessionRow(): Locator {
    return this.page.locator("[data-testid^='session-row-']");
  }

  anyUndoSessionBtn(): Locator {
    return this.page.locator("[data-testid^='undo-session-']");
  }

  async goto() {
    await this.page.goto("/schedule");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  blueprintCard(title: string): Locator {
    // Cards are clickable divs containing an h3 with the blueprint title
    return this.page.locator("h3").filter({ hasText: title });
  }

  deleteButtonFor(title: string): Locator {
    return this.page.getByLabel(`Delete ${title}`);
  }

  frequencyBadge(days: number): Locator {
    return this.page.getByText(`Every ${days} Days`).first();
  }
}
