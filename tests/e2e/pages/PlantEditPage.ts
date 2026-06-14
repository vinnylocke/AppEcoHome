import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/PlantEditModal.tsx`. The modal hosts a
 * tab bar; the Care tab renders <ManualPlantCreation> which is where the
 * common-name input and form save button live.
 *
 * Opens from a plant card tap on /shed.
 */
export class PlantEditPage {
  readonly page: Page;

  readonly nameInput: Locator;
  readonly saveButton: Locator;
  readonly glanceStrip: Locator;

  // Tab buttons (via the dynamic `plant-modal-tab-${id}` testid)
  readonly tabCare: Locator;
  readonly tabSchedules: Locator;
  readonly tabLight: Locator;
  readonly tabGrowGuide: Locator;
  readonly tabGuides: Locator;
  readonly tabCompanions: Locator;
  readonly tabInstances: Locator;

  // Plant instances tab — opens InstanceEditModal on row tap
  readonly instancesList: Locator;
  readonly instancesEmpty: Locator;
  readonly addAnotherInstance: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator('[data-testid="plant-common-name-input"]');
    this.saveButton = page.locator('[data-testid="plant-form-save-btn"]');
    this.glanceStrip = page.locator('[data-testid="plant-edit-glance-strip"]');

    this.tabCare = page.locator('[data-testid="plant-modal-tab-care"]');
    this.tabSchedules = page.locator('[data-testid="plant-modal-tab-schedules"]');
    this.tabLight = page.locator('[data-testid="plant-modal-tab-light"]');
    this.tabGrowGuide = page.locator('[data-testid="plant-modal-tab-grow_guide"]');
    this.tabGuides = page.locator('[data-testid="plant-modal-tab-guides"]');
    this.tabCompanions = page.locator('[data-testid="plant-modal-tab-companions"]');
    this.tabInstances = page.locator('[data-testid="plant-modal-tab-instances"]');

    this.instancesList = page.locator('[data-testid="plant-instances-list"]');
    this.instancesEmpty = page.locator('[data-testid="plant-instances-empty"]');
    this.addAnotherInstance = page.locator('[data-testid="plant-instances-add-another"]');
  }

  /** Row inside the Instances tab — opens the InstanceEditModal on click. */
  instanceRowOpen(instanceId: string): Locator {
    return this.page.locator(`[data-testid="plant-instance-row-open-${instanceId}"]`);
  }

  /** The first instance row when the id is unknown (use sparingly). */
  firstInstanceRowOpen(): Locator {
    return this.page.locator('[data-testid^="plant-instance-row-open-"]').first();
  }
}
