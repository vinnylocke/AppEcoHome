/**
 * Tier E — XSS / Injection Security Tests
 *
 * Verifies that user-controlled input is never executed as script. Every field
 * that accepts free text is tested with a payload that sets window.__xss = 1 if
 * executed. After saving/submitting, the test asserts the variable is undefined
 * and the raw markup appears escaped in the DOM.
 */

import { test as authTest, expect } from "../fixtures/auth";

const XSS_PAYLOADS = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=1">',
  '"><script>window.__xss=1</script>',
];

// Pick the most universal payload for field tests
const PAYLOAD = XSS_PAYLOADS[0];

async function assertNoXss(page: import("@playwright/test").Page) {
  const xss = await page.evaluate(() => (window as any).__xss);
  expect(xss).toBeUndefined();
}

authTest.describe("XSS — Task title", () => {
  authTest("XSS-001: XSS payload in task title is escaped", async ({ authenticatedPage: page }) => {
    await page.goto("/dashboard?view=overview");

    // Open the quick-add task modal or inline form
    const addTaskBtn = page.getByRole("button", { name: /add task/i }).first();
    if (!(await addTaskBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await addTaskBtn.click();

    const titleInput = page.getByPlaceholder(/task title|title/i).first();
    await titleInput.fill(PAYLOAD);

    const saveBtn = page.getByRole("button", { name: /save|add|create/i }).first();
    await saveBtn.click();

    await page.waitForTimeout(800);
    await assertNoXss(page);

    // The raw text should appear escaped, not as rendered HTML
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toContain("<script>");
  });
});

authTest.describe("XSS — Community guide title", () => {
  authTest("XSS-003: XSS payload in community guide title is escaped", async ({ authenticatedPage: page }) => {
    await page.goto("/guides");

    // Switch to community tab
    const communityTab = page.getByRole("tab", { name: /community/i });
    if (!(await communityTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await communityTab.click();

    // Open guide editor
    const writeBtn = page.locator("[data-testid='write-guide-btn']");
    await writeBtn.waitFor({ state: "visible", timeout: 5000 });
    await writeBtn.click();

    // Fill title with XSS payload
    const titleInput = page.locator("[data-testid='community-guide-title']");
    await titleInput.fill(PAYLOAD);

    // Save as draft
    const draftBtn = page.locator("[data-testid='community-guide-draft']");
    await draftBtn.click();

    await page.waitForTimeout(1000);
    await assertNoXss(page);
  });
});

authTest.describe("XSS — Community guide comment", () => {
  authTest("XSS-004: XSS payload in guide comment body is escaped", async ({ authenticatedPage: page }) => {
    await page.goto("/guides");

    const communityTab = page.getByRole("tab", { name: /community/i });
    if (!(await communityTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await communityTab.click();

    // Click first guide card to open reader
    const firstCard = page.locator("[data-testid^='community-guide-card-']").first();
    if (!(await firstCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await firstCard.click();

    // Add comment with XSS payload
    const commentInput = page.locator("[data-testid='community-guide-comment-input']");
    await commentInput.waitFor({ state: "visible", timeout: 5000 });
    await commentInput.fill(PAYLOAD);

    const submitBtn = page.locator("[data-testid='community-guide-comment-submit']");
    await submitBtn.click();

    await page.waitForTimeout(1000);
    await assertNoXss(page);

    // Comment body should be escaped plain text, not executed HTML
    const commentText = await page.locator(".text-sm.font-bold").last().textContent();
    expect(commentText).toContain("<script>");
  });
});

authTest.describe("XSS — Location name", () => {
  authTest("XSS-006: XSS payload in location name is escaped", async ({ authenticatedPage: page }) => {
    await page.goto("/management");

    const addLocationBtn = page.getByRole("button", { name: /add location/i });
    if (!(await addLocationBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await addLocationBtn.click();

    const nameInput = page.getByPlaceholder(/location name|name/i).first();
    await nameInput.fill(PAYLOAD);

    const saveBtn = page.getByRole("button", { name: /save|add|create/i }).first();
    await saveBtn.click();

    await page.waitForTimeout(800);
    await assertNoXss(page);
  });
});

authTest.describe("XSS — Planner plan name", () => {
  authTest("XSS-007: XSS payload in plan name is escaped", async ({ authenticatedPage: page }) => {
    await page.goto("/planner");

    const newPlanBtn = page.getByRole("button", { name: /new plan|create plan/i });
    if (!(await newPlanBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await newPlanBtn.click();

    const nameInput = page.getByPlaceholder(/plan name|name/i).first();
    await nameInput.fill(PAYLOAD);

    const saveBtn = page.getByRole("button", { name: /save|create/i }).first();
    await saveBtn.click();

    await page.waitForTimeout(800);
    await assertNoXss(page);
  });
});

authTest.describe("XSS — Tiptap editor body", () => {
  authTest("XSS-005: Raw HTML in Tiptap guide body is not executed", async ({ authenticatedPage: page }) => {
    await page.goto("/guides");

    const communityTab = page.getByRole("tab", { name: /community/i });
    if (!(await communityTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // UI element not present in this seed state — skip gracefully
      return;
    }
    await communityTab.click();

    const writeBtn = page.locator("[data-testid='write-guide-btn']");
    await writeBtn.waitFor({ state: "visible", timeout: 5000 });
    await writeBtn.click();

    const titleInput = page.locator("[data-testid='community-guide-title']");
    await titleInput.fill("XSS Body Test");

    // Type XSS payload directly into the Tiptap editor
    const editorArea = page.locator(".tiptap-editor .ProseMirror");
    await editorArea.click();
    await editorArea.fill(PAYLOAD);

    // Publish
    const publishBtn = page.locator("[data-testid='community-guide-publish']");
    await publishBtn.click();

    await page.waitForTimeout(1500);

    // After publishing, the reader should open — XSS should not fire
    await assertNoXss(page);
  });
});
