import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { PlantDoctorChatPage } from "../pages/PlantDoctorChatPage";
import {
  mockEdgeFunction,
  MOCK_PLANT_DOCTOR_AI_TEXT,
  MOCK_PLANT_DOCTOR_AI_ADD_TO_SHED,
} from "../fixtures/api-mocks";
import { resetChatHistory } from "../utils/chatSeedReset";

// ─────────────────────────────────────────────────────────────────────────
// plant-doctor-chat.spec.ts
//
// Regression net for the floating "Garden AI" chat (`PlantDoctorChat.tsx`).
// Covers the 22.0023 regressions:
//   • duplicate-on-reload (each assistant turn rendered exactly once)
//   • shed-offer mandatory rule (plant-not-in-Shed → Add to Shed button)
//   • task-offer mandatory rule (care advice → Add to Schedule button)
//
// Edge function `plant-doctor-ai` is stubbed via `mockEdgeFunction()`.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Plant Doctor Chat — regression net", () => {
  test.beforeEach(async () => {
    await resetChatHistory();
  });

  test("CHAT-001: FAB opens the chat panel", async ({ authenticatedPage }) => {
    const chat = new PlantDoctorChatPage(authenticatedPage);
    await expect(chat.fab).toBeVisible();
    await chat.openChat();
    await expect(chat.panel).toBeVisible();
  });

  test("CHAT-002: sending a text message renders a user bubble + the mocked assistant reply", async ({
    authenticatedPage,
  }) => {
    await mockEdgeFunction(
      authenticatedPage,
      "agent-chat",
      MOCK_PLANT_DOCTOR_AI_TEXT,
    );

    const chat = new PlantDoctorChatPage(authenticatedPage);
    await chat.openChat();
    await chat.sendMessage("How often should I water tomatoes?");

    // On a fresh chat the welcome bubble (assistant) renders first, then
    // the send round-trip adds: user message + AI reply. So we expect
    // 1 user bubble + 2 assistant bubbles (welcome + mocked reply).
    await expect(chat.userBubbles()).toHaveCount(1, { timeout: 8000 });
    await expect(chat.assistantBubbles()).toHaveCount(2, { timeout: 15000 });
    await expect(chat.assistantBubbles().nth(1)).toContainText(/tomatoes/i);
  });

  test("CHAT-003: a page reload after send renders the assistant reply exactly once (22.0023)", async ({
    authenticatedPage,
  }) => {
    await mockEdgeFunction(
      authenticatedPage,
      "agent-chat",
      MOCK_PLANT_DOCTOR_AI_TEXT,
    );

    const chat = new PlantDoctorChatPage(authenticatedPage);
    await chat.openChat();
    await chat.sendMessage("Quick watering tip?");
    // Welcome (1) + AI reply (2) — wait so the persist round-trip finishes.
    await expect(chat.assistantBubbles()).toHaveCount(2, { timeout: 15000 });

    // Reload the page so PlantDoctorChat fully unmounts and the cold-open
    // history fetch fires — this is where the pre-22.0023 bug
    // double-rendered the assistant turn (one from a duplicated DB row,
    // one from the local optimistic state).
    await authenticatedPage.reload();
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Reapply the mock — page.route() persists across reloads, but we
    // want to be defensive in case any future test framework change
    // resets routes on navigation.
    await mockEdgeFunction(authenticatedPage, "agent-chat", MOCK_PLANT_DOCTOR_AI_TEXT);

    const chatAfter = new PlantDoctorChatPage(authenticatedPage);
    await chatAfter.openChat();

    // Cold open with non-empty history → welcome is suppressed.
    // We expect exactly 1 user bubble + 1 assistant bubble (the stored
    // AI reply). Two assistants would be the 22.0023 regression.
    await expect(chatAfter.userBubbles()).toHaveCount(1, { timeout: 10000 });
    await expect(chatAfter.assistantBubbles()).toHaveCount(1);
  });

  test("CHAT-006: Cucumber-not-in-Shed reply renders the tool-confirm card for add_plant_to_shed (22.0023)", async ({
    authenticatedPage,
  }) => {
    // Wave 22.0023 — when the user mentions a plant not in their Shed, the
    // agent's mandatory rule is to surface an `add_plant_to_shed` tool call.
    // The chat renders that as an inline ToolConfirmCard with confirm + cancel.
    await mockEdgeFunction(
      authenticatedPage,
      "agent-chat",
      MOCK_PLANT_DOCTOR_AI_ADD_TO_SHED,
    );

    const chat = new PlantDoctorChatPage(authenticatedPage);
    await chat.openChat();
    await chat.sendMessage("Should I add cucumbers to my garden?");

    // The mocked reply lands as the second assistant bubble; its text
    // mentions cucumbers.
    await expect(chat.assistantBubbles().nth(1)).toContainText(/cucumber/i, {
      timeout: 15000,
    });

    // The tool-call confirm card surfaces with Confirm + Cancel buttons.
    // The mock's pending call id is "test-call-cucumber-001".
    await expect(
      authenticatedPage.locator('[data-testid="tool-confirm-test-call-cucumber-001"]'),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      authenticatedPage.locator('[data-testid="tool-confirm-btn-test-call-cucumber-001"]'),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[data-testid="tool-cancel-btn-test-call-cucumber-001"]'),
    ).toBeVisible();
  });

  test("CHAT-009: page-context chip is hidden on the dashboard (no plant context set)", async ({
    authenticatedPage,
  }) => {
    // The dashboard sets `pageContext = { page: "dashboard" }` — no plant
    // chip. Surfaces like InstanceEditModal would set `currentPlant`, but
    // dashboard is the smoke baseline: chip must NOT render here.
    const chat = new PlantDoctorChatPage(authenticatedPage);
    await chat.openChat();
    await expect(chat.contextChip).toBeHidden();
  });

  test("CHAT-010: cold open loads two pre-seeded turns from `chat_messages`", async ({
    authenticatedPage,
  }) => {
    // Per-test reset already cleared the table; replace with two seeded
    // turns before navigating to /dashboard for the chat to fetch.
    await resetChatHistory([
      { role: "user",      content: "Pre-seeded user turn ABC123" },
      { role: "assistant", content: "Pre-seeded assistant turn DEF456" },
    ]);

    // Hard-reload the page so the cold open fetch fires.
    await authenticatedPage.reload();
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const chat = new PlantDoctorChatPage(authenticatedPage);
    await chat.openChat();

    await expect(chat.userBubbles()).toHaveCount(1, { timeout: 10000 });
    await expect(chat.assistantBubbles()).toHaveCount(1);
    await expect(chat.userBubbles().first()).toContainText("ABC123");
    await expect(chat.assistantBubbles().first()).toContainText("DEF456");
  });
});
