import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { WatchlistPage } from "../pages/WatchlistPage";
import { NurseryPage } from "../pages/NurseryPage";

// Cross-home favourites — Phase 1 (plants). docs/plans/cross-home-favourites.md
//
// Relevant seeds:
//   02_plants_shed.sql — 6 home plants (Tomato manual, Lavender api, …)
//   13_ai_freshness.sql — Cherry Tomato AI shallow fork ({w+1}00011)
//   15_favourites.sql  — favourites fixtures (0017 segment):
//     * Tomato favourite (live ref → the seeded manual Tomato)
//     * Snapdragon TOMBSTONE favourite (plant_id NULL, snapshot only)
//     * W1 only: second home "Rooftop Terrace" + Fig plant + Fig favourite

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
const plantBase = workerNum + 1; // seeded plant ids are {w+1}00000{n}

const HOME_1_ID = `0000000${workerNum}-0000-0000-0000-000000000002`;
const SECOND_HOME_ID = "00000001-0000-0000-0000-000000000022"; // W1 only

/** Force a Sprout profile (both tier flags off) via route interception —
 *  same pattern as dashboard.spec.ts DASH-043. */
async function forceSprout(page: import("@playwright/test").Page) {
  await page.route(/\/rest\/v1\/user_profiles\?select=uid/, async (route) => {
    const resp = await route.fetch();
    let body: any = null;
    try {
      body = await resp.json();
    } catch {
      return route.fulfill({ response: resp });
    }
    const patchRow = (row: any) => ({
      ...row,
      ai_enabled: false,
      enable_perenual: false,
      subscription_tier: "sprout",
    });
    const patched = Array.isArray(body) ? body.map(patchRow) : body ? patchRow(body) : body;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { ...resp.headers() },
      body: JSON.stringify(patched),
    });
  });
  await page.route(/user_profiles\?select=subscription_tier&/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subscription_tier: "sprout" }),
    }),
  );
}

test.describe("Cross-home favourites (Section FAV)", () => {
  test("FAV-001: /shed?scope=favourites deep link lands on the Favourites scope with seeded fixtures", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.gotoFavourites();
    await shed.waitForLoad();

    await expect(shed.favouritesGrid).toBeVisible({ timeout: 15000 });
    await expect(shed.scopeToggle).toBeVisible();

    // Seeded fixtures render — live ref (Tomato) + tombstone (Snapdragon).
    const tomato = shed.favouriteCard("Tomato");
    const snapdragon = shed.favouriteCard("Snapdragon");
    await expect(tomato).toBeVisible({ timeout: 15000 });
    await expect(snapdragon).toBeVisible();
    await expect(shed.favouriteTombstoneIn(snapdragon)).toBeVisible();

    // First-visit hint banner shows (fresh browser context) and dismisses.
    await expect(shed.favouritesHintBanner).toBeVisible();
    await shed.favouritesHintDismiss.click();
    await expect(shed.favouritesHintBanner).toHaveCount(0);
  });

  test("FAV-002: hearting a Home-tab plant adds it to Favourites; removing it cleans up", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const heart = shed.heartFor("Basil");
    await expect(heart).toBeVisible({ timeout: 15000 });

    // Defensive: a failed earlier attempt may have left Basil favourited.
    if ((await heart.getAttribute("aria-pressed")) === "true") {
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "false", { timeout: 10000 });
    }

    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });

    // Appears on the Favourites scope (via the pill, not the deep link).
    await shed.scopeFavouritesBtn.click();
    await expect(shed.favouritesGrid).toBeVisible();
    const basil = shed.favouriteCard("Basil");
    await expect(basil).toBeVisible({ timeout: 15000 });
    // Basil lives in this home already → the dedupe state shows.
    await expect(shed.favouriteInHomeBadgeIn(basil)).toBeVisible();

    // Clean up: remove the favourite; card disappears.
    await shed.favouriteRemoveIn(basil).click();
    await expect(basil).toHaveCount(0, { timeout: 10000 });

    // Heart on the Home tab unfills.
    await shed.scopeHomeBtn.click();
    await expect(shed.heartFor("Basil")).toHaveAttribute("aria-pressed", "false", { timeout: 10000 });
  });

  test("FAV-003: seeded Tomato favourite — heart pre-filled on Home tab, 'In this home' on Favourites", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await expect(shed.heartFor("Tomato")).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    await shed.scopeFavouritesBtn.click();
    const tomato = shed.favouriteCard("Tomato");
    await expect(tomato).toBeVisible({ timeout: 15000 });
    await expect(shed.favouriteInHomeBadgeIn(tomato)).toBeVisible();
    await expect(shed.favouriteAddToHomeIn(tomato)).toHaveCount(0);
  });

  test("FAV-004: 'Add to this home' copies a favourite into the active home", async ({ authenticatedPage }) => {
    const shed = new ShedPage(authenticatedPage);

    // Defensive cleanup: a failed earlier attempt may have left the copy in
    // the shed — delete it so the add path is clean.
    await shed.goto();
    await shed.waitForLoad();
    const leftover = shed.plantCard("Snapdragon");
    if (await leftover.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shed.deleteButtonFor("Snapdragon").click();
      await authenticatedPage.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(leftover).toHaveCount(0, { timeout: 10000 });
    }

    await shed.gotoFavourites();
    const snapdragon = shed.favouriteCard("Snapdragon");
    await expect(snapdragon).toBeVisible({ timeout: 15000 });

    const addBtn = shed.favouriteAddToHomeIn(snapdragon);
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Button flips to the dedupe state once the copy lands.
    await expect(shed.favouriteInHomeBadgeIn(snapdragon)).toBeVisible({ timeout: 15000 });

    // The copy exists on the Home tab.
    await shed.scopeHomeBtn.click();
    const copy = shed.plantCard("Snapdragon");
    await expect(copy).toBeVisible({ timeout: 15000 });

    // Clean up so the spec is re-runnable: delete the copied plant.
    await shed.deleteButtonFor("Snapdragon").click();
    await authenticatedPage.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(copy).toHaveCount(0, { timeout: 10000 });
  });

  test("FAV-005: tier lock — Sprout sees disabled hearts on api/ai-sourced plants", async ({ authenticatedPage }) => {
    await forceSprout(authenticatedPage);
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // Lavender (api source, id {w+1}000006) — locked for Sprout. Targeted by
    // id because the AI-freshness seed adds a same-named AI fork.
    const apiHeart = shed.heartForId(`${plantBase}000006`);
    await expect(apiHeart).toBeVisible({ timeout: 15000 });
    await expect(apiHeart).toBeDisabled();
    await expect(apiHeart).toHaveAttribute("title", /upgrade/i);

    // Cherry Tomato (ai shallow fork, id {w+1}00011) — locked for Sprout.
    const aiHeart = shed.heartForId(`${plantBase}00011`);
    await expect(aiHeart).toBeVisible();
    await expect(aiHeart).toBeDisabled();

    // Manual plants stay heartable.
    await expect(shed.heartFor("Tomato")).toBeEnabled();
  });

  test("FAV-006: favourites persist across a home switch while the Home tab re-roots", async ({ authenticatedPage }) => {
    test.skip(workerNum !== 1, "The second home is seeded for worker 1 only (15_favourites.sql)");

    const shed = new ShedPage(authenticatedPage);
    const switchTo = async (homeId: string) => {
      await authenticatedPage.goto("/home-management");
      const btn = authenticatedPage.getByTestId(`home-mgmt-switch-${homeId}`);
      await expect(btn).toBeVisible({ timeout: 15000 });
      await btn.click();
      await expect(authenticatedPage.getByText("Switched home")).toBeVisible({ timeout: 15000 });
    };

    try {
      // Baseline in home 1: Fig favourite is a LIVE cross-home ref — offered
      // for adding (it lives in the Rooftop Terrace, not here).
      await shed.gotoFavourites();
      const figBefore = shed.favouriteCard("Fig");
      await expect(figBefore).toBeVisible({ timeout: 15000 });
      await expect(shed.favouriteAddToHomeIn(figBefore)).toBeVisible();

      await switchTo(SECOND_HOME_ID);

      // Favourites tab content is identical after the switch…
      await shed.gotoFavourites();
      await expect(shed.favouriteCard("Tomato")).toBeVisible({ timeout: 15000 });
      await expect(shed.favouriteCard("Snapdragon")).toBeVisible();
      const figAfter = shed.favouriteCard("Fig");
      await expect(figAfter).toBeVisible();
      // …but the add-state recomputes against the new home: Fig lives here.
      await expect(shed.favouriteInHomeBadgeIn(figAfter)).toBeVisible({ timeout: 15000 });

      // The Home tab re-rooted: Fig present, home 1's Tomato absent.
      await shed.scopeHomeBtn.click();
      await expect(shed.plantCard("Fig")).toBeVisible({ timeout: 15000 });
      await expect(shed.plantCard("Tomato")).toHaveCount(0);
    } finally {
      // Always restore home 1 as the active home — every other spec on this
      // worker assumes it.
      await switchTo(HOME_1_ID);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Watchlist (ailment) favourites
//   Relevant seeds (15_favourites.sql, 0018 segment):
//     * Aphid favourite (dedupes against the seeded home ailment "Aphid")
//     * Rose Rust TOMBSTONE favourite (not in any home → clean add-to-home)
//     * W1 only: "Slugs" ailment in the second home + Slugs favourite
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Cross-home favourites — Watchlist (Section FAV-WL)", () => {
  test("FAV-WL-001: deep link lands on the Watchlist Favourites scope with seeded fixtures", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.gotoFavourites();
    await wl.waitForLoad();

    await expect(wl.favouritesGrid).toBeVisible({ timeout: 15000 });
    await expect(wl.scopeToggle).toBeVisible();

    // Seeded fixtures render — Aphid (dedupe) + Rose Rust (tombstone).
    const aphid = wl.favouriteCard("Aphid");
    const roseRust = wl.favouriteCard("Rose Rust");
    await expect(aphid).toBeVisible({ timeout: 15000 });
    await expect(roseRust).toBeVisible();
    await expect(wl.favouriteTombstoneIn(roseRust)).toBeVisible();

    // First-visit hint banner shows (fresh browser context) and dismisses.
    await expect(wl.favouritesHintBanner).toBeVisible();
    await wl.favouritesHintDismiss.click();
    await expect(wl.favouritesHintBanner).toHaveCount(0);
  });

  test("FAV-WL-002: hearting a Home-tab ailment adds it to Favourites; removing cleans up", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    const heart = wl.heartFor("Early Blight");
    await expect(heart).toBeVisible({ timeout: 15000 });

    // Defensive: a failed earlier attempt may have left it favourited.
    if ((await heart.getAttribute("aria-pressed")) === "true") {
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "false", { timeout: 10000 });
    }

    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });

    await wl.scopeFavouritesBtn.click();
    await expect(wl.favouritesGrid).toBeVisible();
    const blight = wl.favouriteCard("Early Blight");
    await expect(blight).toBeVisible({ timeout: 15000 });
    // Early Blight lives in this home already → the dedupe state shows.
    await expect(wl.favouriteInHomeBadgeIn(blight)).toBeVisible();

    // Clean up: remove the favourite; card disappears.
    await wl.favouriteRemoveIn(blight).click();
    await expect(blight).toHaveCount(0, { timeout: 10000 });

    // Heart on the Home tab unfills.
    await wl.scopeHomeBtn.click();
    await expect(wl.heartFor("Early Blight")).toHaveAttribute("aria-pressed", "false", { timeout: 10000 });
  });

  test("FAV-WL-003: seeded Aphid favourite — heart pre-filled on Home tab, 'In this home' on Favourites", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    await expect(wl.heartFor("Aphid")).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    await wl.scopeFavouritesBtn.click();
    const aphid = wl.favouriteCard("Aphid");
    await expect(aphid).toBeVisible({ timeout: 15000 });
    await expect(wl.favouriteInHomeBadgeIn(aphid)).toBeVisible();
    await expect(wl.favouriteAddToHomeIn(aphid)).toHaveCount(0);
  });

  test("FAV-WL-004: 'Add to this home' copies a favourite ailment into the active home", async ({ authenticatedPage }) => {
    const wl = new WatchlistPage(authenticatedPage);

    // Defensive cleanup: a failed earlier attempt may have left the copy.
    await wl.goto();
    await wl.waitForLoad();
    const leftover = wl.ailmentCard("Rose Rust");
    if (await leftover.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wl.deleteButtonFor("Rose Rust").click();
      await authenticatedPage.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(leftover).toHaveCount(0, { timeout: 10000 });
    }

    await wl.gotoFavourites();
    const roseRust = wl.favouriteCard("Rose Rust");
    await expect(roseRust).toBeVisible({ timeout: 15000 });

    const addBtn = wl.favouriteAddToHomeIn(roseRust);
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Button flips to the dedupe state once the copy lands.
    await expect(wl.favouriteInHomeBadgeIn(roseRust)).toBeVisible({ timeout: 15000 });

    // The copy exists on the Home tab.
    await wl.scopeHomeBtn.click();
    const copy = wl.ailmentCard("Rose Rust");
    await expect(copy).toBeVisible({ timeout: 15000 });

    // Clean up so the spec is re-runnable: delete the copied ailment.
    await wl.deleteButtonFor("Rose Rust").click();
    await authenticatedPage.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(copy).toHaveCount(0, { timeout: 10000 });
  });

  test("FAV-WL-005: tier lock — Sprout sees a disabled heart on a perenual-sourced ailment", async ({ authenticatedPage }) => {
    await forceSprout(authenticatedPage);
    const wl = new WatchlistPage(authenticatedPage);
    await wl.goto();
    await wl.waitForLoad();

    // "Locked Rust (perenual)" is seeded as a perenual-source home ailment
    // (15_favourites.sql) — locked (view-only) for Sprout.
    const lockedHeart = wl.heartFor("Locked Rust (perenual)");
    await expect(lockedHeart).toBeVisible({ timeout: 15000 });
    await expect(lockedHeart).toBeDisabled();
    await expect(lockedHeart).toHaveAttribute("title", /upgrade/i);

    // Manual ailments stay heartable.
    await expect(wl.heartFor("Aphid")).toBeEnabled();
  });

  test("FAV-WL-006: favourite ailments persist across a home switch while the add-state recomputes", async ({ authenticatedPage }) => {
    test.skip(workerNum !== 1, "The second home is seeded for worker 1 only (15_favourites.sql)");

    const wl = new WatchlistPage(authenticatedPage);
    const switchTo = async (homeId: string) => {
      await authenticatedPage.goto("/home-management");
      const btn = authenticatedPage.getByTestId(`home-mgmt-switch-${homeId}`);
      await expect(btn).toBeVisible({ timeout: 15000 });
      await btn.click();
      await expect(authenticatedPage.getByText("Switched home")).toBeVisible({ timeout: 15000 });
    };

    try {
      // Baseline in home 1: Slugs favourite is offered for adding (it lives in
      // the Rooftop Terrace, not here).
      await wl.gotoFavourites();
      const slugsBefore = wl.favouriteCard("Slugs");
      await expect(slugsBefore).toBeVisible({ timeout: 15000 });
      await expect(wl.favouriteAddToHomeIn(slugsBefore)).toBeVisible();

      await switchTo(SECOND_HOME_ID);

      // Favourites list is identical after the switch…
      await wl.gotoFavourites();
      await expect(wl.favouriteCard("Aphid")).toBeVisible({ timeout: 15000 });
      await expect(wl.favouriteCard("Rose Rust")).toBeVisible();
      const slugsAfter = wl.favouriteCard("Slugs");
      await expect(slugsAfter).toBeVisible();
      // …but the add-state recomputes: Slugs lives in this home now.
      await expect(wl.favouriteInHomeBadgeIn(slugsAfter)).toBeVisible({ timeout: 15000 });
    } finally {
      await switchTo(HOME_1_ID);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 (FINAL) — Nursery (seed-packet) favourites
//   Relevant seeds (15_favourites.sql, 0019 segment):
//     * Home packet "Cherokee Purple / Tomato" + its favourite (dedupe case)
//     * "Cosmos" favourite (no home packet → clean add-to-home)
//     * W1 only: "Cavolo Nero" packet in the second home + its favourite
//   The Nursery scope pill is COMPONENT STATE (no URL param) — NurseryPage
//   navigates via the Plants/Nursery toggle then the scope pill.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Cross-home favourites — Nursery (Section FAV-NU)", () => {
  test("FAV-NU-001: Favourites scope lists seeded packet fixtures + hint banner", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoFavourites();

    await expect(nursery.favouritesGrid).toBeVisible({ timeout: 15000 });
    await expect(nursery.scopeToggle).toBeVisible();

    // Seeded fixtures render.
    const cherokee = nursery.favouriteCard("Cherokee Purple");
    const cosmos = nursery.favouriteCard("Sensation Mix");
    await expect(cherokee).toBeVisible({ timeout: 15000 });
    await expect(cosmos).toBeVisible();
    // Packets are snapshot-only — every card carries the "Saved variety" chip.
    await expect(nursery.favouriteTombstoneIn(cherokee)).toBeVisible();

    // First-visit hint banner shows (fresh browser context) and dismisses.
    await expect(nursery.favouritesHintBanner).toBeVisible();
    await nursery.favouritesHintDismiss.click();
    await expect(nursery.favouritesHintBanner).toHaveCount(0);
  });

  test("FAV-NU-002: hearting a Home-tab packet adds it to Favourites; removing cleans up", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.goto();
    await nursery.waitForLoad();

    // "Cosmos" is NOT seeded as a home packet — heart a different home packet.
    // "Cavolo Nero" is only in W1's second home; use the always-present
    // Cherokee Purple packet's sibling: heart it, but it's already favourited
    // (dedupe fixture), so instead toggle a fresh one — pick the seeded
    // Cherokee Purple which is pre-favourited and assert the heart state, then
    // exercise a clean toggle on it.
    const heart = nursery.heartFor("Cherokee Purple");
    await expect(heart).toBeVisible({ timeout: 15000 });
    // Seeded pre-filled.
    await expect(heart).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    // Unfavourite → heart clears; the favourites list loses the card.
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "false", { timeout: 10000 });

    // Re-favourite so the seed state is restored for other specs.
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });

    // It appears on the Favourites scope.
    await nursery.scopeFavouritesBtn.click();
    await expect(nursery.favouriteCard("Cherokee Purple")).toBeVisible({ timeout: 15000 });
  });

  test("FAV-NU-003: seeded Cherokee Purple favourite — heart pre-filled + 'In this home'", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.goto();
    await nursery.waitForLoad();

    await expect(nursery.heartFor("Cherokee Purple")).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    await nursery.scopeFavouritesBtn.click();
    const cherokee = nursery.favouriteCard("Cherokee Purple");
    await expect(cherokee).toBeVisible({ timeout: 15000 });
    await expect(nursery.favouriteInHomeBadgeIn(cherokee)).toBeVisible();
    await expect(nursery.favouriteAddToHomeIn(cherokee)).toHaveCount(0);
  });

  test("FAV-NU-004: 'Add to this home' recreates the packet in the active home", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);

    // Defensive cleanup: earlier attempts / retries may have left one or more
    // Cosmos packets in the home. Archive every leftover so add-to-home is clean.
    await nursery.goto();
    await nursery.waitForLoad();
    const leftover = () =>
      nursery.page.locator("[data-testid^='nursery-row-']").filter({ hasText: "Sensation Mix" });
    for (let i = 0; i < 5 && (await leftover().first().isVisible({ timeout: 3000 }).catch(() => false)); i++) {
      await leftover().first().click();
      await nursery.packetDetailArchive.click();
      await nursery.goto();
      await nursery.waitForLoad();
    }
    await expect(leftover()).toHaveCount(0, { timeout: 10000 });

    await nursery.scopeFavouritesBtn.click();
    const cosmos = nursery.favouriteCard("Sensation Mix");
    await expect(cosmos).toBeVisible({ timeout: 15000 });

    const addBtn = nursery.favouriteAddToHomeIn(cosmos);
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // Button flips to the dedupe state once the copy lands.
    await expect(nursery.favouriteInHomeBadgeIn(cosmos)).toBeVisible({ timeout: 15000 });

    // The copy exists on the Home tab.
    await nursery.scopeHomeBtn.click();
    const copy = nursery.page.locator("[data-testid^='nursery-row-']").filter({ hasText: "Sensation Mix" });
    await expect(copy.first()).toBeVisible({ timeout: 15000 });

    // Clean up: archive the recreated packet so the spec is re-runnable.
    await copy.first().click();
    await nursery.packetDetailArchive.click();
    await expect(nursery.page.locator("[data-testid^='nursery-row-']").filter({ hasText: "Sensation Mix" })).toHaveCount(0, { timeout: 15000 });
  });

  test("FAV-NU-005: packet hearts are ungated (no tier lock — packets have no source)", async ({ authenticatedPage }) => {
    // Even a forced-Sprout viewer can heart any packet (packets carry no source,
    // so there is no source × tier gate — see cross-home-favourites-phase-3).
    await forceSprout(authenticatedPage);
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.goto();
    await nursery.waitForLoad();

    const heart = nursery.heartFor("Cherokee Purple");
    await expect(heart).toBeVisible({ timeout: 15000 });
    await expect(heart).toBeEnabled();
  });

  test("FAV-NU-006: favourite packets persist across a home switch while the add-state recomputes", async ({ authenticatedPage }) => {
    test.skip(workerNum !== 1, "The second home is seeded for worker 1 only (15_favourites.sql)");

    const nursery = new NurseryPage(authenticatedPage);
    const switchTo = async (homeId: string) => {
      await authenticatedPage.goto("/home-management");
      const btn = authenticatedPage.getByTestId(`home-mgmt-switch-${homeId}`);
      await expect(btn).toBeVisible({ timeout: 15000 });
      await btn.click();
      await expect(authenticatedPage.getByText("Switched home")).toBeVisible({ timeout: 15000 });
    };

    try {
      // Baseline in home 1: Cavolo Nero favourite is offered for adding (it
      // lives in the Rooftop Terrace, not here).
      await nursery.gotoFavourites();
      const kaleBefore = nursery.favouriteCard("Cavolo Nero");
      await expect(kaleBefore).toBeVisible({ timeout: 15000 });
      await expect(nursery.favouriteAddToHomeIn(kaleBefore)).toBeVisible();

      await switchTo(SECOND_HOME_ID);

      // Favourites list is identical after the switch…
      await nursery.gotoFavourites();
      await expect(nursery.favouriteCard("Cherokee Purple")).toBeVisible({ timeout: 15000 });
      await expect(nursery.favouriteCard("Sensation Mix")).toBeVisible();
      const kaleAfter = nursery.favouriteCard("Cavolo Nero");
      await expect(kaleAfter).toBeVisible();
      // …but the add-state recomputes: Cavolo Nero lives in this home now.
      await expect(nursery.favouriteInHomeBadgeIn(kaleAfter)).toBeVisible({ timeout: 15000 });
    } finally {
      await switchTo(HOME_1_ID);
    }
  });
});
