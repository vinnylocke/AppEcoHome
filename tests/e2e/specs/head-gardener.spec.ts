import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures/auth";
import { HeadGardenerPage } from "../pages/HeadGardenerPage";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// Seed: 14_head_gardener.sql — a confirmed Garden Brief (goals incl. grow_your_own),
// a cached Estate Report (yearPlan incl. "Succession-sow lettuce and rocket"), and a
// continuity log with an open gap "Fill the winter colour gap".
//
// The AI edge functions are mocked (they call Gemini server-side, which Playwright
// can't intercept). The Year Plan + continuity log read the seeded DB rows directly.

const MOCK_REPORT = {
  locked: false,
  cached: true,
  report: {
    headline: "Your garden is looking healthy this week.",
    greeting: "Morning! Your beds are coming along nicely.",
    sections: [
      { goal: "grow_your_own", title: "Your edible garden", body: "Tomatoes are cropping well.", severity: 2, recommendation: "Sow a row of lettuce now.", link: "/shed" },
    ],
    gaps: [
      { goal: "year_round_colour", title: "Winter colour gap", detail: "Nothing flowers Nov–Feb.", suggestion: "Add hellebores.", link: "/planner" },
    ],
    yearPlan: { thisMonth: ["Sow lettuce"], thisSeason: [], comingUp: [] },
    followUps: [],
    generatedAt: "2026-06-22T00:00:00Z",
    persona: "experienced",
  },
};
const MOCK_CHAT = { locked: false, reply: "This week, focus on watering and feeding your tomatoes.", savedPreferences: 0 };
const MOCK_INSIGHTS = { locked: false, summary: "All looking calm in your garden right now.", insights: [], persona: "experienced" };

async function mockManagerFns(page: Page) {
  await mockEdgeFunction(page, "garden-manager-report", MOCK_REPORT);
  await mockEdgeFunction(page, "head-gardener-chat", MOCK_CHAT);
  await mockEdgeFunction(page, "insights-feed", MOCK_INSIGHTS);
}

test.describe("Head Gardener (HG-001 – HG-007)", () => {
  test("HG-001: /manager renders the hub heading + tab bar", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await expect(hg.heading).toBeVisible();
    await expect(hg.tabBar).toBeVisible();
  });

  test("HG-002: Overview renders the report — headline, section and gap", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await expect(hg.reportPanel()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Your garden is looking healthy this week.")).toBeVisible();
    await expect(authenticatedPage.getByText("Your edible garden")).toBeVisible();
    await expect(authenticatedPage.getByText("Winter colour gap")).toBeVisible();
  });

  test("HG-003: Overview continuity log shows the seeded open item", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await expect(hg.managerLog()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Fill the winter colour gap")).toBeVisible();
  });

  test("HG-004: Brief tab shows the seeded confirmed brief", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await hg.openTab("brief");
    await expect(hg.briefCard()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Grow my own food")).toBeVisible();
  });

  test("HG-005: Year Plan tab shows the seeded plan items", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await hg.openTab("year");
    await expect(hg.yearPlanPanel()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Succession-sow lettuce and rocket")).toBeVisible();
  });

  test("HG-006: Insights tab embeds the unified feed", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await hg.openTab("insights");
    await expect(authenticatedPage.getByText("All looking calm in your garden right now.")).toBeVisible({ timeout: 10000 });
  });

  test("HG-007: Ask tab — sending a message returns a grounded reply", async ({ authenticatedPage }) => {
    await mockManagerFns(authenticatedPage);
    const hg = new HeadGardenerPage(authenticatedPage);
    await hg.goto();
    await hg.waitForLoad();
    await hg.openTab("ask");
    await expect(hg.chatInput).toBeVisible({ timeout: 10000 });
    await hg.chatInput.fill("What should I do this week?");
    await hg.chatSend.click();
    await expect(authenticatedPage.getByText("This week, focus on watering and feeding your tomatoes.")).toBeVisible({ timeout: 10000 });
  });
});
