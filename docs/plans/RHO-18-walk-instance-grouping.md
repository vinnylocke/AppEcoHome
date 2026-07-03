# RHO-18 — Garden Walk: header obscured by nav chrome + collapse same-plant instances into one card

**Ticket:** RHO-18 "Garden Walkthrough - Difficult to tell plant instances apart"
**Reported on:** Sprout tier, Pixel Tablet (landscape), PWA, v34.0001 — on the Garden Walk v2 shipped in RHO-17.
**Status target:** Triage → In Planning. **No code in this task — plan only.**

---

## 1. Problem / goal

Two distinct problems on the Garden Walk, both surfaced on a landscape tablet:

1. **Obscured walk header.** The plant-instance name / "Step N of M" at the top of the walk card is hidden behind the app's top-nav chrome (the hamburger menu + profile button). The walk is supposed to be a focus-mode surface with no top bar, but on this device the app chrome is still rendering over it.
2. **Instance cards are hard to tell apart.** The walk emits **one card per plant instance** (`inventory_item`). A gardener with three tomatoes in one bed gets three near-identical "Tomato" cards back-to-back and can't tell which is which. The reporter asks: should same-plant-same-area instances collapse into **one card** that covers the whole group (showing the count, actions applying to the group)?

Expected end state: one card per **(plant × area)** group covering all its instances, and the walk header always fully visible.

---

## 2. App-reference consulted

- `docs/app-reference/02-dashboard/13-garden-walk.md` — the walk's full contract (component graph, route model, `composeWalkRoute`, per-plant card, task→step assignment, focus-mode shell note, tier gating). This is the canonical map for both fixes.
- `docs/plans/RHO-17-garden-walk-detail.md` — the RHO-17 build plan the walk was shipped from (route model, phasing, approved answers).
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` *(to read before implementing)* — `plants` (species) vs `inventory_items` (instances) relationship, keyed columns.
- `docs/app-reference/99-cross-cutting/07-data-model-media.md` *(to read before implementing)* — `plant_journals.inventory_item_id` (per-instance) — the journal/snap write key that grouping has to reckon with.
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md` *(to read before implementing)* — `plant_instance_ailments` is per-instance; the walk's ailment counts are per-instance today.
- `docs/app-reference/99-cross-cutting/21-routing.md` *(to read before implementing)* — the focus-mode shell membership, since fix 1 changes when `/walk` joins it.

Source read end-to-end for this plan: `src/App.tsx` (`isFocusMode` derivation ~line 256, the sticky `<header>` ~1322, side `<nav>` ~1372, the `/walk` route ~1487, the focus-mode floating chrome ~2088), `src/hooks/useIsMobile.ts`, `src/components/walk/GardenWalk.tsx`, `src/components/walk/WalkPlantCard.tsx`, `src/components/walk/WalkSectionCard.tsx` (header block), `src/components/walk/WalkTaskRow.tsx`, `src/lib/gardenWalk.ts` (`composeAndOrderWalk`, `composeWalkRoute`, `WalkPlant`, task→plant assignment), `supabase/seeds/02_plants_shed.sql`.

---

## 3. Root cause

### Issue 1 — obscured header: `isFocusMode` is gated on `isMobile`, and a landscape tablet is not "mobile"

`src/App.tsx:256-259`:

```ts
const isFocusMode =
  isMobile &&
  (routerLocation.pathname.startsWith("/quick") ||
    routerLocation.pathname.startsWith("/walk"));
```

`isMobile` comes from `useIsMobile()` (`src/hooks/useIsMobile.ts:31-35`): `true` only when running natively **or** `window.innerWidth < 768`. A **Pixel Tablet in landscape** as an installed PWA is not a Capacitor native platform and its CSS viewport width is ~1024–1600px — so `isMobile === false`, therefore `isFocusMode === false`.

With `isFocusMode` false:
- the sticky app `<header>` renders (`src/App.tsx:1321-1366`) — `sticky top-0 z-30`, containing the hamburger (`Menu`, ~1324-1330) and `UserProfileDropdown` (~1354);
- the side `<nav>` renders (`~1371-1421`);
- the `/walk` route content renders inside the **padded** shell (`src/App.tsx:1452` → `p-4 md:p-8 ...`), not the `h-full` full-bleed branch;
- the focus-mode floating burger + profile chrome (`~2088-2143`) does **not** render.

The walk's own header (`WalkPlantCard.tsx:184-212` `walk-card-header`, and `WalkSectionCard.tsx:261` `walk-section-header`) is built for the full-bleed focus layout — it pads only for `env(safe-area-inset-top)`, with **no allowance for a sticky app header above it**. So on the tablet the "Step N of M · {section}" line and the card's Stop button sit directly beneath (and are overlapped by) the sticky `z-30` app header's menu + profile buttons. That is exactly the reporter's "obscured by menu + profile buttons."

**One-line root cause:** the walk is only treated as focus-mode on phone-width/native viewports; on a wider tablet it renders inside the full desktop chrome, whose sticky top bar overlaps the walk's own header. `src/App.tsx:256` (the `isMobile &&` gate) is the fault line.

### Issue 2 — one card per instance: `composeAndOrderWalk` maps one `WalkPlant` per `inventory_items` row, with no grouping

`src/lib/gardenWalk.ts:227-296` — `composeAndOrderWalk` does `filteredItems.filter(...).map((item) => ({ inventoryItemId: item.id, ... }))`: **exactly one `WalkPlant` per non-archived inventory item**. `composeWalkRoute` (`gardenWalk.ts:1150-1156`) then emits **one `plant` step per `WalkPlant`**. There is no grouping anywhere — three tomatoes in Raised Bed A produce three consecutive `plant` steps whose cards differ only by nickname/photo (and most instances share a nickname, so they look identical).

`WalkPlant` is keyed by `inventoryItemId` throughout (the card key at `GardenWalk.tsx:539`, journal writes at `WalkPlantCard.tsx:130/156`, snap path at `:438`, `garden_walk_visits.inventory_item_id`). So the per-instance identity is load-bearing for visits, journals and snaps — grouping has to preserve a way to act per-instance where the write demands one.

**One-line root cause:** the walk models each physical instance as its own step and never groups instances of the same plant in the same area; the card offers no way to distinguish or collapse them.

---

## 4. Recommended fixes

### Fix 1 — make `/walk` (and `/quick`) focus-mode on any viewport, not just phone-width

**Recommended (favoured in the brief): `/walk` is a focus-mode surface regardless of width.** Decouple the walk's focus treatment from `isMobile`. The walk is a full-screen guided experience that should never share the screen with the app's top bar and side nav on any device.

Minimal, surgical change at `src/App.tsx:256`:

```ts
// /walk is ALWAYS focus-mode (full-bleed, no top bar / side nav) on
// every viewport — it's a guided full-screen surface. /quick stays
// phone/native-only focus-mode (its desktop experience is the padded
// dashboard). Fixes RHO-18: on a landscape tablet the sticky app header
// overlapped the walk's own header because isMobile was false there.
const isWalk = routerLocation.pathname.startsWith("/walk");
const isFocusMode =
  isWalk ||
  (isMobile && routerLocation.pathname.startsWith("/quick"));
```

Effect: on the tablet `/walk` now takes the `isFocusMode` branch — the sticky `<header>` and side `<nav>` don't render, the walk gets the `h-full` full-bleed container (`src/App.tsx:1452`), and the focus-mode **floating** burger + profile chrome (`src/App.tsx:2088-2143`, already `z-[105]`, safe-area-padded, top-right) renders instead. The walk's own header already pads for `env(safe-area-inset-top)` and sits at the very top of a full-bleed surface, so it's no longer overlapped.

**One residual overlap to close in the same fix:** the focus-mode floating profile button sits `fixed top-3 right-3 z-[105]` (`src/App.tsx:2097-2103`) and the floating burger (`QuickAccessMenuButton`) sits top-left — the same corners as the walk card's own top-right **Stop** button (`walk-card-stop` / `walk-section-header` Stop) and the "Step N of M" label (top-left). On `/quick` these coexist because Quick Access has no competing top-corner controls; the walk does. So this fix must **also** give the walk header top-corner breathing room on focus-mode-at-any-width:
- Preferred: on `/walk`, render only the floating **burger** (or neither) and let the walk's own Stop button be the single top-right control — i.e. suppress the focus-mode floating `UserProfileDropdown` on `/walk` (wrap the `top-3 right-3` block in `!isWalk`), and add left padding to the walk header so the "Step N of M" label clears the floating burger. The profile menu is still reachable from the walk? Decision point — see Open Question A.
- Alternative: keep both floating controls, and shift the walk card header down / inset it so its label + Stop don't collide with the floating burger/profile. Messier (two Stop-like affordances top-right).

Recommendation: **suppress the floating profile dropdown on `/walk`** (the walk's Stop is the primary exit; the profile menu isn't needed mid-walk), keep the floating burger, and add `pl-14`-ish left padding to the walk header so "Step N of M" clears the burger. This gives one clean top-right control (Stop) and one top-left (menu), matching the walk's existing header layout.

**Why not the alternative (keep desktop chrome, just pad the walk header below it):** it would leave the walk sharing the screen with the full top bar + side nav on tablet/desktop — contradicting the documented "focus-mode shell … no top bar, no side nav" contract (`13-garden-walk.md` Route line) and wasting a third of the tablet width on the side nav during a full-screen guided walk. The brief explicitly favours "the top nav buttons shouldn't render." Rejected.

**Files:** `src/App.tsx` only (the `isFocusMode` derivation ~256; the floating-profile block ~2097 wrapped in `!isWalk`); `src/components/walk/WalkPlantCard.tsx` + `WalkSectionCard.tsx` header left-padding tweak so the label clears the floating burger.

### Fix 2 — collapse same-plant, same-area instances into one grouped `WalkPlant` card

**Group key: `(plant identity, area_id)`**, where plant identity = `plant_id` when present, else a normalised `plant_name` (manual instances may share a name with no `plant_id`). All non-archived instances of the same plant in the same area become **one `WalkPlant`** carrying an `instances[]` list.

Concretely, in `composeAndOrderWalk` (`src/lib/gardenWalk.ts:227-296`):

- After the current per-item map, **reduce items into groups** keyed by `${plant_id ?? 'name:'+normalisedName}|${area_id ?? 'none'}`.
- Each group yields one `WalkPlant` with:
  - `instanceCount: number` and `instances: WalkPlantInstance[]` (`{ inventoryItemId, nickname, identifier, band, activeAilmentCount, overdueTaskCount, dueTodayTaskCount, plantedAt }`) — the per-instance detail so the card can expand.
  - Aggregated card-level signals: `activeAilmentCount` = sum across instances, `overdueTaskCount` / `dueTodayTaskCount` = sums, `band` = the **highest-priority** band among the instances (critical > overdue > due_today > fresh_hit > stale > everything_else) so the group ranks by its most urgent member.
  - A stable **representative `inventoryItemId`** (the first instance in sort order) — used as the React key and as the default target for group-level journal/snap writes (see edge cases).
  - `daysSincePlanted`: if all instances share a planted date, show it; otherwise a range / "mixed" (display-only).
- Banding + the `slice(0, maxPerWalk)` cap now apply to **groups**, not raw instances (a bed of 20 tomatoes is one card, not 20 — the cap goes much further).
- `visitedTodaySet` filtering becomes group-level: a group is "done today" only when **all** its instances have a visit today (or simpler: when the representative has been visited — Open Question C).

`WalkPlantCard` changes:
- When `instanceCount > 1`, the card title shows the plant name + a **count chip** ("Tomato · 3 plants"), and a collapsible **"Instances"** list (each row: nickname/identifier + its own band/ailment chips). `data-testid="walk-card-instances"`, `walk-card-instance-{inventoryItemId}`.
- Snap / Note: default to a group-level write (representative instance) with a small **"which plant?"** selector when `instanceCount > 1`, so a note about one specific tomato can still target that instance (Open Question B). Ailment-flag and per-instance actions similarly offer the instance picker.
- Tasks: **no change needed** — `composeWalkRoute`'s task→plant assignment already attaches a task to the *first of its plants in route order*, and `inventory_item_ids` tasks routinely cover multiple instances (`alsoCoversCount`). Grouping actually *improves* this: a watering task covering all three tomatoes now lands on the one grouped card instead of showing "also covers 2 other plants" scattered across three cards. `composeWalkRoute`'s `plantRoutePosition` map (`gardenWalk.ts:1035`) must be built from the grouped plants and must map **every** member instance id to the group's position, so a task keyed to any instance resolves to the group's step.

**`composeWalkRoute` impact:** minimal — it already consumes `WalkPlant[]` and groups them by `areaId` (`gardenWalk.ts:1003-1011`). The only change is that `plantRoutePosition` must index every instance id in a group to that group's route slot (so multi-instance tasks find their group). Everything else (sections, unassigned trailing group, home step) is unchanged.

**Files:** `src/lib/gardenWalk.ts` (`WalkPlant` gains `instanceCount` + `instances`; new `WalkPlantInstance` type; `composeAndOrderWalk` grouping; `composeWalkRoute` `plantRoutePosition` per-instance indexing), `src/components/walk/WalkPlantCard.tsx` (count chip + instances list + instance picker on Snap/Note/flag).

**Alternative considered — keep one card per instance, add a disambiguating sub-header** (identifier + "2 of 3 in Raised Bed A"). Cheaper, no data-model reshaping, and preserves per-instance journal/snap without a picker. But it does **not** satisfy the reporter's explicit ask ("one card per grouping") and still marches the user through N near-identical cards. Rejected as the primary fix, but its disambiguating sub-header (show `identifier`) is worth folding into the grouped card's instance list.

---

## 5. Should the two issues ship together or separately?

**Recommend shipping Fix 1 (header) on its own, first, ahead of Fix 2 (grouping).** Reasons:
- Fix 1 is a ~5-line `App.tsx` change + header padding — low risk, high urgency (the header is *unusable* on the reporter's device today), no data-model or route reshaping, needs only an E2E viewport-regression test.
- Fix 2 touches the pure route composer, the `WalkPlant` shape, the card, and journal/snap targeting — it warrants its own unit-test sweep and its own reproduction sign-off, and it carries open questions (B, C) that need answers before build.
- They're independent: the header fix doesn't depend on grouping and vice-versa.

If the human prefers one ticket/one deploy, they can land together — but Fix 1 should not wait on Fix 2's design questions.

---

## 6. Risks / edge cases

**Fix 1:**
- **`/quick` unchanged.** The change keeps `/quick` focus-mode phone/native-only (its desktop experience is intentionally the padded dashboard). Only `/walk` becomes always-focus. Verify `/quick` on desktop still shows the normal shell.
- **Desktop `/walk`** now loses the side nav too (not just tablet). That's intended (focus mode) and matches the doc, but it's a visible change for desktop users — the Stop button + summary "Done" are the exits (return-nav contract RHO-7/8 unchanged). Call this out for sign-off.
- **Floating burger/profile collision with the walk's own top-corner controls** — the core of the residual-overlap fix; must be verified at tablet landscape, phone portrait, and desktop widths.
- **Deep-link / hard-refresh onto `/walk`** — `isFocusMode` is derived from `pathname`, so a cold load lands in focus mode correctly.

**Fix 2:**
- **Instances at different growth states / bands in one group** — handled by band = max(instances) for ranking, but the card must *surface* the spread (the instances list shows each member's own band chip) so a critical instance in an otherwise-healthy group isn't hidden. This is the main UX tension: grouping must not bury a single sick plant.
- **Per-instance journal / photo capture** — the biggest tension. `plant_journals.inventory_item_id` and the snap path are per-instance. A grouped card needs an instance picker (or a sensible default-to-representative) so "I photographed *this* tomato's blight" still files against the right instance. If we default silently to the representative, notes get mis-filed. → Open Question B.
- **Per-instance harvest / yield** — `yield_records` are per instance; a harvest task covering the group would need to fan out yields per instance (the existing partial-pick sheet already inserts one `yield_records` row per linked instance, so this is largely handled by the task layer, not the card). Confirm the harvest strip on a grouped card still targets all covered instances.
- **`garden_walk_visits`** — one visit row per instance today. A grouped card resolving with "All good" should either write a visit for every instance in the group (so same-day rebuild filtering works) or the filtering must move to group-level. → Open Question C. Simplest correct option: write a visit row per instance on group resolution.
- **Nickname collisions vs distinct nicknames** — if instances have *distinct* nicknames the user may *want* them separate. Grouping by plant+area still collapses them; the instances list preserves the nicknames so nothing is lost, but confirm the reporter wants distinctly-nicknamed instances collapsed too (they said "instances of the SAME plant") — Open Question D.
- **Manual instances with no `plant_id`** — grouped by normalised name; two genuinely-different manual plants that happen to share a typed name would wrongly merge. Low likelihood; normalising on `plant_name` + `area_id` is the pragmatic key. Note in tests.
- **Unassigned (no-area) instances** — group key uses `area_id ?? 'none'`, so all unassigned instances of a plant collapse into one card in the trailing unassigned section. Consistent.

---

## 7. Tests to add / update

**Vitest (`tests/unit/lib/gardenWalk.test.ts`):**
- `composeAndOrderWalk` grouping: N instances of one plant in one area → one `WalkPlant` with `instanceCount === N` and `instances.length === N`; band = highest among members; ailment/overdue/due-today counts summed; representative id is the first in sort order.
- Different-area instances of the same plant → **separate** groups.
- Manual instances (no `plant_id`) grouped by name+area; different names → separate.
- Cap applies to groups, not instances (21 instances of one plant in one bed = 1 step under the 30-cap).
- `composeWalkRoute`: a task keyed to a **non-representative** instance id still resolves to the group's step (`plantRoutePosition` per-instance indexing); multi-instance task shows on the grouped card once.

**Playwright (`tests/e2e/specs/garden-walk.spec.ts` + `tests/e2e/pages/GardenWalkPage.ts`):**
- **Fix 1 regression:** resize to a landscape-tablet viewport (e.g. 1280×800), navigate to `/walk`, assert the app sticky header (`header` / hamburger / `UserProfileDropdown` testids) is **not** rendered and the walk header (`walk-card-header` / `walk-section-header`) top is not occluded (its Stop button is clickable / at the top of the viewport). Reference RHO-18 in the test name.
- **Fix 2:** seed a second (and third) tomato instance in Raised Bed A (extend `supabase/seeds/02_plants_shed.sql`), walk to the Tomato card, assert one grouped card with the count chip ("3 plants"), the instances list (`walk-card-instances`), and that Snap/Note offer the instance picker.

**Seed update:** add ≥1 extra same-plant same-area instance to `supabase/seeds/02_plants_shed.sql` (e.g. two more Basil or Tomato instances in Raised Bed A) so worker accounts exercise grouping. Update `docs/e2e-test-plan/01-seeded-fixtures.md` with the new inventory UUIDs.

---

## 8. Docs to update (with the code, per the doc-sync mandate)

- `docs/app-reference/02-dashboard/13-garden-walk.md` — **both roles.** Role 1: `/walk` is focus-mode on *all* viewports (not just mobile) — update the Route line and Component graph; `WalkPlant` now carries `instances[]` / `instanceCount`; grouped plant step semantics; instance-picker on Snap/Note; visit-per-instance on group resolution. Role 2: "one card per plant per bed, with each individual plant listed inside" and the instance picker for notes/photos.
- `docs/app-reference/99-cross-cutting/21-routing.md` — `/walk` joins the focus-mode shell at every width (previously "on mobile").
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — note the walk now groups instances by `(plant, area)` for display (the instance rows are unchanged).
- `docs/e2e-test-plan/29-garden-walk.md` — new WALK rows for the tablet-header regression and the grouped-card + instance-picker flows; `docs/e2e-test-plan/01-seeded-fixtures.md` for the new seed instances; `TESTING.md` inventory counts if a new spec/page-object method is added.

---

## 9. Open questions for the human

- **A. Profile menu access mid-walk.** Fix 1 suppresses the focus-mode floating profile dropdown on `/walk` so it doesn't clash with the card's Stop button. Is losing the profile menu *during* a walk acceptable (Stop → back to dashboard → profile), or should it stay reachable (then we shift the walk header instead)?
- **B. Per-instance journal/photo on a grouped card.** Default the Snap/Note to the group's representative instance with an optional "which plant?" picker (my recommendation), or require the user to pick an instance every time, or attach the note to *all* instances in the group?
- **C. Group visit semantics.** On "All good" for a grouped card, write a `garden_walk_visits` row for **every** instance (my recommendation — keeps same-day rebuild filtering correct), or introduce group-level visit tracking?
- **D. Distinctly-nicknamed instances.** Collapse same-plant-same-area instances **even when they have different nicknames** (the instances list preserves the names)? The reporter said "instances of the SAME plant," which I read as yes — confirm.
- **E. Ship order.** OK to ship Fix 1 (header) first as a fast standalone fix, with Fix 2 (grouping) following once B–D are answered? Or bundle both into one deploy?
