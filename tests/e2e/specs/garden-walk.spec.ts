import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { GardenWalkPage } from "../pages/GardenWalkPage";
import { resetWalkState, setWalkPersona } from "../utils/walkSeedReset";
import { mockEdgeFunction } from "../fixtures/api-mocks";

// Garden Walk coverage.
//
// RHO-17 (Garden Walk v2, Phase 1): hierarchical route — Home section
// card → per-Location cards → per-Area cards → plant cards → unassigned
// plants → summary. Section cards carry task rows (complete / postpone /
// skip), note + photo capture, and Continue / Skip-section. A same-day
// open session offers Resume vs Start fresh.
//
// Also retains regression coverage — RHO-6 (Snap sheet scroll/focus),
// RHO-7 (return to origin on exit), RHO-8 ("Back" label on empty/error).
//
// Relevant seeds:
//   01_locations_areas.sql  — Outside Garden / Indoor Space + areas
//   02_plants_shed.sql      — 6 plants (dashboard walk launcher needs >= 5)
//   03_tasks_blueprints.sql — TASK_UNASSIGNED ("Sweep the Potting Bench",
//                             home step) + TASK_PERSONAL ("Sharpen Your
//                             Secateurs", personal scope, home step)
//
// Each test resets walk sessions/visits (service role) so same-day visit
// rows never leak between tests — the route rebuild is visit-derived.

test.describe("Garden Walk — hierarchical route (RHO-17)", () => {
  test.beforeEach(async () => {
    await resetWalkState();
  });

  test("WALK-020: the walk opens on the Home section card, then descends into location and area cards", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Home card first.
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");
    await expect(walk.sectionTitle).toHaveText(/Your garden/i);

    // Continue → a location card.
    await walk.sectionContinue.click();
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "location", { timeout: 10000 });

    // Continue → an area card within that location.
    await walk.sectionContinue.click();
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "area", { timeout: 10000 });
  });

  test("WALK-021: the Home card lists unassigned and personal tasks; completing one marks the row Done", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");

    // Seeded home-step tasks: unassigned + personal (labelled).
    const unassignedRow = authenticatedPage
      .getByTestId(/walk-task-row-/)
      .filter({ hasText: "Sweep the Potting Bench" })
      .first();
    const personalRow = authenticatedPage
      .getByTestId(/walk-task-row-/)
      .filter({ hasText: "Sharpen Your Secateurs" })
      .first();
    await expect(unassignedRow).toBeVisible({ timeout: 10000 });
    await expect(personalRow).toBeVisible();
    await expect(personalRow.getByText("Personal", { exact: false })).toBeVisible();

    // Complete the unassigned task in-card — the row resolves to Done.
    await unassignedRow.locator('[data-testid^="walk-task-complete-"]').click();
    await expect(unassignedRow).toHaveAttribute("data-state", "completed", { timeout: 10000 });
  });

  test("WALK-022: skipping a location section jumps past all its areas and plants", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Home → first location card.
    await walk.sectionContinue.click();
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "location", { timeout: 10000 });
    const skippedLocation = (await walk.sectionTitle.textContent())?.trim() ?? "";

    // Skip the whole section — the next card must never belong to the
    // skipped location (its area cards and plant cards are jumped).
    await walk.sectionSkip.click();
    await authenticatedPage.waitForTimeout(300);

    if (await walk.sectionCard.isVisible().catch(() => false)) {
      const kind = await walk.sectionCard.getAttribute("data-section-kind");
      if (kind === "area") {
        await expect(walk.sectionCard).not.toContainText(skippedLocation);
      } else if (kind === "location") {
        await expect(walk.sectionTitle).not.toHaveText(skippedLocation);
      }
    } else if (await walk.card.isVisible().catch(() => false)) {
      // A plant card — must be from the unassigned section or another
      // location, so its section label can't be inside the skipped one.
      await expect(
        authenticatedPage.getByTestId("walk-card-section-label"),
      ).not.toContainText(skippedLocation);
    } else {
      // Nothing after the skipped section — the summary shows it as skipped earlier.
      await expect(walk.summary).toBeVisible({ timeout: 10000 });
      await expect(
        authenticatedPage.getByTestId("walk-summary-skipped"),
      ).toContainText(skippedLocation);
    }
  });

  test("WALK-024: a note saved from a section card stays on the card and bumps nothing else", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    await walk.sectionNote.click();
    await expect(walk.sectionNoteSheet).toBeVisible({ timeout: 10000 });
    await walk.sectionNoteInput.fill("RHO-17 E2E section note — greenhouse door squeaks");
    await walk.sectionNoteSave.click();

    // The sheet closes and the walk stays on the same section card (notes
    // don't advance sections — Continue/Skip do).
    await expect(walk.sectionNoteSheet).not.toBeVisible({ timeout: 10000 });
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");
  });

  test("WALK-025: leaving mid-walk offers Resume on return; resumed walks drop completed sections", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Mark the Home section done, then abandon the walk (no Stop —
    // navigate away, leaving the session open).
    await walk.sectionContinue.click();
    await expect(walk.anyCard.first()).toBeVisible({ timeout: 10000 });
    await authenticatedPage.goto("/dashboard?view=overview");

    // Relaunch → same-day open session → resume prompt.
    await authenticatedPage.getByTestId("dash-garden-walk").click();
    await expect(walk.resumePrompt).toBeVisible({ timeout: 15000 });

    // Resume: the Home card was section_done earlier today, so the walk
    // reopens on the next section instead.
    await walk.resumeContinue.click();
    await walk.loading.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    await expect(walk.anyCard.first()).toBeVisible({ timeout: 15000 });
    if (await walk.sectionCard.isVisible().catch(() => false)) {
      const kind = await walk.sectionCard.getAttribute("data-section-kind");
      expect(kind).not.toBe("home");
    }
  });

  test("WALK-026: skipped sections reappear on 'Walk what's left'", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Skip the Home section, then stop the walk immediately.
    await walk.sectionSkip.click();
    await authenticatedPage.waitForTimeout(300);
    await walk.stopButton.click();
    await expect(walk.summary).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("walk-summary-skipped")).toContainText("Home");

    // Walk what's left → the skipped Home section comes back (flagged).
    await authenticatedPage.getByTestId("walk-summary-again").click();
    await walk.waitForCardOrEmpty();
    if (await walk.sectionCard.isVisible().catch(() => false)) {
      await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");
      await expect(
        authenticatedPage.getByTestId("walk-section-skipped-earlier"),
      ).toBeVisible();
    }
  });
});

// ─── RHO-17 Phase 2 — telemetry, valve control & manual readings ────────────
//
// The walk bootstrap calls home-overview with `view: "walk"` for a flat
// devices[] payload (sensor summaries + valve states). These tests mock
// that call (same mockEdgeFunction pattern as HOME-008) so device chips
// and valve rows render deterministically without hardware, and mock the
// valve-control edge function so no real command is issued.

const SENSOR_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VALVE_ID = "aaaaaaaa-0000-4000-8000-000000000002";

/** Walk-view payload: one unassigned soil sensor + one unassigned eWeLink
 *  valve — both land on the Home card, the first card of every walk. */
function walkOverviewPayload() {
  return {
    locations: [],
    attention: [],
    devices: [
      {
        id: SENSOR_ID,
        name: "Potting Shed Probe",
        deviceType: "soil_sensor",
        areaId: null,
        locationId: null,
        batteryPercent: 76,
        sensor: { moisture: 44, tempC: 17.2, ec: null, batteryPercent: 76, readingAgeMin: 15 },
        valve: null,
        provider: "ecowitt",
        controllable: false,
        defaultDurationSeconds: 1800,
      },
      {
        id: VALVE_ID,
        name: "Main Tap Valve",
        deviceType: "water_valve",
        areaId: null,
        locationId: null,
        batteryPercent: null,
        sensor: null,
        valve: { state: "idle", runningUntil: null, lastRunAt: null, nextRunAt: null },
        provider: "ewelink",
        controllable: false,
        defaultDurationSeconds: 900,
      },
    ],
  };
}

test.describe("Garden Walk — telemetry & readings (RHO-17 Phase 2)", () => {
  test.beforeEach(async () => {
    await resetWalkState();
  });

  test("WALK-030: sensor chips and valve rows render on the Home card from the walk-view payload", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "home-overview", walkOverviewPayload());

    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");

    // Devices panel with the sensor chip (moisture % + band, AreaRow visual language).
    await expect(walk.sectionDevices).toBeVisible({ timeout: 10000 });
    const sensorChip = authenticatedPage.getByTestId(`walk-sensor-chip-${SENSOR_ID}`);
    await expect(sensorChip).toBeVisible();
    await expect(sensorChip).toContainText("44%");
    await expect(sensorChip).toContainText("OK");

    // Valve row with duration presets + open control (approved answer 2).
    await expect(authenticatedPage.getByTestId(`walk-valve-row-${VALVE_ID}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`walk-valve-duration-5-${VALVE_ID}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`walk-valve-duration-10-${VALVE_ID}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`walk-valve-custom-${VALVE_ID}`)).toBeVisible();
    await expect(authenticatedPage.getByTestId(`walk-valve-open-${VALVE_ID}`)).toBeVisible();
  });

  test("WALK-031: opening a valve with a preset duration calls the existing control path; Close returns it to idle", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "home-overview", walkOverviewPayload());
    // The exact function ValveControlPanel uses for eWeLink valves — the
    // walk must reuse it, never a new control route.
    await mockEdgeFunction(authenticatedPage, "integrations-ewelink-control", {
      success: true,
      autoOffAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    const valveRow = authenticatedPage.getByTestId(`walk-valve-row-${VALVE_ID}`);
    await expect(valveRow).toBeVisible({ timeout: 10000 });
    await expect(valveRow).toHaveAttribute("data-valve-state", "idle");

    // Open for 5 minutes.
    await authenticatedPage.getByTestId(`walk-valve-duration-5-${VALVE_ID}`).click();
    await authenticatedPage.getByTestId(`walk-valve-open-${VALVE_ID}`).click();
    await expect(valveRow).toHaveAttribute("data-valve-state", "running", { timeout: 10000 });
    await expect(valveRow).toContainText(/Watering/i);
    await expect(authenticatedPage.getByTestId(`walk-valve-close-${VALVE_ID}`)).toBeVisible();

    // Close now.
    await authenticatedPage.getByTestId(`walk-valve-close-${VALVE_ID}`).click();
    await expect(valveRow).toHaveAttribute("data-valve-state", "idle", { timeout: 10000 });
    await expect(authenticatedPage.getByTestId(`walk-valve-open-${VALVE_ID}`)).toBeVisible();
  });

  test("WALK-032: a manual soil reading saved from an area card is stamped now and closes the sheet", async ({ authenticatedPage }) => {
    await mockEdgeFunction(authenticatedPage, "home-overview", walkOverviewPayload());

    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    const reachedArea = await walk.advanceToAreaCard();
    test.skip(!reachedArea, "No area card in the current seed state");

    // Every area card offers manual capture (with or without hardware).
    await expect(authenticatedPage.getByTestId("walk-area-readings")).toBeVisible();
    await walk.logReadingButton.click();
    await expect(walk.readingSheet).toBeVisible({ timeout: 10000 });

    await walk.readingMoisture.fill("44");
    await walk.readingTemp.fill("17.5");
    await walk.readingEc.fill("850");

    // Bed profile (2026-07-18): expand, change pH + water movement. Pick a
    // pH that DIFFERS from the prefilled value so the diff-save always has
    // a change regardless of what a previous run persisted.
    await walk.profileToggle.click();
    await expect(walk.profilePh).toBeVisible();
    const currentPh = await walk.profilePh.inputValue();
    const newPh = currentPh === "6.1" ? "6.2" : "6.1";
    await walk.profilePh.fill(newPh);
    const currentWater = await walk.profileWater.inputValue();
    const newWater = currentWater === "Recirculating" ? "Static" : "Recirculating";
    await walk.profileWater.selectOption(newWater);
    await walk.readingSave.click();

    // Sheet closes; the walk stays on the same area card (readings don't
    // advance sections — Continue / Skip do) and confirms with a toast.
    await expect(walk.readingSheet).not.toBeVisible({ timeout: 10000 });
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "area");
    await expect(
      authenticatedPage.getByText(/Reading \+ bed profile saved for/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Persistence: re-open the sheet — the prefill reads fresh from the DB,
    // so seeing the new values proves the areas.update landed.
    await walk.logReadingButton.click();
    await expect(walk.readingSheet).toBeVisible({ timeout: 10000 });
    await walk.profileToggle.click();
    await expect(walk.profilePh).toHaveValue(newPh, { timeout: 10000 });
    await expect(walk.profileWater).toHaveValue(newWater);
    await authenticatedPage.getByTestId("walk-reading-close").click();
  });
});

test.describe("Garden Walk — return navigation (RHO-7/8)", () => {
  test.beforeEach(async () => {
    await resetWalkState();
  });

  test("WALK-001: launched from the dashboard, the walk returns to /dashboard on exit", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();

    // We should be on /walk now.
    await expect(authenticatedPage).toHaveURL(/\/walk/, { timeout: 10000 });
    await walk.waitForCardOrEmpty();

    if (await walk.anyCard.first().isVisible().catch(() => false)) {
      // Walking → Stop finishes the walk and shows the summary; Done returns.
      await walk.stopButton.click();
      const doneBtn = authenticatedPage.getByRole("button", { name: /Done/i }).first();
      await doneBtn.waitFor({ state: "visible", timeout: 10000 });
      await doneBtn.click();
    } else {
      // Empty → the "Back" button returns to origin.
      await expect(walk.emptyBackButton).toBeVisible({ timeout: 10000 });
      await walk.emptyBackButton.click();
    }

    // RHO-7: origin was preserved as /dashboard — not the /quick fallback.
    await expect(authenticatedPage).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(authenticatedPage).not.toHaveURL(/\/quick/);
  });

  test("WALK-002: the empty-state exit button reads 'Back', not 'Back to Quick Menu'", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    // Only assert on the empty branch; when a card is present there's nothing
    // to walk-complete deterministically here (covered by WALK-001).
    if (await walk.empty.isVisible().catch(() => false)) {
      await expect(walk.emptyBackButton).toBeVisible({ timeout: 10000 });
      await expect(walk.emptyBackButton).toHaveText(/^\s*Back\s*$/);
      await expect(authenticatedPage.getByText("Back to Quick Menu")).not.toBeVisible();
    }
  });
});

test.describe("Garden Walk — Snap sheet scroll & focus (RHO-6)", () => {
  test.beforeEach(async () => {
    await resetWalkState();
  });

  test("WALK-010: opening the Snap sheet brings its scroll body into view and focus", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    // RHO-17: plant cards now sit behind the section cards — continue
    // through the hierarchy to reach one. Skip cleanly if the seed
    // produced no plant card.
    const reachedPlant = await walk.advanceToPlantCard();
    test.skip(!reachedPlant, "No walkable plant in the current seed state");

    await walk.snapAction.click();

    // RHO-6: the sheet's own overflow-y-auto body is anchored + scrolled into
    // view, and focus moves inside the newly-mounted section.
    await expect(walk.snapSheet).toBeVisible({ timeout: 10000 });
    await expect(walk.snapSheetBody).toBeVisible({ timeout: 10000 });

    // RHO-6 scrolls the body into view with behavior:"smooth" — poll until
    // the animation lands (reaching the plant card through the RHO-17
    // section cards leaves the outer container scrolled further down than
    // the old first-card flow did).
    await expect
      .poll(
        () =>
          walk.snapSheetBody.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.top < window.innerHeight;
          }),
        { timeout: 10000 },
      )
      .toBe(true);
  });
});

// ─── RHO-17 Phase 3 — watchlist weaving, actionable plans & harvest ─────────
//
// Seeds exercised:
//   06_ailments_watchlist.sql — 3 active ailments (Aphid / Early Blight /
//     Japanese Knotweed) + Powdery Mildew ARCHIVED (must not render)
//   09_stats.sql              — Basil (Raised Bed A) → Aphid active link
//   05_planner.sql + 12       — "Summer Veg Plan" In Progress with
//     staging_state.linked_area_id = Raised Bed A (phase 2 · The Shed)
//   03_tasks_blueprints.sql   — "Harvest Tomatoes" (due today, window +7d)
//     linked to the UNASSIGNED Tomato instance → its plant card carries
//     the in-walk harvest experience
//
// resetWalkState restores the harvest task, deletes test-logged Tomato
// yield rows and resets persona to null (⇒ "new") before every test.

test.describe("Garden Walk — watchlist, plans & harvest (RHO-17 Phase 3)", () => {
  test.beforeEach(async () => {
    await resetWalkState();
  });

  test("WALK-040: the Home card's 'look out for' digest lists active watchlist ailments with link counts; archived excluded", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");

    await expect(walk.watchlistPanel).toBeVisible({ timeout: 10000 });
    await expect(walk.watchlistPanel).toHaveAttribute("data-variant", "home");
    await expect(walk.watchlistPanel).toContainText("Look out for");
    await expect(walk.watchlistPanel).toContainText("Aphid");
    await expect(walk.watchlistPanel).toContainText("Early Blight");
    await expect(walk.watchlistPanel).toContainText("Japanese Knotweed");
    // Archived ailments never surface in the walk.
    await expect(walk.watchlistPanel).not.toContainText("Powdery Mildew");

    // Basil → Aphid seed link (09_stats) → "1 plant" count chip.
    const aphidRow = authenticatedPage
      .getByTestId(/walk-watchlist-item-/)
      .filter({ hasText: "Aphid" })
      .first();
    await expect(aphidRow).toContainText("1 plant");

    // Default persona is null ⇒ "new": symptom hints + guidance prose show.
    await expect(aphidRow).toContainText(/Look for:/i);
    await expect(walk.watchlistGuidance).toBeVisible();
  });

  test("WALK-041: the Home card digests In-Progress plans; the staged area carries an actionable plan banner", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );
    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");

    // Home digest: Summer Veg Plan (In Progress) with its phase line.
    // Seed 12 pre-completes Phase 1 (linked_area_id = Raised Bed A) and
    // status In Progress marks Phase 4 done → current phase is 2 (The Shed).
    await expect(walk.sectionPlans).toBeVisible({ timeout: 10000 });
    const homeBanner = authenticatedPage
      .getByTestId(/walk-plan-banner-/)
      .filter({ hasText: "Summer Veg Plan" })
      .first();
    await expect(homeBanner).toBeVisible();
    await expect(homeBanner).toHaveAttribute("data-variant", "home");
    await expect(homeBanner).toContainText(/Phase 2 of 5/i);
    // Completed/Archived plans never surface.
    await expect(walk.sectionPlans).not.toContainText("Spring Cleanup");
    await expect(walk.sectionPlans).not.toContainText("Winter Prep");

    // Walk to Raised Bed A — its area card carries the actionable banner
    // ("Part of …" + Open plan deep-link back to the Planner).
    const areaBanner = authenticatedPage
      .getByTestId(/walk-plan-banner-/)
      .filter({ hasText: "Part of Summer Veg Plan" })
      .first();
    const found = await walk.advanceUntilVisible(areaBanner, 20);
    test.skip(!found, "Raised Bed A not reachable in the current seed state");

    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "area");
    await expect(areaBanner).toHaveAttribute("data-variant", "area");
    await expect(areaBanner).toContainText(/Phase 2 of 5/i);
    await expect(
      areaBanner.locator('[data-testid^="walk-plan-open-"]'),
    ).toBeVisible();
    // Phase 2 is a staging-UI phase — no in-walk advance button; the walk
    // only lifts Phase 5 (Activate maintenance).
    await expect(
      areaBanner.locator('[data-testid^="walk-plan-activate-"]'),
    ).not.toBeVisible();
  });

  test("WALK-042: area ailment context chips show for the bed's flagged plants", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Raised Bed A holds Basil, which has the seeded active Aphid link.
    const areaWatchlist = authenticatedPage
      .getByTestId("walk-watchlist-panel")
      .filter({ hasText: "Flagged in this bed" });
    const found = await walk.advanceUntilVisible(areaWatchlist.first(), 20);
    test.skip(!found, "No flagged area card reachable in the current seed state");

    await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "area");
    await expect(areaWatchlist.first()).toContainText("Aphid");
    await expect(areaWatchlist.first()).toContainText("1 plant");
  });

  test("WALK-043: a harvest-window task opens the full harvest strip; Picked some logs a partial yield and snoozes the task", async ({ authenticatedPage }) => {
    const walk = new GardenWalkPage(authenticatedPage);
    await walk.startFromDashboard();
    await walk.waitForCardOrEmpty();

    test.skip(
      !(await walk.sectionCard.isVisible().catch(() => false)),
      "No walkable route in the current seed state",
    );

    // Hunt the "Harvest Tomatoes" row (Tomato is unassigned → its plant
    // card sits in the trailing unassigned-plants section).
    const harvestRow = authenticatedPage
      .getByTestId(/walk-task-row-/)
      .filter({ hasText: "Harvest Tomatoes" })
      .first();
    const found = await walk.advanceUntilVisible(harvestRow, 25);
    test.skip(!found, "Harvest Tomatoes not on today's route in the current seed state");

    // In-window harvest rows get the Harvest button (no generic complete).
    await harvestRow.locator('[data-testid^="walk-task-harvest-"]').click();
    const strip = authenticatedPage.getByTestId(/walk-harvest-strip-/).first();
    await expect(strip).toBeVisible({ timeout: 10000 });
    await expect(strip.locator('[data-testid^="walk-harvest-harvested-"]')).toBeVisible();
    await expect(strip.locator('[data-testid^="walk-harvest-notyet-"]')).toBeVisible();
    await expect(strip.locator('[data-testid^="walk-harvest-ai-"]')).toBeVisible();

    // Picked some → the SAME HarvestPartialPickSheet Task Detail mounts.
    await strip.locator('[data-testid^="walk-harvest-partial-"]').click();
    await expect(authenticatedPage.getByTestId("harvest-partial-value")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("harvest-partial-value").fill("250");
    await authenticatedPage.getByTestId("harvest-partial-snooze-3").click();
    await authenticatedPage.getByTestId("harvest-partial-submit").click();

    // The yield insert + snooze resolve the row in place (Snoozed).
    await expect(harvestRow).toHaveAttribute("data-state", "snoozed", { timeout: 15000 });
    await expect(harvestRow).toContainText("Snoozed");
  });

  test("WALK-044: the experienced persona compacts the walk copy (no symptom hints or guidance prose)", async ({ authenticatedPage }) => {
    await setWalkPersona("experienced");
    try {
      const walk = new GardenWalkPage(authenticatedPage);
      await walk.startFromDashboard();
      await walk.waitForCardOrEmpty();

      test.skip(
        !(await walk.sectionCard.isVisible().catch(() => false)),
        "No walkable route in the current seed state",
      );
      await expect(walk.sectionCard).toHaveAttribute("data-section-kind", "home");

      // Watchlist stays (same data) but the "new" prose is gone.
      await expect(walk.watchlistPanel).toBeVisible({ timeout: 10000 });
      await expect(walk.watchlistGuidance).not.toBeVisible();
      await expect(
        authenticatedPage.getByTestId(/walk-watchlist-symptom-/).first(),
      ).not.toBeVisible();
    } finally {
      await setWalkPersona(null);
    }
  });
});
