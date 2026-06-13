import { test, expect } from "../fixtures/welcome-modal-ready";
import { WelcomeModalPage } from "../pages/WelcomeModalPage";

// ─────────────────────────────────────────────────────────────────────────
// welcome-modal.spec.ts
//
// Covers the first-run WelcomeModal on /src/components/WelcomeModal.tsx
// (catalog rows R3-001 through R3-009). The modal renders 5 slides:
//   idx 0 — Welcome to Rhozly
//   idx 1 — Your garden, organised (hierarchy diagram)
//   idx 2 — Tasks that run themselves (task flow diagram)
//   idx 3 — Quick question first (persona picker)
//   idx 4 — Let's get started (CTA: Garden Quiz / Skip)
//
// The welcomeModalReadyPage fixture mocks the user_profiles + locations
// reads so App.tsx satisfies the modal trigger:
//   profile.home_id present, onboarding_state.welcome_modal absent,
//   locations.length === 0.
// ─────────────────────────────────────────────────────────────────────────

test.describe("WelcomeModal — first-run onboarding", () => {
  test("R3-001 — Modal mounts when trigger conditions hold", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    await expect(modal.root).toBeVisible();
    await expect(modal.title).toHaveText(/Welcome to Rhozly/i);
    await expect(modal.dot(0)).toBeVisible();
    await expect(modal.dot(4)).toBeVisible();
  });

  test("R3-002 — Next/Back step through slides 0 → 1 → 2 → 3 → 4", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    await expect(modal.title).toHaveText(/Welcome to Rhozly/i);

    await modal.nextButton.click();
    await expect(modal.title).toHaveText(/Your garden, organised/i);

    await modal.nextButton.click();
    await expect(modal.title).toHaveText(/Tasks that run themselves/i);

    await modal.nextButton.click();
    await expect(modal.title).toHaveText(/Quick question first/i);

    await modal.nextButton.click();
    await expect(modal.title).toHaveText(/Let.?s get started/i);

    // On the final slide the start-quiz CTA replaces the Next button.
    await expect(modal.nextButton).toBeHidden();
    await expect(modal.startQuizButton).toBeVisible();
    await expect(modal.skipButton).toBeVisible();
  });

  test("R3-003 — Back button is disabled on the first slide", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    // The button uses `disabled:opacity-0 disabled:pointer-events-none` so it's
    // disabled in the DOM even if not visible.
    await expect(modal.prevButton).toBeDisabled();
  });

  test("R3-004 — Dot indicators jump directly to the chosen slide", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    await modal.dot(2).click();
    await expect(modal.title).toHaveText(/Tasks that run themselves/i);

    await modal.dot(0).click();
    await expect(modal.title).toHaveText(/Welcome to Rhozly/i);
  });

  test("R3-005 — Persona slide accepts a selection and surfaces aria-pressed", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    await modal.advance(3); // slides 1, 2, 3 → persona slide
    await expect(modal.title).toHaveText(/Quick question first/i);

    await expect(modal.personaNew).toHaveAttribute("aria-pressed", "false");
    await modal.personaNew.click();
    await expect(modal.personaNew).toHaveAttribute("aria-pressed", "true");

    await modal.personaExperienced.click();
    await expect(modal.personaNew).toHaveAttribute("aria-pressed", "false");
    await expect(modal.personaExperienced).toHaveAttribute("aria-pressed", "true");
  });

  test("R3-006 — Close (X) button issues a dismissed PATCH and closes the modal", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    const patches: string[] = [];
    await welcomeModalReadyPage.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        patches.push(req.postData() ?? "");
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fallback();
    });

    await modal.waitForOpen();
    // The X button is on every slide and shares the dismiss handler with the
    // last-slide "Skip for now" button.
    await modal.closeButton.click();

    await modal.waitForClosed();
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[patches.length - 1]).toContain("dismissed");
  });

  test("R3-007 — Start Quiz button issues a completed PATCH then navigates to /profile", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    const patches: string[] = [];
    await welcomeModalReadyPage.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        patches.push(req.postData() ?? "");
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fallback();
    });

    await modal.waitForOpen();
    // Walk to the last slide (idx 4). The persona slide is idx 3 — we don't
    // need to pick a persona for the completion handler to fire.
    await modal.advance(4);
    await expect(modal.startQuizButton).toBeVisible();
    await modal.startQuizButton.click();

    await modal.waitForClosed();
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[patches.length - 1]).toContain("completed");
    await expect(welcomeModalReadyPage).toHaveURL(/\/profile/);
  });

  test("R3-008 — Persona selection is included in the PATCH body", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    const patches: string[] = [];
    await welcomeModalReadyPage.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "PATCH") {
        patches.push(req.postData() ?? "");
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fallback();
    });

    await modal.waitForOpen();
    await modal.advance(3);
    await modal.personaExperienced.click();
    await modal.nextButton.click();
    await modal.startQuizButton.click();

    await modal.waitForClosed();
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    const last = patches[patches.length - 1];
    expect(last).toContain("experienced");
    expect(last).toContain("welcomed_at");
  });

  test("R3-009 — Modal traps focus inside its dialog", async ({ welcomeModalReadyPage }) => {
    const modal = new WelcomeModalPage(welcomeModalReadyPage);
    await modal.waitForOpen();

    // Tab a handful of times — focus should remain inside the dialog
    // because useFocusTrap loops it.
    for (let i = 0; i < 10; i++) {
      await welcomeModalReadyPage.keyboard.press("Tab");
    }

    const focusedInsideDialog = await welcomeModalReadyPage.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(dialog && active && dialog.contains(active));
    });
    expect(focusedInsideDialog).toBe(true);
  });
});
