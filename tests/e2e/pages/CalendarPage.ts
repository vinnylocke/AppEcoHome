import type { Page, Locator } from "@playwright/test";

/**
 * Page object for the dashboard's Calendar view (`src/components/TaskCalendar.tsx`).
 *
 * Cells expose three data attributes used by the calendar specs:
 *   - `data-testid="calendar-day-YYYY-MM-DD"` — direct cell lookup
 *   - `data-harvest-window="true"` — amber harvest highlight
 *   - `data-pending-task-count="N"` — number of pending-task dots rendered
 *   - `data-today="true"` — today's cell
 */
export class CalendarPage {
  readonly page: Page;

  readonly viewToggle: Locator;
  readonly monthView: Locator;
  readonly weekView: Locator;
  readonly harvestWindowsToggle: Locator;
  readonly exportIcsButton: Locator;

  readonly agendaPanel: Locator;
  readonly agendaTaskList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.viewToggle = page.locator('[data-testid="calendar-view-toggle"]');
    this.monthView = page.locator('[data-testid="calendar-view-month"]');
    this.weekView = page.locator('[data-testid="calendar-view-week"]');
    this.harvestWindowsToggle = page.locator('[data-testid="calendar-harvest-windows-toggle"]');
    this.exportIcsButton = page.locator('[data-testid="calendar-export-ics"]');

    this.agendaPanel = page.locator('[data-testid="calendar-agenda-panel"]');
    this.agendaTaskList = this.agendaPanel.locator('[data-testid="task-list-container"]');
  }

  async goto() {
    await this.page.goto("/dashboard?view=calendar");
  }

  async waitForLoad() {
    await this.page
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  }

  /** Direct cell lookup by ISO date string (YYYY-MM-DD). */
  dayCell(dateStr: string): Locator {
    return this.page.locator(`[data-testid="calendar-day-${dateStr}"]`);
  }

  /** The cell marked as today. */
  todayCell(): Locator {
    return this.page.locator('[data-testid^="calendar-day-"][data-today="true"]');
  }

  /** Task rows inside the agenda panel for the currently-selected day. */
  agendaTaskRow(taskId: string): Locator {
    return this.agendaPanel.locator(`[data-testid="task-row-${taskId}"]`);
  }

  /** Search the agenda panel for any task whose title matches the substring. */
  agendaTaskByTitle(title: string): Locator {
    return this.agendaPanel
      .locator('[data-testid^="task-row-"]')
      .filter({ hasText: title });
  }
}
