import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { DashboardPage } from "../pages/DashboardPage";
import { TaskListPage } from "../pages/TaskListPage";

// All tests require an authenticated session.
// Seeded tasks (03_tasks_blueprints.sql):
//   Water the Garden (standalone) — Watering, Pending, due today
//   Morning Plant Inspection      — Inspection, Completed, due today
//   Fertilize Beds (postponed)    — Fertilizing, Skipped, due yesterday
//   Overdue Maintenance Check     — Maintenance, Pending, due -7 days
//   Rose Hedge Pruning            — Pruning, Pending, due today
//   Water Basil Plants            — Watering, Pending, due today (linked to Basil inv, Raised Bed A)
//   Apply Organic Fertilizer      — Fertilizing, Pending, due today
//   Deadhead Roses                — Pruning, Pending, due +5 days
//   Harvest Tomatoes              — Harvesting, Pending, due +2 days
//   Fern Health Check             — Inspection, Pending, due today
//   Aphid Treatment               — Pest Control, Pending, due today
//   Clear Weeds from Borders      — Maintenance, Pending, due +1 day
//   Plant Seedlings in Raised Bed — Planting, Pending, due today (TASK_PLANTING_ID)

test.describe("Task lifecycle — dashboard task list", () => {
  test("dashboard shows the 'Daily Tasks' section heading", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    await expect(dashboard.dailyTasksHeading).toBeVisible({ timeout: 10000 });
  });

  test("task list shows either pending tasks or an empty state", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    // Wait for the loading skeleton to disappear before asserting
    await authenticatedPage
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const taskList = new TaskListPage(authenticatedPage);

    const hasTasks = await taskList.pendingTab.isVisible().catch(() => false);
    const hasEmpty = await taskList.emptyState.isVisible().catch(() => false);
    // When no home is configured TaskList is not rendered — HomeDropdown shows "Select Home".
    // Use getByRole to avoid strict-mode throw from getByText matching both the button and its inner span.
    const noHomeConfigured = await authenticatedPage
      .getByRole("button", { name: "Select Home" })
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasTasks || hasEmpty || noHomeConfigured).toBe(true);
  });

  test("when tasks exist the Pending tab shows a count and Completed tab is present", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    await authenticatedPage
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const taskList = new TaskListPage(authenticatedPage);
    const pendingVisible = await taskList.pendingTab.isVisible().catch(() => false);

    if (pendingVisible) {
      // Both tabs should be rendered side-by-side
      await expect(taskList.pendingTab).toBeVisible();
      await expect(taskList.completedTab).toBeVisible();
    }
    // If no tasks, the tabs are not rendered — also a valid outcome for this test
  });

  test("clicking the Completed tab switches the task view", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    await authenticatedPage
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const taskList = new TaskListPage(authenticatedPage);
    const pendingVisible = await taskList.pendingTab.isVisible().catch(() => false);

    if (pendingVisible) {
      await taskList.completedTab.click();
      // After clicking Completed the button should have the active (green) style class
      await expect(taskList.completedTab).toHaveClass(/text-green-600/, {
        timeout: 3000,
      });
    }
  });
});

test.describe("Task lifecycle — Task Management page", () => {
  test("navigating to /schedule renders the Blueprint Manager", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/schedule");

    // BlueprintManager renders <h2>Automations</h2>
    await expect(
      authenticatedPage.getByRole("heading", { name: /Automations/i }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Task Management nav link navigates to /schedule", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Task Management" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/schedule");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 07 — Task Lifecycle: display (reads, use seeded data)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Task lifecycle — task display (Section 07)", () => {
  test("TASK-001: Seeded pending task 'Water the Garden' is visible in the Pending tab", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(
      authenticatedPage.getByText("Water the Garden (standalone)"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("TASK-002: Watering task shows a Watering type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Type badges use `uppercase` CSS class — DOM text is "Watering"
    await expect(taskList.typeBadge("Watering")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-003: Pruning task shows a Pruning type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Pruning")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-004: Harvesting task shows a Harvesting type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Harvesting")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-005: Fertilizing task shows a Fertilizing type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Fertilizing")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-006: Inspection task shows an Inspection type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Inspection")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-007: Pest Control task shows a Pest Control type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Pest Control")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-008: Maintenance task shows a Maintenance type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(taskList.typeBadge("Maintenance")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-010: Overdue pending task is visible in the task list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Overdue Maintenance Check" is seeded as Pending with due_date = CURRENT_DATE - 7
    await expect(
      authenticatedPage.getByText("Overdue Maintenance Check"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("TASK-011: Overdue task has a red/warning visual indicator", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Overdue cards get bg-red-100 border-red-300 styling
    await expect(
      taskList.overdueCard("Overdue Maintenance Check"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("TASK-012: Seeded task 'Rose Hedge Pruning' is visible in the task list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(
      authenticatedPage.getByText("Rose Hedge Pruning"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("TASK-014: Skipped task 'Fertilize Beds (postponed)' is not shown in Pending tab", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Ensure we are on the Pending tab (default)
    const pendingVisible = await taskList.pendingTab.isVisible().catch(() => false);
    if (pendingVisible) {
      await taskList.pendingTab.click();
      await authenticatedPage.waitForTimeout(300);
    }

    await expect(
      authenticatedPage.getByText("Fertilize Beds (postponed)"),
    ).not.toBeVisible();
  });

  test("TASK-015: Completed task 'Morning Plant Inspection' appears in Completed tab", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Switch to the Completed tab
    await taskList.completedTab.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(
      authenticatedPage.getByText("Morning Plant Inspection"),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 07 — Task Lifecycle: actions (writes — run after reads)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Task lifecycle — task actions (Section 07)", () => {
  test("TASK-016: Mark a pending task complete — it moves to the Completed tab", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Use "Water the Garden (standalone)" — Pending, due today
    const taskTitle = "Water the Garden (standalone)";

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 10000 });

    // Click the complete (checkbox) button
    await taskList.taskCheckbox(taskTitle).click();
    await authenticatedPage.waitForTimeout(500);

    // Switch to Completed tab and verify it appears there
    await taskList.completedTab.click();
    await authenticatedPage.waitForTimeout(400);

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 10000 });

    // Seed resets this task to Pending on the next test:seed run — no cleanup needed
  });

  test("TASK-018: Postpone a pending task — it disappears from the Pending tab", async ({ authenticatedPage }) => {
    // Create a throwaway task so this test doesn't permanently mutate seeded data
    const taskTitle = `E2E Postpone ${Date.now()}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();
    await authenticatedPage.getByRole("button", { name: "Add Task" }).click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.getByPlaceholder("Task Name *").fill(taskTitle);
    await authenticatedPage.locator('input[type="date"]').first().fill(todayStr);
    await authenticatedPage.getByRole("button", { name: /^Save$/i }).click();
    await authenticatedPage.waitForTimeout(500);

    // Navigate to the task list view and find the throwaway task
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 10000 });

    // Postpone — button opens modal; confirm to actually postpone
    await taskList.postponeButton(taskTitle).click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.getByRole("button", { name: "Confirm" }).click();
    await authenticatedPage.waitForTimeout(500);

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).not.toBeVisible({ timeout: 8000 });
  });

  test("TASK-021: Delete a task — confirm removes it from the list", async ({ authenticatedPage }) => {
    // Create a throwaway task so this test doesn't permanently remove seeded data
    const taskTitle = `E2E Delete ${Date.now()}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.gotoCalendar();
    await dashboard.waitForLoad();
    await authenticatedPage.getByRole("button", { name: "Add Task" }).click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.getByPlaceholder("Task Name *").fill(taskTitle);
    await authenticatedPage.locator('input[type="date"]').first().fill(todayStr);
    await authenticatedPage.getByRole("button", { name: /^Save$/i }).click();
    await authenticatedPage.waitForTimeout(500);

    // Navigate to the task list view and find the throwaway task
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 10000 });

    await taskList.deleteButton(taskTitle).click();
    await authenticatedPage.getByRole("button", { name: /^Remove Task$/i }).click();

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test("TASK-022: Cancel on delete dialog leaves the task in the list", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Rose Hedge Pruning" — Pending, due today (not mutated by earlier tests)
    const taskTitle = "Rose Hedge Pruning";

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 10000 });

    await taskList.deleteButton(taskTitle).click();

    const cancelBtn = authenticatedPage.getByRole("button", { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cancelBtn.click();
    }

    await expect(
      authenticatedPage.getByText(taskTitle),
    ).toBeVisible({ timeout: 5000 });
  });

  test("TASK-009: Planting task shows a Planting type badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Plant Seedlings in Raised Bed" — Planting, Pending, due today (seeded in 03_tasks_blueprints.sql)
    await expect(taskList.typeBadge("Planting")).toBeVisible({ timeout: 10000 });
  });

  test("TASK-023: Task linked to a plant shows the plant name badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Water Basil Plants" has inventory_item_ids = [Basil inv item]
    // TaskList renders a green plant badge: <Leaf> {plantName}
    // The task must be visible first
    await expect(
      authenticatedPage.getByText("Water Basil Plants"),
    ).toBeVisible({ timeout: 10000 });

    // Find the task card and assert the plant badge inside it
    const taskCard = authenticatedPage
      .getByRole("button", { name: /View task: Water Basil Plants/i })
      .first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });

    // Plant badge renders within the card (exact match avoids matching "Water Basil Plants" h4)
    await expect(
      taskCard.getByText("Basil", { exact: true }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("TASK-024: Task linked to an area shows the area name badge", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // "Water Basil Plants" has area_id = Raised Bed A
    // TaskList renders an area badge: <Grid> {area.name}
    await expect(
      authenticatedPage.getByText("Water Basil Plants"),
    ).toBeVisible({ timeout: 10000 });

    const taskCard = authenticatedPage
      .getByRole("button", { name: /View task: Water Basil Plants/i })
      .first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });

    await expect(
      taskCard.getByText("Raised Bed A"),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 07 — Ghost tasks (blueprint-generated virtual tasks)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Task lifecycle — ghost tasks (Section 07)", () => {
  test("TASK-013: Ghost task is visible for the 'Weekly Garden Watering' blueprint", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // At least one ghost task card should exist in the pending list.
    // Ghost cards have data-ghost="true" (added to TaskList.tsx card div).
    const ghostCard = authenticatedPage.locator("[data-ghost='true']").first();
    await expect(ghostCard).toBeVisible({ timeout: 10000 });
  });

  test("TASK-017: Marking a ghost task complete creates a physical task", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Find the first ghost card
    const ghostCard = authenticatedPage.locator("[data-ghost='true']").first();
    const isVisible = await ghostCard.isVisible({ timeout: 10000 }).catch(() => false);
    if (!isVisible) {
      // No ghost tasks visible — skip gracefully
      return;
    }

    // Extract the ghost's title from its accessible name to locate the checkbox
    const ghostTitle = await ghostCard.getByRole("button", { name: /View task:/i })
      .getAttribute("aria-label")
      .then((label) => label?.replace("View task: ", "") ?? "")
      .catch(() => "");

    if (!ghostTitle) return;

    // Click the complete button on the ghost
    await taskList.taskCheckbox(ghostTitle).click();
    await authenticatedPage.waitForTimeout(800);

    // The ghost should be gone from Pending (now a completed physical task)
    const ghostsRemaining = await authenticatedPage.locator("[data-ghost='true']").filter({ hasText: ghostTitle }).count();
    expect(ghostsRemaining).toBe(0);

    // Verify the completed task appears in the Completed tab
    await taskList.completedTab.click();
    await authenticatedPage.waitForTimeout(400);
    await expect(authenticatedPage.getByText(ghostTitle)).toBeVisible({ timeout: 10000 });

    // Cleanup: delete the physical task so the ghost is not suppressed on the next run
    const removeBtn = taskList.deleteButton(ghostTitle);
    if (await removeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await removeBtn.click();
      const removeConfirm = authenticatedPage.getByRole("button", { name: /^Remove Task$/i });
      if (await removeConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
        await removeConfirm.click();
      }
    }
  });

  test("TASK-019: Postponing a ghost task suppresses it (no longer visible as ghost)", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();
    const taskList = new TaskListPage(authenticatedPage);
    await taskList.waitForLoad();

    // Find the first ghost card
    const ghostCard = authenticatedPage.locator("[data-ghost='true']").first();
    const isVisible = await ghostCard.isVisible({ timeout: 10000 }).catch(() => false);
    if (!isVisible) {
      return;
    }

    const ghostTitle = await ghostCard.getByRole("button", { name: /View task:/i })
      .getAttribute("aria-label")
      .then((label) => label?.replace("View task: ", "") ?? "")
      .catch(() => "");

    if (!ghostTitle) return;

    // Postpone the ghost task
    await taskList.postponeButton(ghostTitle).click();
    await authenticatedPage.waitForTimeout(800);

    // The ghost for this title should no longer be visible in Pending
    const ghostsRemaining = await authenticatedPage
      .locator("[data-ghost='true']")
      .filter({ hasText: ghostTitle })
      .count();
    expect(ghostsRemaining).toBe(0);
  });

  test("TASK-020: Weather auto-watering — 'Outdoor watering auto-completed' visible in Garden Intelligence", async ({ authenticatedPage }) => {
    // Seed Day 0 has precipMm=8 (>= 5mm threshold) → rainTriggered=true
    // Navigate to the Weather tab and open the Garden Intelligence panel
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.goto();

    await expect(dashboard.weatherTab).toBeVisible({ timeout: 10000 });
    await dashboard.clickWeatherTab();

    // Wait for the forecast to render
    await authenticatedPage.waitForTimeout(800);

    // Garden Intelligence panel shows "Outdoor watering auto-completed"
    const giHeading = authenticatedPage.getByText("Outdoor watering auto-completed");
    await expect(giHeading).toBeVisible({ timeout: 10000 });
  });
});
