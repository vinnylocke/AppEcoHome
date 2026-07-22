# Little Things — 2026-07-22 batch

Nine small-to-medium items from a live-usage review. Each has its own section:
root cause (for bugs) or design (for features), files to change, tests, and
app-reference updates. Items are independent — they can be approved/implemented
selectively, but the intent is one batch.

## App-reference files consulted

- `docs/app-reference/99-cross-cutting/27-weather.md` (alert generation / notification copy)
- `docs/app-reference/02-dashboard/05-daily-brief-card.md` (brief surface)
- `docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md` (instance modal tabs)
- `docs/app-reference/03-garden-hub/12-senescence.md` (senescence concepts + lifecycle journal contract)
- `docs/app-reference/07-management/05-integrations-devices.md` (device detail / readings UI)
- `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` (glance strip)
- `docs/app-reference/09-persistent-ui/11-bottom-tab-bar.md`, `01-header.md`, `12-today-tasks-tray.md` (nav + tray contracts)
- `docs/app-reference/05-tools/01-tools-hub.md` (tools tiles)
- `docs/app-reference/99-cross-cutting/36-plant-search.md`, `25-plant-providers.md` (search engine + provider merge)
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` (completed-task semantics)

Primary evidence for the root causes below came from reading the source files
directly (paths cited per item).

---

## 1. Daily brief shows "Hot Days Ahead" twice — BUG

**Root cause.** `analyse-weather` upserts one `weather_alerts` row per
`(location_id, type)` (`supabase/functions/analyse-weather/index.ts:208`).
`generate-daily-brief` fetches every active alert for the home
(`supabase/functions/generate-daily-brief/index.ts:68-70`) and
`_shared/dailyBrief.ts:128-136` emits **one brief item per row**. A home with
two outdoor locations gets two `heat` rows → two identical "Hot days ahead"
items.

**Fix.** Dedupe by alert `type` in `gatherSignals()`
(`generate-daily-brief/index.ts:142`) — keep the first message per type before
mapping into `BriefSignals.weatherAlerts`. Render layer untouched; the alerts
themselves stay per-location (WeatherAlertBanner and weather view rely on that).

**Tests.** Extend the existing Deno coverage for the brief items builder in
`supabase/tests/` with a two-locations-same-type case asserting one item.

**App-reference updates.** `02-dashboard/05-daily-brief-card.md` (note the
per-type dedupe), `99-cross-cutting/27-weather.md` (cross-note).

---

## 2. Senescence tab on the plant instance modal — FEATURE

**Today.** `InstanceEditModal` has 11 tabs (`src/components/InstanceEditModal.tsx:87-89`);
end-of-life data (`ended_at`, `was_natural_end`, `end_summary`) surfaces only as
a small badge on Details (line 655), and the record lives as journal rows in
`plant_journals` keyed by subject (`Lifecycle complete%`, `Restored from
Senescence` — see `src/components/plant/PlantInstancesTab.tsx:145-153, 265-269`).

**Design.** New `Senescence` tab, **rendered only when the instance has
`ended_at` set** (no clutter for living plants):
- End date, "Natural end" / "Cut short" badge, `end_summary` text.
- Closing photo (from `plant_journals` where `subject LIKE 'Lifecycle complete%'`
  and `image_url` not null).
- Filtered journal timeline of lifecycle entries (Lifecycle complete / Restored
  from Senescence).
- Restore button with confirm (same mutation as `PlantInstancesTab` restore:
  null the end fields, status → Planted, re-fire `generate-tasks`).

**Files.** New `src/components/InstanceSenescenceTab.tsx`; tab wiring +
conditional button in `InstanceEditModal.tsx` (`data-testid="instance-modal-tab-senescence"`).

**Tests.** Playwright: extend the instance-modal spec — seeded ended instance
shows the tab; living instance doesn't. Seed `06_...`/`02_plants_shed.sql`
already includes an Archived/ended instance (verify; add `ended_at` if the seed
lacks it).

**App-reference updates.** `08-modals-and-overlays/08-instance-edit-modal.md`
(new tab, both roles), cross-link from `03-garden-hub/12-senescence.md`.

---

## 3. Soil behaviour indicators on sensor history — FEATURE

**Today.** `DeviceDetailModal` → `HistoryChart` (recharts; moisture / temp / EC
via `integrations-readings-query`, 24h/7d/30d/12m). Drainage speed is **already
computed** server-side: `compute-soil-profiles` writes
`soil_moisture_profiles` (`drydown_rate_pct_per_day`, `retention_class`,
`drydown_by_weather`, `watering_response`, `confidence`), surfaced today only on
areas via `src/components/area/MoistureBehaviourCard.tsx`.

**Design.** Extend the existing profile rather than invent a second engine:
1. **Migration** — add `temp_behaviour jsonb` and `ec_behaviour jsonb` to
   `soil_moisture_profiles` (existing table → no new Data-API grants needed).
2. **`compute-soil-profiles`** — over the trailing 7d of readings also compute:
   - temp: mean daytime max, mean overnight min, mean diurnal swing;
   - EC: mean, coefficient of variation ("stable / drifting / volatile"),
     7d trend direction.
3. **UI** — new `SoilBehaviourPanel` in `DeviceDetailModal` above the chart:
   three indicator tiles (Drainage — reusing retention class + rate; Day/night
   temperature; EC stability) with plain-language blurbs. EC blurb explains the
   *likely why* deterministically (rising in drying soil = salts concentrating;
   dropping after rain/irrigation = dilution; spike after feeding = fertiliser).
   Show the profile `confidence` as "still learning" below thresholds, mirroring
   MoistureBehaviourCard. Indicators refresh whenever the cron recomputes —
   "update over time" for free.

**Tests.** Deno unit tests for the new temp/EC computations (pure helpers in
`compute-soil-profiles` or a `_shared` module); Playwright: device modal shows
the panel for the seeded soil sensor (seed needs enough readings — extend
`13_integrations.sql` with a 7d reading series + a seeded profile row).

**App-reference updates.** `07-management/05-integrations-devices.md`,
`99-cross-cutting/11-cron-jobs.md` (if the cron contract text changes),
`10-edge-functions-catalogue.md` (compute-soil-profiles description).

**Risk/scope.** Largest item of the batch. The migration is additive; the cron
already iterates devices, so cost is marginal.

---

## 4. "1 planted" chip counts an end-of-life instance — BUG

**Root cause.** `PlantEditModal`'s at-a-glance query selects **all**
`inventory_items` for the plant with no status filter
(`src/components/PlantEditModal.tsx:368-372`), so Archived/ended instances still
count toward "{n} planted · {m} areas" (line 563).

**Fix.** Add `.eq("status", "Planted")` to the glance query. Areas/tasks/lux
derive from the same rows, so they self-correct. With zero planted instances the
strip already self-hides (`glance.instances > 0`, line 552).

**Tests.** Playwright: plant with only an ended instance shows no glance chip
(extend the plant-edit-modal spec).

**App-reference updates.** `08-modals-and-overlays/06-plant-edit-modal.md`
(glance strip counts *planted* instances only).

---

## 5. Phone nav: Tasks replaces Planner; header trigger becomes desktop-only — CHANGE

**Today.** Bottom tabs (`src/App.tsx:1417-1427`): Home, Plants, Capture FAB,
Planner, More. The global Today's-Tasks tray (`TodayTasksTray.tsx`) opens from a
header trigger on **both** platforms (`App.tsx:1534-1552`).

**Design.**
- Replace the `planner` bottom tab with a `tasks` entry: `ListChecks` icon,
  label "Tasks", `onPress: () => setTrayOpen(true)`, carrying the
  `overdueTaskCount` badge. Move the badge off the Home tab at the same time —
  one badge, on the surface that actually answers it.
- Header tray trigger becomes desktop-only (`hidden md:flex`) — phone header
  decluttered as requested; desktop keeps its only tray entry point (the bottom
  bar doesn't exist there).
- Planner on phone stays reachable via the More menu drawer — **verify during
  implementation** that the drawer lists Planner; add it if not. Desktop nav
  (`navLinks`, `App.tsx:1396`) unchanged.

**Tests.** Update the nav Playwright spec + Page Objects that tap the bottom
Planner tab or the header trigger; add a bottom-tab → tray-opens case.

**App-reference updates.** `09-persistent-ui/11-bottom-tab-bar.md`,
`01-header.md`, `12-today-tasks-tray.md`.

---

## 6. Completed tab in the tasks tray — FEATURE

**Today.** The tray body is `TaskList compact` — today's pending + overdue only;
compact mode hides TaskList's own Pending/Completed tab bar
(`src/components/TaskList.tsx:67-73`).

**Design.** Segmented control in the tray header: **Today / Completed**. New
optional TaskList prop `compactView?: "pending" | "completed"` (default
pending — zero change for other compact hosts). Completed view lists tasks with
`status = 'Completed'` and `completed_at` today, newest first, each row keeping
the existing toggle-back-to-Pending behaviour (already in TaskList, line 796).

**Tests.** Playwright: complete a task from the tray → appears under Completed;
toggle back → returns to Today. Update `09-persistent-ui` test-plan rows.

**App-reference updates.** `09-persistent-ui/12-today-tasks-tray.md`.

---

## 7. Remove the Ailments tile from Tools — CHANGE

**Today.** `src/components/ToolsHub.tsx:102-111` — "Ailments" tile pointing at
`/shed?tab=watchlist`. Redundant since Hub v3 made the Garden Hub the one
ailment surface. The "Track on Watchlist" *step* inside the journey card
(line 139) stays — it's part of a guided workflow, not a nav duplicate.

**Fix.** Delete the tile object. Update the tools e2e spec / Page Object if it
asserts the tile.

**App-reference updates.** `05-tools/01-tools-hub.md` (remove the tile row).

---

## 8. Selecting one lavender result selects three — BUG

**Root cause.** In multi-select search hosts, selection identity for
library/AI/manual rows is the **common name**
(`src/components/shed/PlantSearchTakeover.tsx:217-221`: `selectionKey` returns
`sel.common_name` for anything that isn't perenual/verdantly). The library holds
several distinct species that share the common name "Lavender", so they all
resolve to the same key — selecting one paints every same-named row as selected
(`shared/PlantSearch.tsx:580` checks `isSelected(sel)` per row).

**Fix.**
- Key library rows by `lib:${library_id}`; AI/manual rows (no stable id) keep
  the name key. Update `selectionKey`, the `initialCartItems` key derivation
  (`PlantSearchTakeover.tsx:279-296`), and the `detailsCache` writes that use
  the same key — all in lockstep.
- Audit the sibling multi-select hosts for the same pattern and fix identically:
  `PlantSearchModal.tsx`, `shopping/AddItemSheet.tsx`, `BulkSearchModal.tsx`.

**On "what's the best way to dedupe":** these aren't true duplicates — they're
different species sharing a common name (the scientific-name subtitle already
distinguishes them). So we fix the *identity* bug rather than collapsing rows.
Cross-provider repeats (same plant from Perenual and Verdantly) stay deliberately
visible — attribution is the point (item 9 makes it legible).

**Tests.** Playwright: search a name with same-named library rows, select the
top one, assert exactly one row is `data-selected`. Vitest not applicable (keys
are component-local).

**App-reference updates.** `99-cross-cutting/36-plant-search.md` (selection
identity contract).

---

## 9. Provider attribution + Verdantly paging — CHANGE + FEATURE

**Attribution.** Badges exist (`shared/PlantSearch.tsx:101-106`) but Perenual
uses the *identical* colour pair as Library, and the chip sits at the end of the
name where it's easy to miss. Change: distinct palette per source (Library =
primary, Perenual = sky/blue, Verdantly = emerald, AI = amber) and move the chip
to a fixed, always-visible slot on the row (leading edge of the meta line, not
appended to the name). One place — `ResultRow` — covers every host.

**Paging — recommendation: seamless infinite scroll, not fetch-all.**
Both services already return pagination that the merge layer discards:
`VerdantlyService.searchPlants` → `{results, hasMore, nextPage}`
(`src/lib/verdantlyService.ts:54-58`), `PerenualService.searchPlantsPaged`
likewise (`perenualService.ts:119-134`). `searchAllProviders` fetches page 1
only (`src/lib/plantProvider.ts:100-120`).

Fetching *all* pages in one go is the wrong call: it multiplies metered API
calls for results most searches never scroll to, and delays first paint. Instead:

1. New `searchExternalPaged` in `src/lib/unifiedPlantSearch.ts` that holds
   per-provider cursors (`{perenual: {page, hasMore}, verdantly: {page, hasMore}}`),
   returns merged results per fetch, and exposes `loadMore()` semantics.
2. `shared/PlantSearch.tsx` renders an IntersectionObserver sentinel after the
   external section; when visible and any provider `hasMore`, fetch the next
   page(s), append, dedupe by provider id against already-shown rows (guards
   against provider-side page overlap). Small inline spinner while loading;
   sentinel disappears when both providers are exhausted — so the user just
   scrolls and results keep arriving until there are none.
3. `searchAllProviders` keeps its current signature for non-paged callers.

**Tests.** Vitest: cursor bookkeeping in `searchExternalPaged` (mock services).
Playwright: scroll external results → more rows appended (mock/fixture-backed).

**App-reference updates.** `99-cross-cutting/25-plant-providers.md` (paging
contract), `36-plant-search.md` (badges + infinite scroll).

---

## Order of implementation

Quick wins first (4, 7, 1, 8), then UI structure (5, 6, 2), then the two larger
features (9, 3). Each lands with its tests + doc updates in the same commit.

## Release notes

Maintain `release-notes.json` as items land (per the standing workflow); this
batch is incremental fixes/improvements → `--bump N`, not a major.
