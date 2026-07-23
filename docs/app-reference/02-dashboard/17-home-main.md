# Home (Main Dashboard)

> The single `/dashboard` view — "how is my garden doing right now?" answered on one screen, composed in **two postures**. The old sibling **"Overview"** sub-tab was merged in here (design overhaul Phase 4.2). Since redesign **Stage 4** (2026-07-20) HomeMain is a **declarative posture composition**, not a two-density fork: `posture = resolveHomePosture(persona, readStoredPosture())` picks one of two presets from `src/lib/personaPresets.ts` — 🪴 **The Porch** (new/null persona, the default: a guided, almost-number-free welcome) or 🛠️ **The Workbench** (experienced persona: an operations console) — and `HOME_PRESETS[posture].sectionOrder.map(renderSection)` is the **single source of composition truth**. Stage 3 (2026-07-20) had already merged the four AI cards into ONE card — **The Brief** (`the-brief`, "From Rhozly"); Stage 2 (2026-07-20) had already deleted `DailyBriefCard` so ONE hero (`HomeStatusStrip`) serves both postures in two voices (sentence on the Porch, console on the Workbench). **Since 2026-07-20 ("one responsive home") this is the SOLE home for BOTH phone and desktop** — the phone-only `/quick` launcher home (`QuickAccessHome`) was retired and folded in here (its customisable launcher is the `QuickActionsRow` below — same catalogue + pins). Previously phone landed on `/quick`; now `/` redirects both platforms here.

**Route / how to reach it:** `/dashboard` (no `?view=` param, explicit `?view=home`, legacy `?view=dashboard`, legacy `?view=overview`, legacy `?view=locations`, or any unknown value — **all** fall through to home). It is also the **`/` landing for both phone and desktop**, and the target of the legacy `/quick` redirect. Labelled **"Dashboard"** in the **three-tab** sub-tab switcher (Dashboard / Calendar / Weather). The Overview tab no longer exists (merged in, Phase 4.2 — see [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md)); the **Locations tab was retired** in the stats+locations redesign Stage 4a (2026-07-20) and its `?view=locations` links now land here — the garden grid below is the "what's growing where" surface (see [Locations Tab — RETIRED](./02-locations-tab.md)).
**Source files (entry points):**
- `src/components/home/HomeMain.tsx` — the page (lazy-loaded from App.tsx); owns the **posture state**, the **single `SECTIONS` map + `renderSection` section loop** driven by `HOME_PRESETS[posture].sectionOrder`, and the single `useHomeDashboardStats` mount
- `src/lib/personaPresets.ts` — **the composition engine** (Stage 0 plumbing, Stage 4 consumer): `effectivePersona` (null⇒new), `HomePosture = "porch" | "workbench"`, `HOME_PRESETS` (per-posture `{sectionOrder}` — the `variants` map was deleted in the dashboard-nav-tasks-tray Stage 1), `readStoredPosture`/`storePosture`/`resolveHomePosture`; 19 unit tests
- `src/components/home/HomeStatusStrip.tsx` — **the hero for BOTH postures** (redesign Stages 1–2): un-boxed display-scale greeting + either the composed status **sentence** (`variant="sentence"`, Porch) or the tabular **console line** (`variant="console"`, Workbench). `data-testid="home-status-strip"` (the `dashboard_tour` step-2 anchor)
- `src/components/home/NextBestAction.tsx` — **the Porch's single guided suggestion** (Stage 4): ONE calm card, exactly one action, deliberately NO counts (`next-best-action` / `next-best-action-cta`). Porch-only by preset. See [Next Best Action](./18-next-best-action.md)
- `src/lib/heroSentence.ts` — pure sentence/segment composers for the hero (clause ladder, frost/rain extractors, sun micro-line; 24 unit tests)
- `src/lib/stagger.ts` — the one-shot entrance stagger (`STAGGER_ENTRANCE` classes + `staggerStyle(i)`) applied to each section wrapper on first mount; 7 unit tests
- ~~`src/components/DailyBriefCard.tsx`~~ — the old Detailed-density hero — **DELETED in Stage 2 (2026-07-20)**; the console hero replaced it and its facts migrated (see [Daily Brief Card — RETIRED](./05-daily-brief-card.md))
- ~~`src/components/home/GardenSnapshot.tsx`~~ — the old Overview stat wall — **DELETED OUTRIGHT in the stats+locations redesign Stage 2 (2026-07-20, `docs/plans/home-screen-redesign-2026-07.md` §G Q2)**; the entire ~25-tile wall (task / garden / weather / automation tiles, the carried-over line, the per-category `dash-cat-*` chips, the `dash-member-breakdown-toggle`, the `dash-snapshot-toggle` collapse control, and the 7-day day-strip) was cut from the home with **no relocation**. Nothing replaced it; `useHomeDashboardStats` is kept only for the today summary + walk gate (see below)
- `src/components/home/AttentionRow.tsx` — ranked "needs attention" cards (Workbench-only by preset; HomeMain pre-filters the list — Stage 2 one-owner filtering)
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the centrepiece grid, and **since Stage 4a (2026-07-20) the SOLE "what's growing where" surface** — the standalone Locations sub-tab that used to duplicate it was retired (`?view=locations` falls through to home; `LocationTile.tsx` deleted). Each `LocationOverviewCard` carries `data-testid="home-location-card-{id}"` and drills into the [Location Page](./07-location-page.md) (`?locationId=`). **Since the stats+locations redesign Stage 4b (2026-07-20) the grid is ALSO the inline location manage surface** — a `home-add-location-btn` at the grid section header (gated `can("locations.create")`) opens the new `AddLocationSheet`, and every card carries a per-card manage kebab (`location-manage-{id}` → `LocationManageMenu`) for rename / switch inside-outside / delete; all four writes go through the shared `src/lib/locationMutations.ts` DB path (see the "Inline location management on the garden grid" subsection below). `/management` (LocationManager) is unchanged in behaviour — still the power-user bulk CRUD view — and now shares that same mutations lib (one DB path). **AreaRow keeps the growth-state dots + the per-area sensor / valve / tasks chips; the stats+locations redesign Stage 3 (2026-07-20) trimmed the bare per-area plant-count number and the detailed-mode growth-state breakdown text ("3 flowering · 2 seedling") — both duplicated the dots + the location subtitle (the now-dead `stateBreakdown()` helper was removed with them). The **visible** count went, but an `sr-only` per-area plant count was **added** so the quantity stays in the accessibility tree (the dots are `aria-hidden`).**
- `src/components/home/AddLocationSheet.tsx` — **the inline "Add a location" sheet (Stage 4b)** — a `ModalShell` (`data-testid="add-location-sheet"`) with `home-add-location-name-input`, `home-add-location-env-toggle` (inside/outside), and `home-add-location-save`. HomeMain owns the open state + mounts it once. Triggers are `can("locations.create")`-gated, **AND `handleSave` re-checks `can("locations.create")` itself (defense in depth)** — a review found the empty-garden CTA had been repointed here ungated, so no trigger can ever open an ungated create. Calls `createLocation` then `onCreated` (the grid refetch) + logs `EVENT.LOCATION_CREATED`
- `src/components/home/LocationManageMenu.tsx` — **the per-card manage kebab (Stage 4b)** — `location-manage-{id}` opens an action sheet (`location-manage-sheet`) with **Rename** (`location-manage-rename`, gated `locations.edit`; inline `location-rename-input` / `location-rename-save`), **Switch inside/outside** (`location-manage-env`, gated `locations.edit`), and **Delete** (`location-manage-delete`, gated `locations.delete`, via `ConfirmModal`). Returns `null` for a viewer (no edit + no delete → no kebab at all). Every button `stopPropagation`s so the card's drill-in doesn't fire
- `src/lib/locationMutations.ts` — **the ONE DB path (Stage 4b)** for `createLocation` / `renameLocation` / `setLocationEnvironment` / `deleteLocation`, now shared by BOTH the home grid and LocationManager (`/management` was refactored to import it). Each function does only the raw `supabase.from("locations")` mutation and returns `{ error }`; permission `can()` gating, toasts, and the post-mutation refresh are the CALLER's job (RLS gates only home membership, not the spatial keys). Unit tests `tests/unit/lib/locationMutations.test.ts` (4 tests)
- `src/components/home/QuickActionsRow.tsx` — **Garden Walk tile ONLY (dashboard-nav-tasks-tray redesign Stage 1, 2026-07-21).** The customisable launcher-pin grid was removed from the home (every tile but the Walk duplicated the nav bar); the component now renders just the full-width Walk tile, gated `walkPlantCount >= 5`, keeping the `dash-garden-walk` testid + `state.from` contract. The pin catalogue + the `/gardener?section=quick-launcher` picker stay in code but no longer render on the home
- `src/components/home/TheBrief.tsx` — **The Brief** (Stage 3): the one merged "From Rhozly" AI card; composes `GardenBrainBriefCard` + `AdaptiveCareCard` (both `embedded`) + `HeadGardenerCard embedded` (estate row) + `AssistantCard` (insight row, nudge suppressed) with the `onVisibilityChange` house pattern — children stay mounted and the shell hides itself when every row is empty
- `src/components/manager/HeadGardenerCard.tsx` + `src/components/AssistantCard.tsx` — the estate + insight rows inside The Brief (both postures)
- `src/hooks/useHomeOverview.ts` — the `home-overview` edge-function fetch
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — the telemetry aggregate
- `src/App.tsx` — view-param parsing (~line 514, `DashboardView = "home" | "calendar" | "weather"`), localStorage persistence (~line 522), three-tab switcher (~line 1745), single-slot onboarding + home render branch (~line 1779)

---

## Quick Summary

> **dashboard-nav-tasks-tray redesign Stage 1 (2026-07-21).** Three changes to the composition: (1) **today's tasks were promoted above the garden grid** in both postures — tasks are the most-used thing on the page; (2) the **customisable quick-actions launcher grid was removed** from the home — every tile but one duplicated a nav-bar destination — leaving only the **Garden Walk tile** (`QuickActionsRow` is now Walk-only, gated `walkPlantCount >= 5`); (3) the **dead `variants` map was deleted** from `HOME_PRESETS` and the monotone grey uppercase section-eyebrow ladder was broken up (the "Today's tasks" heading is now a real on-surface heading; the "Your garden" caption was dropped as self-evident). Consequence: the `/quick/calendar` planting helper lost its only in-app entry (the "Today" launcher tile); it is now URL-only pending a re-surface. The `dashboard_tour` "Quick actions" step and the `availabilityCtx` HomeMain prop were removed with the grid.

One page, **two postures** — 🪴 **The Porch** (guidance-first, the default) and 🛠️ **The Workbench** (telemetry-first, the default for `persona === "experienced"`). The persona picks the posture, a user toggle overrides it (localStorage `rhozly:home:preset`, with the legacy `rhozly:home:density` key honoured as an alias). Which posture is active decides **what the page contains and how it is laid out** — not just its copy density — via one declarative recipe (`HOME_PRESETS[posture]`) rendered by a single section loop.

- **The Porch** is a warm, centred editorial column (`max-w-[1100px]` at every width): the **sentence hero**, then ONE **Next Best Action** card (no attention inbox, no counts), **today's tasks** (promoted above the garden — Stage 1), the Garden Walk tile, the garden grid, Seasonal Picks, and The Brief. Almost no numbers — a new gardener is told the one thing to do next.
- **The Workbench** is a two-column studio on `xl+` (a `col-span-8` primary flow + a `col-span-4` insight rail; below `xl` both buckets flatten to one stack in preset order): the **console hero**, the Attention inbox (telemetry + harvest kinds only), **today's tasks** promoted above the grid (the compact list behind **"Open board →"**), the Garden Walk tile, the telemetry grid, The Brief, and Week Ahead. Almost no hand-holding.

Both postures share ONE hero (`HomeStatusStrip` — sentence voice on the Porch, console voice on the Workbench; never two heroes), the same single-slot onboarding cascade (App.tsx owns it, passed as `promoSlot` and rendered **below the hero**), the same grid, the same Garden Walk launcher, and the same **compact** task list — the full tabbed TaskList is **no longer embedded** (Stage 4 locked decision: the Workbench trades the Porch's quiet "See all" for a prominent "Open board →"; full task management lives on the Calendar). The grid renders instantly from client-held state; the **`home-overview`** edge function layers live telemetry on top and soft-fails. A **single `useHomeDashboardStats` mount** in HomeMain feeds the today summary and the walk-launcher gate (the Garden Snapshot it also used to feed was deleted in Stage 2) — never add a second consumer (the edge fn is uncached).

---

## Role 1 — Technical Reference

### Component graph

- `src/App.tsx` — `/dashboard` route; renders the **three-tab** switcher (`data-testid="dashboard-view-switcher"`: Dashboard / Calendar / Weather — **slimmed in redesign Stage 1** to a compact inline pill row, `px-3.5 py-1.5 min-h-[36px] rounded-full`; **the Locations button was dropped in Stage 4a** (2026-07-20) when the Locations tab was retired — same DOM shape, testid, and `role=button` selectors otherwise), the **conditional** sync-status pill (`dashboard-sync-status` — renders ONLY when never-synced or stale > 5 min, amber-tinted; the permanent "SYNCED JUST NOW" chrome is gone), builds the single-slot onboarding cascade, and the `home` branch
  - **Single-slot onboarding (Phase 4.2; slot moved Stage 1)** — at most ONE promo card, passed to HomeMain as its `promoSlot` prop and rendered **below the hero** in both postures (the `promo` section). Priority order unchanged:
    1. `GettingStartedChecklist` (`src/components/GettingStartedChecklist.tsx`) — decides its own visibility and reports it via the `onVisibilityChange` prop (`setChecklistSlotVisible`; defaults `true`). See [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md).
    2. Quiz Prompt card (inline in App.tsx) — headline **"Set up your Garden Quiz"**, CTA **"Start the quiz →"** (→ `/profile`); dismiss X opens a confirm row with `quiz-prompt-snooze-14d` / `quiz-prompt-dont-ask-again`, persisted via `onboarding_state.quiz_prompt_snoozed_until`. See [Garden Quiz](../01-onboarding/05-garden-quiz.md).
    3. `NotificationOptInCard` — localStorage-only dismissal. See [Notification Opt-In](../01-onboarding/07-notification-opt-in.md).
    4. `InstallPwaPrompt` — localStorage-only, `beforeinstallprompt`-gated. See [PWA Install Prompt](../01-onboarding/08-pwa-install.md).
  - `HomeMain` (`src/components/home/HomeMain.tsx`) — the page, inside `Suspense` (lazy chunk); calls `useHomeOverview(homeId)` (→ `telemetryByArea` map + `attention[]`) and `useHomeDashboardStats(homeId)` (→ today summary + walk gate)

#### Posture composition — the section loop (Stage 4)

HomeMain builds **one `SECTIONS: Record<HomeSectionId, React.ReactNode | null>` map** (every block element the page can render, keyed by a stable section id), then lets the active preset decide order + presence:

```
const posture = resolveHomePosture(persona, storedPosture);   // porch | workbench
const preset  = HOME_PRESETS[posture];
preset.sectionOrder.map(renderSection)                         // the ONLY composition source of truth
```

- **`renderSection(id)`** wraps each block in a `<div data-section={id}>` with `min-w-0 empty:hidden [&:has(>[hidden]:only-child)]:hidden` (so a self-hidden child — e.g. an empty Brief — drops its wrapper from flow and flex gaps don't double), the one-shot `STAGGER_ENTRANCE` classes + `staggerStyle(i)` while the entrance is active, and an inline `order: i`. Returns `null` when the block is `null`/`undefined` (a section a preset lists but that has no content to show, e.g. `brief` before `userId` resolves).
- **`SECTIONS` id → block** mapping: `hero` → the hero row (HomeStatusStrip + posture toggle) · `nextBestAction` → NextBestAction · `promo` → the `promoSlot` prop · `attention` → AttentionRow (pre-filtered list) · `garden` → the `home-garden-section` wrapper (grid or empty-garden card) · `today` → the compact task block · `quickActions` → QuickActionsRow (Garden Walk tile only, Stage 1) · `learn` → SeasonalPicksCard (`data-section="learn"` is NextBestAction's DOM-scroll target) · `brief` → TheBrief · `week` → the Evergreen-gated WeekAheadPreview.
- **A section that isn't in the active preset's `sectionOrder` never renders.** `nextBestAction` + `learn` are Porch-only; `attention` + `week` are Workbench-only; everything else appears in both.

**Porch layout** (`data-testid="home-main"`) — one centred editorial column at every width:

```
<div class="mx-auto w-full max-w-[1100px] flex flex-col gap-5">
  {preset.sectionOrder.map(renderSection)}
</div>
```

Porch `sectionOrder`: **hero → nextBestAction → promo → today → quickActions → garden → learn → brief** (Stage 1: `today` promoted above `garden`; `quickActions` is now the Walk-tile slot). Hero voice `sentence`; the `today` block is the compact list with a quiet "See all"; no attention inbox and no Week Ahead.

**Workbench layout** (`data-testid="home-main"`) — a two-column studio on `xl+`:

```
<div class="flex flex-col gap-5 xl:grid xl:grid-cols-12 xl:gap-6 xl:items-start">
  <div class="contents xl:flex xl:flex-col xl:gap-5 xl:col-span-8 xl:min-w-0">   {primaryIds.map(renderSection)}   </div>
  <aside class="contents xl:flex xl:flex-col xl:gap-5 xl:col-span-4 xl:min-w-0"> {asideIds.map(renderSection)}    </aside>
</div>
```

Workbench `sectionOrder`: **hero → attention → today → quickActions → garden → brief → week → promo** (Stage 1: `today` promoted above `garden`; `quickActions` is the Walk-tile slot). The primary column (`col-span-8`) gets everything **not** in `WORKBENCH_ASIDE_SECTIONS = {brief, week}`; the `<aside>` rail (`col-span-4`) gets those two. **Below `xl`** both buckets are `display: contents`, so every section becomes a direct flex item of the outer column and the inline `order: i` restores the full preset `sectionOrder` as one phone stack — the "two nav-bars"-style double-render is impossible because the same `renderSection` output feeds both paths. Hero variant `console`; the `today` block is the compact list behind "Open board →".

#### The compact today block + the task-board entry (stats+locations redesign Stage 3, 2026-07-20)

Both postures render the **compact** `TaskList` (`compact` + `targetDate`) for the `today` section. Stage 3 made the board entry a real **pill button in BOTH postures** — it was a faint 11px text link on the Porch before: **"See all →"** (`home-tasks-see-all`, Porch) / **"Open board →"** (`home-tasks-open-board`, Workbench), both built by a shared `taskBoardLink()` helper (`bg-rhozly-primary/5` pill + arrow, `can-hover`/`active` press language) and both navigating to `?view=calendar`. Inline complete / snooze / delete were **not** added at this level because every compact `TaskList` row already carries them in both postures (the left complete checkbox → `toggleTaskCompletion`, aria "Mark task … as complete"; the `CalendarClock` **Postpone** button, aria "Postpone task …"; and delete) — so a gardener ticks off or postpones today's work **without leaving the home** (the Q3 accessibility requirement); the board pill is only for the *full* board. The compact list's **own internal "View calendar →" footer** (testid `task-list-compact-view-calendar`) is now **opt-out via a `hideCalendarLink` prop** — HomeMain passes it so the footer is **suppressed on the home** (its header pill is the non-duplicate entry), while `/quick/calendar`'s `LocalizedTaskCalendar` leaves the footer on as its only hop to the full board. The testid therefore still exists in the codebase but no longer renders on the home. See [Calendar Tab](./03-calendar-tab.md).

**Hero sentence composition** (`src/lib/heroSentence.ts`, pure + unit-tested): `composeHeroSentence` picks ONE clause on a strict ladder — **frost tonight (`extractFrostMin`, threshold ≤ 3 °C) > severe weather alert (warning/critical only; `info` never claims the sentence) > overdue > rain today (`extractRainToday`, ≥ `RAIN_MENTION_MM` = 1 mm — pairs with remaining tasks) > today's tasks > praise/quiet**. The global WeatherAlertBanner remains the alert's canonical dismissible owner — the sentence may *lead* with a severe alert but never replaces the banner (escalation, not ownership).

**Console voice (the Workbench hero):** `variant="console"` renders the date eyebrow, a compact greeting (`text-xl/2xl`), and the tabular segment line (`hero-console-line`, via `composeConsoleSegments` — "1/16 today · 2 overdue · 14° light rain · golden hour 20:16"). Segments (`hero-seg-{id}`, tabular-nums): `tasks` · `overdue` (only when > 0) · `weather` · `frost` (only when tonight's min ≤ 3 °C) · `sun` (golden hour / sunset, non-linking). Zero-value segments drop. The console voice carries the **migrated ask-AI chip** from the retired DailyBriefCard — **same `data-testid="daily-brief-ask-ai"`, same `aiEnabled` gate (RHO-11)** — which sets Plant Doctor page context via `usePlantDoctor` and opens the chat. No sun micro-line and no "Plan my day"/weather chips in this voice — those are sentence-voice only.

#### NextBestAction — the Porch's one guided card (Stage 4)

`src/components/home/NextBestAction.tsx` (`next-best-action` / `next-best-action-cta`). Porch-only (Workbench omits `nextBestAction` from `sectionOrder`). One tap navigates; deliberately shows **no counts**. Priority ladder (first rung with content wins):

1. **`attentionItems[0]`** — the top item of HomeMain's already-`excludeKinds`-filtered attention list (the SAME memoised list the Workbench's AttentionRow renders). → navigates to `attention.route`.
2. **`firstTaskTitle`** — the first pending task today. **Wired since the dashboard-nav-tasks-tray Stage 2 (2026-07-21, B6):** HomeMain reads it synchronously from `TaskEngine.peekCache` using the SAME today cache key the compact TaskList warms, and passes the first pending task's title. `null` on a cold first paint (falls through to seasonal, fills on the next render). → `/dashboard?view=calendar`.
3. **Seasonal fallback** — "Browse what to plant right now": scrolls to the on-page learn section (`document.querySelector('[data-section="learn"]')`, honouring `motionTier()`), or deep-links `/shed?open=add-plant` when the section isn't mounted.

See [Next Best Action](./18-next-best-action.md) for the full breakdown.

#### The hero row + posture toggle

- **The posture toggle** (`home-density-toggle`, buttons `home-density-simple` / `home-density-detailed`) — **testids unchanged from the old density control** (it *is* the old density control, re-pointed). `home-density-simple` → `setPosture("porch")`, `home-density-detailed` → `setPosture("workbench")`. `setPosture` writes `rhozly:home:preset` **and mirrors** the legacy `rhozly:home:density` (`porch → "simple"`, `workbench → "detailed"`) so pre-redesign readers and the ~8 e2e specs that seed/assert the density key stay coherent. **Stage 1 craft (2026-07-20):** each button now carries `aria-label` + `aria-pressed`, a `pointer-coarse:min-h-11/min-w-11` ≥44px tap target, and the active state uses `shadow-card` (green-tinted) — the whole-page-layout switch was a 26px unlabeled icon before.

> **Home craft tokens (redesign Stage 1, 2026-07-20 — stats+locations redesign, docs/plans/home-screen-redesign-2026-07.md):** every home card now uses the house surface (`bg-rhozly-surface-lowest rounded-card border-rhozly-outline/10 shadow-card` — a green-tinted shadow, not the forbidden neutral `shadow-sm`; the interactive NextBestAction card adds the `Card interactive` press/lift language, `can-hover`-gated). Status chips (soil / valve / attention / hazard) moved off raw Tailwind palette (`bg-red-50 text-red-700` …) to the `status-*` token families so they respond to High Contrast mode (see [Accessibility](../99-cross-cutting/34-accessibility.md)); the valve-failed chip swapped its `⚠` emoji for a Lucide `AlertTriangle` and the running-valve dot went static (≤1-live-element budget). The Porch status **sentence** — the line that *is* the summary — was lifted from `on-surface/60` (~3.4:1, sub-AA) to the solid `on-surface-variant` (~7:1); bare `hover:` on the home surfaces became `can-hover:hover:` twins (no sticky hover on the default phone posture). No testids or labels changed.
- **The Porch's sentence hero** also renders the sun micro-line + ≤2 chips (`hero-plan-day` → `?view=calendar`, `hero-weather-chip` → `?view=weather`); the Workbench's console hero renders the segment line + ask-AI chip. Same wrapper `home-status-strip` in both.

#### GardenSnapshot — DELETED (stats+locations redesign Stage 2, 2026-07-20)

The old Overview stat wall (`src/components/home/GardenSnapshot.tsx`) was **deleted outright** — the ~25 `dash-stat-*` tiles (tasks / garden / weather / automations / more), the carried-over line, the per-category `dash-cat-*` chips, the `dash-member-breakdown-toggle`, the `dash-snapshot-toggle` collapse control (and its `rhozly:dashboard:snapshot-open` key), **and** the 7-day `dash-day-{date}` day-strip are all gone from the home with **no relocation** (locked decision `docs/plans/home-screen-redesign-2026-07.md` §G Q2 — "delete everything outright, don't relocate anything"). The plan's earlier §B/§E note about *promoting* the day-strip to a standalone card / routing watchlist alerts to the attention row was **superseded** by that delete-everything choice; nothing was relocated.

The `home-dashboard-stats` edge function is **unchanged** — it still returns the full payload, and `useHomeDashboardStats` still consumes `tasks.doneToday` + the `dayStrip` today bucket for the "X of Y done today" summary and `garden.totalPlants` for the walk-launcher gate. The rest of the payload simply no longer renders. Stat semantics (RHO-13/14/15/16, tz bucketing, split queries) remain documented in `supabase/functions/_shared/dashboardStats.ts` (Deno tests `supabase/tests/dashboardStats.test.ts`).

#### Inline location management on the garden grid (stats+locations redesign Stage 4b, 2026-07-20)

The `garden` section's grid became the **manage-in-place surface for locations** — you now add, rename, re-flag, and delete locations right where you look at them, without a hop to `/management`.

- **Add a location.** `GardenOverviewGrid` renders a `home-add-location-btn` at its section header, **gated `can("locations.create")`** — the button doesn't exist for a caller who can't create. Tapping it opens `AddLocationSheet` (state + mount owned by HomeMain), a `ModalShell` bottom-sheet with a name input (`home-add-location-name-input`), an inside/outside toggle (`home-add-location-env-toggle`), and a save button (`home-add-location-save`). Save calls `createLocation({ name, isOutside, homeId })`, logs `EVENT.LOCATION_CREATED`, toasts, then fires `onCreated` (the grid refetch) and closes.
- **Manage a location.** Each `LocationOverviewCard` mounts a `LocationManageMenu` kebab, `data-testid="location-manage-{id}"`, opening an action sheet (`location-manage-sheet`) with three gated actions:
  - **Rename** (`location-manage-rename`, gated `locations.edit`) → an inline `location-rename-input` / `location-rename-save`, calling `renameLocation(id, name)`.
  - **Switch inside/outside** (`location-manage-env`, gated `locations.edit`) → `setLocationEnvironment(id, !isOutside)` (drives weather-rule applicability).
  - **Delete** (`location-manage-delete`, gated `locations.delete`) → a `ConfirmModal` ("removes the location and all its areas and plants"), then `deleteLocation(id)`.
  - **The kebab renders NOTHING for a viewer** — `LocationManageMenu` early-returns `null` when the caller has neither `locations.edit` nor `locations.delete`. A member sees Rename + Switch inside/outside but **not** Delete.
- **The card header was restructured** so the drill-in navigation `<button>` and the kebab `<button>` are **siblings** (a button nested inside a button is invalid HTML). The kebab + every menu button `stopPropagation` so managing a card never triggers its drill-in.
- **One DB path.** All four writes go through `src/lib/locationMutations.ts` — the SAME functions LocationManager (`/management`) now calls, so the home grid and the bulk view create/rename/re-flag/delete locations identically. Each function returns the raw `{ error }`; **permission enforcement is the caller's job** — `LocationManageMenu` guards with `can(...)` and `home-add-location-btn` guards `can("locations.create")`, because RLS gates only home membership, not the spatial permission keys (see [RLS Patterns](../99-cross-cutting/19-rls-patterns.md) + [Members & Permissions](../07-management/02-members-permissions.md)).
- **Live refresh.** App passes `onLocationsChanged={handleHomeDataRealtime}` → HomeMain (`onLocationsChanged` prop → `refetchLocations`) → `GardenOverviewGrid` / `LocationOverviewCard` / `LocationManageMenu` (`onChanged`) / `AddLocationSheet` (`onCreated`). Every successful create / rename / env-flip / delete refetches App's `locations` state so the grid updates live without a reload.
- **Empty-garden CTA repoint.** The empty-garden "Create a location" CTA (`empty-garden-add-location`) now opens the **inline `AddLocationSheet`** instead of navigating to `/management?open=add-location`. It is **`can("locations.create")`-gated** (HomeMain uses `usePermissions`) — a viewer on an empty-garden home sees no create button (a review found this CTA was initially ungated after the repoint; fixed both by gating the button and by the in-sheet re-check above).

**Role matrix (unchanged; enforced client-side via `src/lib/permissions.ts:52-80`):** owner / admin → all affordances; **member → create + edit (rename, inside/outside), NOT delete**; **viewer → none** (no add button, no kebab).

### Props received

`HomeMain` (all passed from App.tsx state):

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `profile.home_id` | Scopes TaskList, stats, SeasonalPicksCard |
| `userId` | `string \| null` | `session.user.id` | Launcher pin revalidation; gates The Brief (`brief` renders `null` until set) |
| `firstName` | `string \| null` | `profile.first_name` | Greeting (both heroes) |
| `weather` | `any` | App's extracted current weather | Hero weather chip (sentence) / `weather` console segment |
| `rawWeather` | `any` | Latest `weather_snapshots.data` JSONB | Frost derivation |
| `locations` | `OverviewLocation[]` | App's `locations` state | The grid |
| `locationTaskCounts` | `Record<string, number>` | App's per-location **remaining-today** counts (ghost-aware, `buildLocationTaskCounts`) | Per-card task chip + summed for the today summary |
| `overdueTaskCount` | `number` | App's home-scoped overdue count (RHO-3) | Hero overdue clause / `overdue` console segment |
| `alerts` | `any[]` | Active `weather_alerts` | Hero severe-alert clause (warning/critical may lead the sentence) |
| `homeLat` / `homeLng` | `number \| null` | App's `homeLatLng` | Hero sun micro-line (sentence) / `sun` console segment (both SunCalc) |
| `hardinessZone` | `number \| null` | `homes.hardiness_zone` | Threaded into the hero's ask-AI page context |
| `aiEnabled` | `boolean` | `profile.ai_enabled` | SeasonalPicksCard AI branch + the hero's ask-AI chip (RHO-11) |
| `isPremium` | `boolean` | `profile.enable_perenual` | SeasonalPicksCard |
| `promoSlot` | `React.ReactNode` (optional) | App.tsx — the single-slot onboarding cascade | The `promo` section, rendered below the hero; App keeps ownership of the cascade + eligibility flags |
| `onLocationsChanged` | `() => void` (optional) | App.tsx `handleHomeDataRealtime` | **Stage 4b** — the grid refetch fired after any inline location create / rename / env-flip / delete; threaded into `AddLocationSheet` (`onCreated`) + `LocationManageMenu` (`onChanged`) so the grid updates live |

### State (local)

- `storedPosture` (`useState<HomePosture \| null>`, init-only) — synchronous `readStoredPosture()` read at mount (the ladder: `rhozly:home:preset` > legacy `rhozly:home:density` alias > `null`).
- `posture = resolveHomePosture(persona, storedPosture)` — derived each render: **stored override > persona default** (`experienced` → `workbench`, everything else — including `null` while `usePersona()` is still loading — → `porch`). `preset = HOME_PRESETS[posture]`.
- `setPosture(next)` — writes `storedPosture`, persists `rhozly:home:preset`, **and mirrors** the legacy `rhozly:home:density`. Persisted **only on user toggle** (never on first render) so the persona default isn't frozen before `usePersona()` resolves (the Garden Snapshot preference lesson — that stat wall is gone since Stage 2, but the lesson still governs the posture default).
- `density: "simple" | "detailed"` — a **child-prop compatibility shim** (`posture === "porch" ? "simple" : "detailed"`): block components below (GardenOverviewGrid, TheBrief) still speak simple/detailed, so one mapping here avoids a prop-rename sweep.
- **One-shot entrance stagger refs** — `mountPostureRef` + `entranceDoneRef`: the entrance classes fire on mount only. A posture change moves/remounts the section wrappers (the two layouts differ), which would restart the CSS animation, so the first toggle **permanently retires** the entrance (also belt-and-braces via an 800 ms `setTimeout`).
- App.tsx holds `checklistSlotVisible` (default `true`) — the single-slot gate the checklist reports into via `onVisibilityChange`.

### Persona-preset plumbing (`src/lib/personaPresets.ts`)

Landed in Stage 0, **now the composition engine** (Stage 4 consumes it):

- `effectivePersona(persona)` — **the canonical null⇒new collapse.** Don't re-derive with ad-hoc `persona !== "experienced"` checks in new code.
- `HomePosture = "porch" | "workbench"` + `HOME_PRESETS` registry — per-posture `{sectionOrder, variants}` declarative recipes, consumed by HomeMain's single `renderSection` loop (one registry, one renderer, user override always wins).
- `readStoredPosture()` / `storePosture()` — localStorage key **`rhozly:home:preset`**, with a legacy alias read of `rhozly:home:density` (`"detailed"` → workbench, `"simple"` → porch).
- `resolveHomePosture(persona, stored)` — resolution ladder: explicit override > legacy density alias > persona default. Pure given its inputs (pass `stored` from `readStoredPosture()`) so tests exercise the ladder without localStorage.

**The `variants` map was deleted (dashboard-nav-tasks-tray redesign Stage 1, 2026-07-21).** `HomePreset` now carries only `sectionOrder`. The four never-wired presentation variants (`garden: "photos"|"telemetry"`, `promo: "card"|"line"`, `today: "gentle"|"throughput"`, `brief: "gentle"|"full"`) were removed as dead config — none of them ever changed rendering. The two real per-posture differences are read directly: (a) the hero voice from `posture` (`posture === "workbench" ? "console" : "sentence"`, in `HomeMain`), and (b) the `today` block's "See all" vs "Open board →" affordance (an explicit `posture === "porch"` branch). The Workbench's telemetry chips still come from the `density="detailed"` compat prop into the grid.

**Posture-flash fix (Stage 0):** App.tsx's profile fetch includes `persona` and calls `primePersona(fromProfile)` (`src/hooks/usePersona.ts`) to prime the module cache **before any consumer mounts** — every consumer's first render sees the real persona, killing the porch/workbench layout-flash race. The offline cached-profile boot path primes too (`src/lib/profileCache.ts` `CachedProfile.persona`). `PersonaSetting.tsx`'s save calls `notifyPersonaChanged(next)` so persona flips propagate live. E2E seeds (`supabase/seeds/00_bootstrap.sql`) set `persona = NULL` explicitly so reseeds reset any persona leaked by specs.

### Data flow — read paths

- **`useHomeDashboardStats(homeId)`** — **mounted once, in HomeMain, for BOTH postures.** Feeds (a) the "X of Y done today" breakdown via `buildTodaySummary` (`src/lib/todaySummary.ts`) — **pending** from the ghost-aware client `locationTaskCounts` sum, **done** from the server's completion-aware `tasks.doneToday` (`computeDoneToday`), **skipped/postponed** from the server `dayStrip` today bucket; (b) `totalPlants` for the walk-launcher gate. Soft-fails — null stats still render the today summary's pending count. Don't add second consumers: the `home-dashboard-stats` edge fn is uncached.
- **`useHomeOverview(homeId)`** (`src/hooks/useHomeOverview.ts`) — one `home-overview` invoke on mount / home switch (`today` = client-local date). Generation-guarded; **soft-fails** (grid renders without telemetry chips, attention list empty). Returns `{ locations[], attention[] }`; locations flattened into the `telemetryByArea` map, `attention[]` filtered by HomeMain (below).
- **Attention filtering moved into HomeMain (Stage 2):** `ATTENTION_EXCLUDE_KINDS = ["overdue_tasks", "weather_alert"]` is applied **once, in a memo**, producing `attentionItems`. The hero + task list own overdue; the global [WeatherAlertBanner](./08-weather-alert-banner.md) owns alerts — so only the telemetry + harvest kinds (`automation_failed` / `low_battery` / `soil_dry` / `harvest_closing`) survive. The **same memoised `attentionItems`** feeds both the Workbench's `AttentionRow` and the Porch's `NextBestAction` top rung — filtered here (not inside AttentionRow) precisely so the two postures share one post-filter list.
- **Homes query (App.tsx `fetchDashboardData`):** `supabase.from("homes").select("*, weather_snapshots(data, updated_at), locations(*, areas(id, name), inventory_items(id, status, area_id, growth_state, plant_name))")`. Fires on mount, pull-to-refresh, realtime events, revisit. Caching: the dashboard sessionStorage/localStorage snapshot pattern — see [Caching](../99-cross-cutting/14-caching.md).
- **Inventory realtime refetch (App.tsx `handleInventoryRealtime`)** — carries `area_id, growth_state, plant_name` so a realtime refresh doesn't strip the grid's grouping data.
- **`usePersona()`** — module-cached persona; drives the **posture default** and quick-action defaults. Since Stage 0 the cache is **primed synchronously by App.tsx's profile fetch** (`primePersona`), so the hook's own `user_profiles.select("persona")` read is a first-boot fallback rather than the normal path.
- **`TaskList`**, **`SeasonalPicksCard`**, **`WeekAheadPreview`** — plus **`GardenBrainBriefCard`**, **`AdaptiveCareCard`**, **`HeadGardenerCard`**, **`AssistantCard`** (composed inside **`TheBrief`**) — make their own reads as documented on their own surfaces. (`HomeStatusStrip`, `NextBestAction`, and `TheBrief` itself are props-only — no fetches.)

### Data flow — write paths

- **Posture toggle** → localStorage `rhozly:home:preset` **and** a mirrored `rhozly:home:density` write (legacy readers + e2e specs).
- **Inline location writes (Stage 4b)** → `locations` table via `src/lib/locationMutations.ts`: `createLocation` (INSERT from `AddLocationSheet`), `renameLocation` + `setLocationEnvironment` + `deleteLocation` (UPDATE / DELETE from `LocationManageMenu`). Each is gated **client-side** by the caller's `can("locations.create" | "locations.edit" | "locations.delete")`; a success fires `onLocationsChanged` → App refetch. Delete cascades to areas + inventory per the FK rules.
- **Quiz prompt snooze** → `onboarding_state.quiz_prompt_snoozed_until` via `persistQuizPromptSnooze`.
- Everything else is navigation or delegated to child components (TaskList completion, checklist state writes, AssistantCard dismissals — documented on their own surfaces).
- **View persistence (App.tsx, `rhozly_dashboard_view`):** visiting `/dashboard` with an explicit `?view=` writes the *resolved* view (legacy `dashboard` / `overview` / `locations` persist as `home`). Restore (plain `/dashboard`, once per mount) only accepts `calendar | weather` — stored legacy `"dashboard"` / `"overview"` / `"locations"` deliberately fall through to `home` (Stage 4a dropped `"locations"` from the restore allowlist). See [Routing](../99-cross-cutting/21-routing.md).

### Edge functions invoked

- **`home-overview`** (`supabase/functions/home-overview/index.ts`) — the one-call telemetry aggregate for the grid chips + attention list. `requireAuth` + explicit `home_members` membership check (403 `not_a_member`); body `{ homeId, today }`. Home-bounded parallel reads (locations+areas, inventory grouped per area, devices, `latest_device_readings` RPC, snooze-/window-aware open tasks, active `weather_alerts` max 5, failed `automation_runs` max 5, and — only when the home has valves — `valve_events` last 200 + `automation_valve_queue`). Pure logic in `_shared/homeOverview.ts` (Deno tests HOME-OV-001..010): `deriveValveState`, `soilBand`, `rankAttention` (overdue → weather alert → failed automation → low battery < 25% → dry soil ≤ 24 h fresh → closing harvest window; capped at 4), `summariseSoilReading`. **Note:** `rankAttention` still emits `overdue_tasks` + `weather_alert` — HomeMain filters them out client-side (the shared `attentionItems` memo), so other consumers of the raw payload are unaffected.
- **`home-dashboard-stats`** — via the single `useHomeDashboardStats` mount (both postures). Stat semantics in `_shared/dashboardStats.ts`.

See the [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) for registry entries.

### Cron / scheduled jobs that affect this surface

| Cron | What shows up here |
|------|--------------------|
| `sync-weather` (hourly) | Hero weather chip / console weather + frost segments |
| `analyse-weather` (hourly) | `weather_alerts` → hero severe clause + the global banner (suppressed from the attention list) |
| `generate-tasks` (daily) | Task counts (today summary, per-location chips, the compact TaskList) |
| `update-plant-states` (daily) | `inventory_items.growth_state` — the area-row dot colours |
| `garden-brain` (daily) | `daily_briefs` → GardenBrainBriefCard row; `care_adjustments` → AdaptiveCareCard row (both inside The Brief) |
| `pattern-scan` / `pattern-evaluate` (daily) | `user_insights` → AssistantCard insight row inside The Brief |
| `run-automations` (5 min) | May complete tasks; fires valves → ValveChip state |
| `integrations-ewelink-sync` (periodic) | `device_readings` freshness → SensorChip stale-grey |
| `weekly-overview` (weekly) | Feeds WeekAheadPreview's target page (Workbench only) |

### Realtime channels

No subscriptions of its own — it **inherits App.tsx's home realtime wiring** (`DashboardRealtimeSubscriber`): `home_id`-filtered `postgres_changes` on `locations` / `areas` → full dashboard refetch; `inventory_items` → the lightweight `handleInventoryRealtime` path; `tasks` → task-count refetch.

### Tier gating

- **The grid, heroes, posture toggle, Next Best Action, quick actions, walk launcher and the compact task list have no tier gate** — identical for Sprout / Botanist / Sage / Evergreen. (Next Best Action is Porch-only by *posture*, not tier.)
- **The Brief's rows keep their own gates, deduped (Stage 3):** `HeadGardenerCard` (estate row) renders fully on Evergreen, a compact `UpgradeNudge` teaser below (RHO-2) — and that teaser is **The Brief's single upgrade nudge**: `AssistantCard` (insight row) is passed `showUpgradeWhenLocked={false}` so its own teaser can never double. `WeekAheadPreview` sits inside `FeatureGate feature="ai_insights"` with `fallback={null}` — **hidden** below Evergreen (RHO-9), and Workbench-only by preset.
- `SeasonalPicksCard` keeps its own gating (AI picks for Sage+, deterministic fallback below) — Porch-only by preset. See [Seasonal Picks Card](./14-seasonal-picks.md).
- `AdaptiveCareCard` self-hides by data absence; `GardenBrainBriefCard` uses AI voice on Sage/Evergreen, template below. When every row is empty, The Brief's shell hides itself (the `onVisibilityChange` ledger).
- Launcher tiles filter by each catalogue entry's `isAvailable(ctx)` predicate.

### Beta gating

None.

### Permissions / role-based UI

- **Inline location management (Stage 4b)** is gated **client-side** by the spatial permission keys (RLS gates only home membership, not these keys — client `can()` is the only spatial-key guard):

  | Affordance | Gate | member | viewer |
  |------------|------|--------|--------|
  | `home-add-location-btn` → `AddLocationSheet` | `locations.create` | ✅ | ❌ |
  | `location-manage-rename` | `locations.edit` | ✅ | ❌ |
  | `location-manage-env` (inside/outside) | `locations.edit` | ✅ | ❌ |
  | `location-manage-delete` | `locations.delete` | ❌ | ❌ |
  | The `location-manage-{id}` kebab itself | `locations.edit` OR `locations.delete` | ✅ (rename + env only) | ❌ (no kebab) |

  Owner / admin get everything; member creates + edits but cannot delete; **a viewer sees no manage affordances at all** (`LocationManageMenu` returns `null`, and the add button is gated out). Matrix source: `src/lib/permissions.ts:52-80`. See [Members & Permissions](../07-management/02-members-permissions.md) + [RLS Patterns](../99-cross-cutting/19-rls-patterns.md).
- Other child flows enforce their own keys (TaskList completion, drill-in actions).

### Error states

| State | What happens |
|-------|--------------|
| Dashboard fetch failed | The page renders whatever cached state exists. (The explicit "Could not load dashboard data" retry card lived on the now-retired Locations sub-tab, deleted with it in Stage 4a — the grid simply renders from client-held state / cache on failure.) |
| `home-overview` call failed | **Soft-fail by design** — grid renders without sensor/valve/tasks chips; attention list empty (so no AttentionRow on the Workbench, and Next Best Action falls to its seasonal rung on the Porch). No error UI. |
| `home-dashboard-stats` failed | The today summary still shows the pending count; the walk launcher hides (totalPlants unknown → 0). (No snapshot error card any more — the stat wall was deleted in Stage 2.) |
| Sensor reading older than 24 h | SensorChip greys out. |
| Valve command failed | ValveChip shows red "⚠ Valve failed"; an `automation_failed` attention card may surface (Workbench) / lead the Next Best Action (Porch). |
| No weather yet | The hero's weather chip / console weather segment simply doesn't render. |
| No locations | The 3-CTA setup card (`home-empty-garden`) replaces the grid; its "Create a location" CTA (`empty-garden-add-location`) opens the inline `AddLocationSheet` (Stage 4b — no longer a `/management` navigation). |
| Location with no areas / area with no plants | Inline "+ Add an area…" CTA / "No plants yet" label. |
| Inline location write failed (Stage 4b) | The mutation's `{ error }` surfaces a toast via `Logger.error`; the sheet stays open (create/rename) so the user can retry; the grid is not refetched. Empty-name create/rename is blocked client-side with a "Location name is required" toast. |
| localStorage unavailable | Posture falls back to the persona default each visit; try/catch swallows writes. |

### Performance notes

- `HomeMain` is `lazy()`-loaded and wrapped in `Suspense`.
- First paint of the grid is pure render over already-fetched state; telemetry hydrates in place from the single `home-overview` round trip.
- **One `useHomeDashboardStats` mount** serves the today summary and the walk-launcher gate — the comment in HomeMain explicitly warns against second consumers.
- **One-shot entrance stagger** — the `STAGGER_ENTRANCE` classes + `staggerStyle(i)` play once on mount (cap 6 × 40 ms per the design-system budget) and are permanently retired after the first posture toggle; zero looping animation, compositor-only, `motionTier()`-aware.
- Growth-state dots are capped at 5 per row.
- `usePersona` is module-cached — one profile read per session across all consumers.

### Onboarding tour

`dashboard_tour` (`src/onboarding/flowRegistry.ts`) targets the home in its default **Porch** posture (new-user personas — the tour audience — always land there): `dashboard-view-switcher`, `home-status-strip`, `home-garden-section`, `seasonal-picks-card`, `home-todays-tasks`. **Every anchor exists in the Porch `sectionOrder`** (hero, garden, learn = seasonal-picks-card, today = home-todays-tasks). **The "Quick actions" tour step (anchor `home-quick-actions`) was removed in the dashboard-nav-tasks-tray Stage 1 (2026-07-21) with the launcher grid.** Step 2 copy ("Your day in one sentence") describes the composed sentence — the anchor testid `home-status-strip` is unchanged, which is why the hero rewrite kept the filename + testid.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the front door — and now the *only* dashboard. The old two-tab split (a "Home" grid and a separate "Overview" stats feed) is gone: one page does both jobs, in whichever **posture** suits you. Open the app and in one glance you get the weather, the day's workload, anything overdue, a frost warning if one's coming, and a card for every location showing every area and the state of every plant in it.

For Sarah, the newer gardener, **The Porch** is calm: a friendly greeting whose sentence *is* the summary, then **one card telling her the single next best thing to do** — no attention inbox, no wall of numbers — followed by the garden, a short today's-tasks list, quick actions biased towards learning, and the Seasonal Picks card. If she hasn't set anything up yet, the page becomes a three-step setup card rather than an empty void.

For Marcus, the experienced gardener, **The Workbench** (the default once your persona says "experienced") is the whole operations room on one scroll: the **console hero** — one terse line with the whole day's numbers, every segment tappable — an Attention inbox, live sensor/valve telemetry on every area row, a compact today list with a prominent "Open board →" into the full Calendar, the merged **Brief**, and the Week Ahead preview. On a wide screen the Workbench splits into two columns (the daily flow on the left, the glanceable insight rail on the right); on a phone it flattens back into one sensible stack.

The Phase 4.2 merge kept everything the Overview tab showed; the one later subtraction was the retrospective **Garden Snapshot** stat wall, deleted outright in the stats+locations redesign Stage 2 (2026-07-20) — the hero, the nav overdue badge and the Attention inbox already carried every number worth acting on.

### Every flow on this page

#### 1. The hero — one greeting, two voices

- **The Porch (the sentence voice):** a small uppercase date line, a big warm "Good morning, Vinny", then **one sentence that IS the day's summary**. Frost tonight beats everything ("Frost tonight at 2° — cover anything tender before dark"); then a severe weather warning; then overdue catch-up; then rain ("3 tasks left before today's rain"); then plain progress; then praise or quiet. Beneath it, a faint sun line ("Golden hour 19:42 · sunset 21:32") and at most two chips: **Plan my day** (→ Calendar) and the current weather (→ Weather tab). No chip ever restates a number the sentence already said.
- **The Workbench (the console voice):** the same greeting, compact, followed by **one terse tabular line** — "1/16 today · 2 overdue · 14° light rain · golden hour 20:16". Every number is a segment you can tap through: tasks and overdue open the Calendar, weather and frost open the Weather tab; the golden-hour/sunset segment is a read-only clock. Zero-value segments simply don't appear. The "Ask AI" chip sits at the end of the line (Sage/Evergreen only).
- You never see both — they're the same job at two depths. The old **Daily Brief card is retired** (Stage 2). See [Daily Brief Card — RETIRED](./05-daily-brief-card.md) for the full fact map.

#### 2. The posture toggle (top-right)

Two small icon buttons (list = The Porch, rows = The Workbench). Your choice is remembered on this device; until you ever touch it, the page follows your quiz persona — experienced gardeners start on the Workbench, everyone else on the Porch. (This is the same little toggle that used to be labelled Simple/Detailed — it now switches the *whole posture*, not just the density.)

#### 3. The Porch's Next Best Action (Porch only)

Instead of an inbox of alerts, a new gardener sees **one calm card: the single next best thing to do.** It picks — in order — the most urgent thing your garden actually flagged (a closing harvest window, a dry bed, a failed automation), or, when all is quiet, a gentle "Browse what to plant right now" that scrolls you to the Seasonal Picks. It never shows a count. One tap takes you straight there. See [Next Best Action](./18-next-best-action.md).

#### 4. The Workbench's Needs-attention inbox (Workbench only; hidden when calm)

Up to four ranked cards — **telemetry and harvest only**: amber = failed automation, orange = battery under 25%, yellow = dry soil, lime = harvest window closing. Tap to deep-link. Since Stage 2 the overdue and weather-alert cards **don't appear here** — the hero already tells you about overdue, and the weather alert banner at the top of the app is the one place alerts live. (On the Porch this exact list feeds the single Next Best Action instead.)

#### 5. The Brief — everything Rhozly wants to tell you, in one card (both postures)

Since Stage 3, Rhozly speaks with **one voice**: a single white card headed "FROM RHOZLY" instead of four separate AI cards. Inside, up to four quiet rows, each earning its place only when it has something to say:

- **Your daily brief** — ranks the day's priorities with a good-news line, 👍/👎, and one-tap Apply on care proposals.
- **Garden Brain** — watering-blueprint adjustments proposed from your soil-sensor evidence ("See the numbers" for the data).
- **Your head gardener** — the Estate Report's headline in one line; tap through to `/manager`. (Evergreen; below Evergreen this row is the page's **one** compact upgrade teaser.)
- **AI Insight** — the pattern engine's read on your behaviour; dismissible. (Evergreen; never shows a second upgrade teaser.)

Rows you have no data for simply don't appear, and when *none* do, the whole card stays off the page. On the Porch it sits at the bottom; on the Workbench it leads the right-hand insight rail.

#### 6. Garden Overview grid — one card per location (both postures)

One card per location: indoors/outdoors icon, name, "Outdoors · 3 areas · 12 plants", tasks-today chip, hazard banner, then one row per area with up to 5 growth-state dots (`+N` overflow). On the Workbench each area row also carries — when hardware is connected — soil sensor, valve, and per-area task chips. Tap through to the Location drill-in. Since the stats+locations redesign Stage 3 the area row is deliberately lean: the coloured dots (plus the `+N` overflow and the location's own "· 12 plants" subtitle) already show *how many* and *in what state*, so the old bare per-area count and the "3 flowering · 2 seedling" breakdown line were cut — but the per-area **tasks** chip stays, because it tells you *which bed has work*, not just a repeated number. (Screen-reader users still hear the per-area plant count — it moved to an invisible `sr-only` label, since the dots themselves are hidden from assistive tech.)

**Manage your garden right where you look at it (Stage 4b).** You no longer need to detour to the Manage screen to shape your garden. An **"Add location"** button sits at the top of the grid — tap it to name a new spot (Back Garden, Lounge, Greenhouse), pick **Inside** or **Outside**, and it appears on the grid instantly. Each location card also has a little **⋮ menu** with **Rename**, **Switch to Inside/Outside** (this is what decides whether frost and weather rules apply), and **Delete** (which asks you to confirm, because it takes the areas and plants inside with it). What you can do depends on your role: an **owner** or **admin** can do everything; a **member** can add, rename and re-flag but can't delete; a **viewer** sees no add button and no ⋮ menu at all — the grid is read-only for them. Everything you change here saves to the same place as the full Manage screen (`/management`), so the two never disagree — and the grid refreshes the moment a change lands.

#### 7. The Garden Walk tile (both postures)

Once you have **5 or more plants**, a full-width **"Start a Garden Walk"** tile sits just under today's tasks — a guided check-in on every plant, returning here when you finish. (dashboard-nav-tasks-tray redesign Stage 1, 2026-07-21: the customisable quick-actions launcher grid that used to sit below it was removed — every tile but the Walk duplicated a nav-bar destination, and it sat near the bottom of the page. The picker and catalogue were themselves removed outright 2026-07-23 — `QuickActionsRow` now renders only this tile.)

#### 8. Tasks — compact everywhere, with a prominent Board button in both postures

- **The Porch:** a compact "Today's tasks" list; a real button labelled "See all" opens the Calendar.
- **The Workbench:** the same compact list, but with a prominent **"Open board →"** — the full task-management surface (Daily Tasks, Pending/Completed tabs, every action) now lives on the **Calendar**, one tap away. Both affordances are now real **pill buttons** (stats+locations Stage 3), not faint links. (Stage 4 change: the full tabbed list is no longer embedded on the home page in either posture.)
- **Either way, act without leaving home:** every row in the compact list carries its own complete checkbox, a Postpone button and delete — so ticking off or snoozing today's tasks happens right here (the Q3 accessibility requirement); the board button is only for the *full* board, not for basic completion. (The compact list still owns its "View calendar" link, but the home now hides it — a duplicate of the header pill — via the `hideCalendarLink` prop; the `/quick` calendar keeps it.)

#### 9. Week Ahead (Workbench only, Evergreen only)

A sneak-peek into the weekly overview page — the week's sow / harvest / prune windows. Hidden on the Porch and on non-Evergreen tiers.

#### 10. Garden Snapshot — removed (stats+locations redesign Stage 2, 2026-07-20)

The old "This Week at a Glance" stat wall is **gone.** The retrospective scoreboard (the weekly task tiles, the seven-day dot strip, the garden / weather / automation tiles, the category chips, the per-member breakdown) was cut from the home outright — a gardener never changed what they'd do *today* because of a streak or a completion percentage. Everything worth acting on already lives where you'll see it: the day's numbers **are** the hero, overdue is the hero + the nav badge, dry soil / failed automations / closing harvests are the Attention inbox (Workbench) or the single Next Best Action (Porch), and the week's sow / harvest / prune windows are the Week Ahead card.

#### 11. Seasonal Picks (Porch only)

The weekly "what can I grow right now?" card. The Workbench hides it to stay telemetry-first.

#### 12. First-run cards — one at a time, below the greeting (both postures)

At most **one** promo card ever shows, and it sits **just below the hero** so your greeting is always first. Priority order: Getting Started checklist → Garden Quiz prompt → notification opt-in → PWA install.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "Good morning / afternoon / evening, [name]" | Time-of-day greeting (both heroes) |
| Date eyebrow (Porch) | Small uppercase "SUNDAY 20 JULY" micro-label above the greeting |
| The hero sentence (Porch) | One composed status sentence — highest-priority clause wins: frost tonight (≤ 3 °C) > severe weather alert > overdue > rain today (≥ 1 mm, pairs with tasks left) > tasks left > all-done praise / quiet |
| Sun micro-line (Porch) | "Golden hour 19:42 · sunset 21:32" — refreshes each minute (pauses when the tab is hidden), hides after sunset or without home coordinates |
| "Plan my day" chip (Porch) | Opens the Calendar sub-tab |
| Weather chip (Porch) | Current temp + condition → Weather sub-tab |
| Next Best Action card (Porch) | The single most useful next step — an attention item, else a seasonal "browse what to plant" prompt; never a count |
| The console line (Workbench) | "1/16 today · 2 overdue · 14° light rain · golden hour 20:16" — tap-through segments: tasks/overdue → Calendar, weather/frost → Weather tab, golden hour/sunset read-only; zero-value segments drop |
| "Ask AI" (Workbench) | The migrated "Got a plant question?" entry — opens the Plant Doctor chat with today's context (Sage/Evergreen only) |
| "Needs attention" cards (Workbench) | Ranked triage, max 4 — telemetry + harvest only: failed automation → low battery → dry soil → closing harvest; hidden when calm |
| Indoors / Outdoors icon | Location's `is_outside` flag |
| "Add location" button (grid header) | Opens the inline Add-a-location sheet (Stage 4b); only shown if you can create locations (owner/admin/member) |
| ⋮ menu on a location card | Rename / Switch inside-outside / Delete the location in place (Stage 4b); hidden entirely for viewers; Delete hidden for members |
| Plant dot colours | Sky = Germination, lime = Seedling, green = Vegetative, amber = Budding, pink = Flowering, orange = Fruiting, yellow = Ripening, stone = Senescence, grey = not planted yet |
| Soil chip "OK / Dry / Wet" / "45% · 18.5°" | Moisture band (Dry < 30%, Wet > 70%) / exact reading + soil temp; grey = over 24 h stale; battery icon = under 25% |
| "Watering · N min left" / "⚠ Valve failed" / "Next water HH:MM" | Valve run in progress / last command failed / earliest queued run |
| "Start a Garden Walk" | Appears at ≥ 5 plants; guided per-plant check-in |
| "See all" (Porch) / "Open board →" (Workbench) | Both are **pill buttons** (stats+locations Stage 3) that open the Calendar sub-tab — the Workbench's is the entry to the full task board |
| Row complete checkbox / Postpone / delete (compact today list) | Tick off, snooze, or remove today's tasks **in place** — every compact row carries them in both postures, so basic task-doing never needs the board |

### Tier-by-tier experience

| Tier | Differences on Home |
|------|--------------------|
| Sprout | Full page. On the Workbench: Head Gardener + AI Insight show compact one-line upgrade teasers (deduped to one); Week Ahead hidden. Seasonal Picks (Porch) deterministic. Gated launcher tiles filtered out. |
| Botanist | Same as Sprout. |
| Sage | AI Insight card renders when insights exist; Garden Brain brief uses AI voice; Seasonal Picks AI-personalised; adaptive care active on sensor-equipped homes. Head Gardener still a teaser; Week Ahead still hidden. |
| Evergreen | Everything: Head Gardener full, Week Ahead visible (Workbench). |

### New user vs returning user vs power user

- **Brand new user** (no locations): lands on the **Porch** — the greeting + a quiet "Nothing on the list" sentence, one onboarding card just below it, then the 3-CTA setup card. No walk launcher yet.
- **Returning user:** read the sentence, glance at the Next Best Action (Porch) or the console line (Workbench), tick off today's tasks from the compact list.
- **Power user:** the **Workbench** by default — the console hero line, the Attention inbox, telemetry on every row, The Brief leading the insight rail, and the Week Ahead. The 2-column studio and 5-dot cap keep even large estates on one scrollable screen.

### Beta user experience

No differences (the BetaFeedbackBanner renders app-wide above the page as usual).

### Common mistakes / pitfalls

- **"Where did the Overview tab go?"** Merged into this page (Phase 4.2). Flip the toggle to **The Workbench** — the console hero, The Brief, the "Open board" task board link and Week Ahead are all there (the old stat wall was retired in Stage 2). Old `?view=overview` links land here.
- **"Where did the Daily Brief card go?"** Retired (Stage 2). Nothing was lost — the day's numbers are the hero itself, "Ask AI" sits on the console line, golden hour/sunset live in the hero, and the Zone / Microclimate facts are on Home Management and Garden Layouts.
- **"Where did the Locations tab go?"** Retired (Stage 4a, 2026-07-20). The **garden grid on this page IS the "what's growing where" view now** — one card per location, every area, every plant — so the separate grid-of-tiles tab was pure duplication. Tap a location card to drill in exactly as before; old `?view=locations` links land here. And since Stage 4b you **add / rename / re-flag / delete locations right on the grid** (the "Add location" button + each card's ⋮ menu) — no detour needed. **Manage** (`/management`) is still there for bulk area work and shares the exact same save path.
- **"The full task list disappeared from my dashboard."** Stage 4 change: the home now shows a **compact** today list in both postures; the full board (Pending/Completed tabs, every action) moved to the **Calendar** — tap "Open board →" (Workbench) or "See all" (Porch).
- **"The Porch has no attention inbox."** By design — the Porch distils it into ONE Next Best Action card. Switch to the Workbench for the full ranked inbox.
- **"The attention inbox stopped showing my overdue / weather alert."** By design — the hero owns overdue and the banner owns weather. It's now purely telemetry + harvest.
- **Assuming grey dots mean unhealthy.** Grey means *not planted yet*, not sick.
- **"My stats / Seasonal Picks / Week Ahead disappeared."** The Garden Snapshot stat wall was deleted in Stage 2 — the numbers worth acting on now live in the hero, the nav badge and the Attention inbox. Seasonal Picks is Porch-only; Week Ahead is Workbench + Evergreen only. Check your posture and tier.
- **Toggling posture and expecting it to sync across devices.** Per-device preference (localStorage), not a profile setting.
- **Reading a grey soil chip as a live value.** Grey = sensor silent for over 24 hours.
- **Looking for the walk launcher with 3 plants.** It appears at 5+.

### Recommended workflows

- **Morning glance (30 s, Porch):** hero sentence → Next Best Action (tap it) → scan the grid → tick today's tasks.
- **Estate sweep (Workbench):** console line (tap any segment that's wrong) → Attention inbox → The Brief → telemetry rows → "Open board" for the full task list.
- **Weekly review (Workbench):** read the **Week Ahead** card (sow / harvest / prune windows) and tap through to the full weekly overview.
- **Making the page yours:** set the posture toggle once — it sticks per device.

### What to do if something looks wrong

- **Counts or dots look stale:** pull to refresh. An amber sync pill appears above the page only when data really is stale (over 5 minutes) or has never synced — no pill means you're current.
- **A plant is missing from its area's dots:** check the "Not in an area yet" row.
- **The page keeps opening in the wrong posture:** a stored toggle wins over the persona default — toggle it back.
- **Sensor/valve chips vanished:** the telemetry call soft-failed this visit — reload; if persistent, check the device on Integrations.
- **An old `?view=overview` bookmark "doesn't work":** it works — it lands here by design; switch to the Workbench for the old content.

---

## Related reference files

- [Dashboard Tab (Overview) — ARCHIVED](./01-dashboard-tab.md) — where the merged-away Overview tab's pieces went
- [Daily Brief Card — RETIRED](./05-daily-brief-card.md) — the old Detailed-density hero, deleted in Stage 2; its stub maps where each fact migrated
- [Next Best Action](./18-next-best-action.md) — the Porch's single guided card (the Stage-4 sibling of the Workbench's Attention inbox)
- [Weather Alert Banner](./08-weather-alert-banner.md) — the ONE alert owner on this page (the `weather_alert` attention kind is suppressed here)
- [AI Assistant Card](./06-assistant-card.md) — the insight row inside The Brief
- [Head Gardener](./16-head-gardener.md) — the estate row's parent surface (`/manager`)
- [Weekly Overview Page](./15-weekly-overview.md) — WeekAheadPreview's target
- [Calendar Tab](./03-calendar-tab.md), [Weather Tab](./04-weather-tab.md) — the two other live sub-tabs (the Calendar now owns the full task board)
- [Today's Tasks Tray](../09-persistent-ui/12-today-tasks-tray.md) — the global header-triggered drawer that renders this same compact TaskList on every non-home screen (Stage 2)
- [Locations Tab — RETIRED](./02-locations-tab.md) — the standalone `?view=locations` grid, retired into this page's garden grid in Stage 4a (2026-07-20); its stub maps where each piece went
- [Location Page (Drill-In)](./07-location-page.md) — where card headers and area rows land
- [Quick Access Home](./09-quick-access-home.md) — **ARCHIVED 2026-07-23**; its launcher grid was cut from the home in Stage 1 (2026-07-21, leaving only the Garden Walk tile) and its catalogue + picker code was deleted outright 2026-07-23
- [Garden Walk](./13-garden-walk.md) — the walk launcher's destination
- [Seasonal Picks Card](./14-seasonal-picks.md) — Porch only
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md), [Garden Quiz](../01-onboarding/05-garden-quiz.md), [Notification Opt-In](../01-onboarding/07-notification-opt-in.md), [PWA Install Prompt](../01-onboarding/08-pwa-install.md) — the single-slot cascade
- [Routing](../99-cross-cutting/21-routing.md) — `?view=` params, legacy `dashboard`/`overview` fallthrough, localStorage persistence
- [Garden Brain](../99-cross-cutting/39-garden-brain.md) — brief + adaptive care
- [Pattern Engine](../99-cross-cutting/26-pattern-engine.md) — feeds AssistantCard
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — FeatureGate / ai_insights
- [Design System — Tokens, Motion, Anti-Generic Rules](../99-cross-cutting/40-design-system.md) — the entrance stagger + craft budgets
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md), [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md), [Data Model — Integrations](../99-cross-cutting/09-data-model-integrations.md)
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `home-overview`, `home-dashboard-stats`
- [Weather](../99-cross-cutting/27-weather.md), [Realtime](../99-cross-cutting/15-realtime.md), [Caching](../99-cross-cutting/14-caching.md), [Onboarding State](../99-cross-cutting/30-onboarding-state.md)

## Code references for ongoing maintenance

- `src/components/home/HomeMain.tsx` — page entry; posture resolution (`resolveHomePosture`), the `SECTIONS` map + `renderSection` loop, both layouts (Porch centred column; Workbench 12-col studio with the `contents`/`order` phone-flatten), the posture toggle (same testids, legacy-key mirror), the `density` compat shim, the shared `attentionItems` memo, the one-shot entrance stagger, the single `useHomeDashboardStats` mount, `telemetryByArea` threading, empty-garden card, `walkPlantCount` pass to QuickActionsRow
- `src/lib/personaPresets.ts` — `effectivePersona` (null⇒new), `HOME_PRESETS` (per-posture `sectionOrder`; the `variants` map was deleted in Stage 1), `readStoredPosture`/`storePosture` (`rhozly:home:preset` + legacy `rhozly:home:density` alias), `resolveHomePosture` (unit tests `tests/unit/lib/personaPresets.test.ts`)
- `src/components/home/NextBestAction.tsx` — the Porch's one card: attention → first task (wired in Stage 2 via HomeMain's `TaskEngine.peekCache` read) → seasonal fallback ladder, DOM-scroll to `[data-section="learn"]` / `/shed?open=add-plant` deep-link (unit tests `tests/unit/components/NextBestAction.test.ts`)
- `src/lib/stagger.ts` — `STAGGER_ENTRANCE` classes + `staggerStyle(i)` (cap 6 × 40 ms, fill-mode backwards, `motionTier()`-aware) (unit tests `tests/unit/lib/stagger.test.ts`)
- `src/components/home/HomeStatusStrip.tsx` — the hero: `sentence` + `console` variants, 60s visibility-paused minute tick, SunCalc sun line, "Plan my day" / weather chips (sentence), `hero-console-line` / `hero-seg-{id}` segments + the migrated `daily-brief-ask-ai` chip (console)
- `src/lib/heroSentence.ts` — `composeHeroSentence` (clause ladder), `composeConsoleSegments`, `extractFrostMin` (≤ 3 °C) / `extractRainToday` (≥ 1 mm), `formatSunMicroLine`, `timeOfDayGreeting` (unit tests `tests/unit/lib/heroSentence.test.ts`)
- `src/components/home/TheBrief.tsx` — the merged "From Rhozly" card (Stage 3): the `onVisibilityChange` ledger, `embedded` children, upgrade dedup (unit tests `tests/unit/components/TheBrief.test.ts`)
- `src/components/home/AttentionRow.tsx` — kind → icon/colour map, deep-link routing (the `excludeKinds` filter now lives in HomeMain — AttentionRow renders the pre-filtered list)
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the grid + `SensorChip` / `ValveChip` / tasks chip (`density` prop threads the Workbench telemetry chips). **Stats+locations Stage 3 trim: the bare *visible* per-area count + the "N flowering · N seedling" state-breakdown text were cut and the dead `stateBreakdown()` helper removed; the dots + chips remain, and an `sr-only` per-area plant count was added so assistive tech still gets the quantity (the dots are `aria-hidden`)**. **Stats+locations Stage 4b: the grid header hosts the `home-add-location-btn` (gated `can("locations.create")`, opens HomeMain's `AddLocationSheet`) via an `onAddLocation` prop, and each `LocationOverviewCard` mounts `LocationManageMenu`; the card header was restructured so the drill-in `<button>` and the kebab `<button>` are siblings (button-in-button is invalid HTML), and the `onLocationsChanged` refetch threads down from HomeMain**
- `src/components/home/AddLocationSheet.tsx` — the inline "Add a location" sheet (Stage 4b): `add-location-sheet` / `home-add-location-name-input` / `home-add-location-env-toggle` / `home-add-location-save`; `createLocation` + `EVENT.LOCATION_CREATED` + `onCreated` refetch (HomeMain owns the open state; mounted at `HomeMain.tsx:434`)
- `src/components/home/LocationManageMenu.tsx` — the per-card manage kebab (Stage 4b): `location-manage-{id}` → `location-manage-sheet` with `location-manage-rename` (gated `locations.edit`) / `location-manage-env` (gated `locations.edit`) / `location-manage-delete` (gated `locations.delete`, `ConfirmModal`); returns `null` for a viewer; `stopPropagation` guards against the card drill-in. Mounted from `LocationOverviewCard.tsx:94`
- `src/lib/locationMutations.ts` — the shared `createLocation` / `renameLocation` / `setLocationEnvironment` / `deleteLocation` DB path (Stage 4b), imported by BOTH the home grid and `LocationManager.tsx` (lines 6-10, 239/263/326/364); permission-agnostic — the caller `can()`-gates (unit tests `tests/unit/lib/locationMutations.test.ts`, 4 tests)
- `src/components/home/QuickActionsRow.tsx` — the Garden Walk tile ONLY (Stage 1, 2026-07-21; `walkPlantCount` prop, `dash-garden-walk`) — the customisable launcher-pin grid was removed from the home
- `src/components/TaskList.tsx` — the compact variant both postures render (`compact` + `targetDate`); its per-row inline complete / Postpone / delete are the Q3 in-place task actions, and its internal `task-list-compact-view-calendar` footer is now gated behind a `hideCalendarLink` prop (default `false`) — HomeMain passes `hideCalendarLink` so the home shows only the prominent `taskBoardLink()` pill, while `LocalizedTaskCalendar` (`/quick/calendar`) keeps the footer as its only hop to the full board
- `src/hooks/useHomeDashboardStats.ts` / `src/lib/todaySummary.ts` — the shared stats mount + today summary
- `src/hooks/useHomeOverview.ts` — generation-guarded, soft-failing telemetry fetch (`AttentionItem` type)
- `supabase/functions/home-overview/index.ts` + `supabase/functions/_shared/homeOverview.ts` — telemetry aggregate (Deno tests `supabase/tests/homeOverview.test.ts`)
- `supabase/functions/home-dashboard-stats/index.ts` + `supabase/functions/_shared/dashboardStats.ts` — stat semantics (Deno tests `supabase/tests/dashboardStats.test.ts`)
- `src/App.tsx:~514` — `DashboardView` parsing (`home | calendar | weather`; legacy `dashboard`/`overview`/`locations` → `home` — Stage 4a dropped `locations` from the union + parser allowlist)
- `src/App.tsx:~522` — `rhozly_dashboard_view` persistence + legacy fall-through
- `src/App.tsx:~1745` — slimmed three-tab switcher (Dashboard / Calendar / Weather — Locations dropped Stage 4a) + conditional sync pill; `~1779` — `promoSlot` cascade build + HomeMain mount
- `src/onboarding/flowRegistry.ts` — `dashboard_tour` (Porch anchors; step 2 "Your day in one sentence")
- `src/hooks/usePersona.ts` (`primePersona` / `notifyPersonaChanged`) / `src/lib/profileCache.ts` (`CachedProfile.persona`)
- `tests/e2e/specs/home-main.spec.ts` + `tests/e2e/pages/HomeMainPage.ts` — HOME-001..008, HOME-013, HOME-014 (Stage 4 — HOME-008 seeds the Workbench posture for the attention inbox; HOME-013 seeds the Porch and asserts the Next Best Action surfaces the top attention item. Stats+locations Stage 3 — HOME-014 asserts the compact today list's per-row inline complete + Postpone + the task-board pill are all reachable on the home)
- `tests/e2e/pages/DashboardPage.ts` — `goto()` seeds `rhozly:home:density = detailed` (aliased to the Workbench posture) then visits plain `/dashboard` (classic-content specs ride on that)
- `docs/plans/new-home-dashboard.md` + `docs/plans/hyperplexed-ui-craft-overhaul.md` (§4.2 — the merge) + `docs/plans/home-redesign-two-postures.md` (the two-postures redesign — Stages 0–4 shipped 2026-07-20)
