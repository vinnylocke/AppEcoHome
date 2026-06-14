import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { HomeManagementPage } from "../pages/HomeManagementPage";
import { workerHomeId, workerUserId } from "../utils/rlsAssertions";

// ─────────────────────────────────────────────────────────────────────────
// members-permissions.spec.ts
//
// Members tab inside Home Management. Owner-only home (the seeded test1
// user is the sole owner of their seed home — there are no other members
// to manage). Tests that need a second member (permission editor + toggle
// persistence) are deferred until a seeded co-member arrives in a future
// PR; documented in docs/plans/e2e-pr5-members-rls.md.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Members & Permissions — owner-only home", () => {
  test("MEM-001: members tab lists the current user with a member row visible", async ({
    authenticatedPage,
  }) => {
    const mgmt = new HomeManagementPage(authenticatedPage);
    const homeId = workerHomeId(0);
    const userId = workerUserId(0);

    await mgmt.goto();
    await mgmt.waitForLoad();
    await expect(mgmt.homeCard(homeId)).toBeVisible({ timeout: 10000 });

    await mgmt.membersTabButton(homeId).click();
    await expect(mgmt.memberRow(userId)).toBeVisible();
    // The seeded user's row shows "(you)" suffix — confirms self-row.
    await expect(mgmt.memberRow(userId)).toContainText("(you)");
  });

  test("MEM-002: copy join code (home_id) writes the home UUID to the clipboard", async ({
    authenticatedPage,
    context,
  }) => {
    // Grant clipboard read so the assertion can inspect what was written.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const mgmt = new HomeManagementPage(authenticatedPage);
    const homeId = workerHomeId(0);

    await mgmt.goto();
    await mgmt.waitForLoad();
    await expect(mgmt.copyJoinCodeButton(homeId)).toBeVisible({ timeout: 10000 });
    await mgmt.copyJoinCodeButton(homeId).click();

    // The "Copied!" label confirms the click registered without needing
    // to interrogate the OS clipboard (which is brittle under headless).
    await expect(mgmt.copyJoinCodeButton(homeId)).toContainText("Copied!");
    const clipboard = await authenticatedPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(homeId);
  });

  test("MEM-005: owner cannot demote themselves — the role select is NOT rendered for the owner's own row", async ({
    authenticatedPage,
  }) => {
    const mgmt = new HomeManagementPage(authenticatedPage);
    const homeId = workerHomeId(0);
    const userId = workerUserId(0);

    await mgmt.goto();
    await mgmt.waitForLoad();
    await mgmt.membersTabButton(homeId).click();

    // The role select is gated on `canManage && !isMe && member.role !== "owner"`.
    // For the seeded owner viewing themselves, all three conditions fail
    // simultaneously and the select is absent from the DOM.
    await expect(mgmt.memberRoleSelect(userId)).toHaveCount(0);
  });

  test("MEM-006: owner's own row does NOT render a remove-member button", async ({
    authenticatedPage,
  }) => {
    const mgmt = new HomeManagementPage(authenticatedPage);
    const homeId = workerHomeId(0);
    const userId = workerUserId(0);

    await mgmt.goto();
    await mgmt.waitForLoad();
    await mgmt.membersTabButton(homeId).click();
    await expect(mgmt.memberRow(userId)).toBeVisible();

    // canManage is false for self → no remove-member trash button.
    await expect(mgmt.removeMemberButton(userId)).toHaveCount(0);
    // Same gating hides the permission editor expand button.
    await expect(mgmt.configureMemberButton(userId)).toHaveCount(0);
  });
});
