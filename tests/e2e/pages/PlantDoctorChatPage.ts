import type { Page, Locator } from "@playwright/test";

/**
 * Page object for `src/components/PlantDoctorChat.tsx` — the floating
 * Garden AI chat overlay (FAB → slide-up panel).
 *
 * All edge function calls go through `plant-doctor-ai`; tests stub that
 * via `mockEdgeFunction()` (see tests/e2e/fixtures/api-mocks.ts).
 */
export class PlantDoctorChatPage {
  readonly page: Page;

  readonly fab: Locator;
  readonly panel: Locator;
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly attachImageButton: Locator;

  // Page-context chip + clear (set on certain surfaces like Plant Doctor)
  readonly contextChip: Locator;
  readonly contextClear: Locator;

  // Plan suggestion card + actions
  readonly planSuggestionCard: Locator;
  readonly planSuggestionAccept: Locator;
  readonly planSuggestionDismiss: Locator;

  // Suggested plant / task action containers
  readonly plantActions: Locator;
  readonly plantActionsAddToShed: Locator;
  readonly taskActions: Locator;

  constructor(page: Page) {
    this.page = page;

    this.fab = page.locator('[data-testid="plant-doctor-chat-fab"]');
    this.panel = page.locator('[data-testid="plant-doctor-chat-panel"]');
    this.input = page.locator('[data-testid="chat-input"]');
    this.sendButton = page.locator('[data-testid="chat-send"]');
    this.attachImageButton = page.locator('[data-testid="chat-attach-image-btn"]');

    this.contextChip = page.locator('[data-testid="chat-plant-context-chip"]');
    this.contextClear = page.locator('[data-testid="chat-plant-context-clear"]');

    this.planSuggestionCard = page.locator('[data-testid="chat-plan-suggestion"]');
    this.planSuggestionAccept = page.locator(
      '[data-testid="chat-plan-suggestion-accept"]',
    );
    this.planSuggestionDismiss = page.locator(
      '[data-testid="chat-plan-suggestion-dismiss"]',
    );

    this.plantActions = page.locator('[data-testid="chat-plant-actions"]');
    this.plantActionsAddToShed = page.locator(
      '[data-testid="chat-plant-actions-add-to-shed"]',
    );
    this.taskActions = page.locator('[data-testid="chat-task-actions"]');
  }

  /** All user-role message bubbles, scoped to the chat panel. */
  userBubbles(): Locator {
    return this.panel.locator('[data-testid="chat-message-user"]');
  }

  /** All assistant-role message bubbles, scoped to the chat panel. */
  assistantBubbles(): Locator {
    return this.panel.locator('[data-testid="chat-message-assistant"]');
  }

  /** Open the chat by clicking the FAB. No-op if already open. */
  async openChat() {
    if (await this.panel.isVisible({ timeout: 1000 }).catch(() => false)) return;
    await this.fab.click();
    await this.panel.waitFor({ state: "visible", timeout: 8000 });
  }

  /** Close the chat by clicking its header X button. */
  async closeChat() {
    await this.page.locator('[data-testid="plant-doctor-chat-close"]').click();
    await this.panel.waitFor({ state: "hidden", timeout: 5000 });
  }

  /** Type a message and click send. */
  async sendMessage(text: string) {
    await this.input.fill(text);
    await this.sendButton.click();
  }
}
