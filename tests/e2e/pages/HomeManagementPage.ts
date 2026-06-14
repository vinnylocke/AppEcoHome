import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/HomeManagement.tsx` — the multi-home
 * management screen at `/home-management`.
 *
 * The home list renders one card per home with three sub-tabs (Settings,
 * Insights, Members). All per-home selectors are keyed by `homeId` so
 * specs can target a specific seeded home without prefix-matching.
 */
export class HomeManagementPage {
  readonly page: Page;

  readonly addHomeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addHomeButton = page.locator('[data-testid="home-mgmt-add-btn"]');
  }

  async goto() {
    await this.page.goto("/home-management");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  homeCard(homeId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-card-${homeId}"]`);
  }

  membersTabButton(homeId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-tab-members-${homeId}"]`);
  }

  /** "Copy ID" button for the owner-only invite row. */
  copyJoinCodeButton(homeId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-copy-${homeId}"]`);
  }

  /** Member row by the member's user id. */
  memberRow(userId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-member-${userId}"]`);
  }

  /** Role select for a member. Only rendered for `canManage` members — for
   *  the current owner viewing themselves this returns 0 elements. */
  memberRoleSelect(userId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-role-${userId}"]`);
  }

  /** Remove-member trash button. Only rendered for `canManage` members. */
  removeMemberButton(userId: string): Locator {
    return this.page.locator(
      `[data-testid="home-mgmt-remove-member-${userId}"]`,
    );
  }

  /** Permission editor expand-button. Only rendered for `canManage` members. */
  configureMemberButton(userId: string): Locator {
    return this.page.locator(`[data-testid="home-mgmt-configure-${userId}"]`);
  }
}
