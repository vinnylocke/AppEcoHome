# New main dashboard ("Home") + demote current dashboard to "Overview"

## Status

- **Approved 2026-07-02** with decisions: new tab keeps the **"Dashboard"** label (old one becomes "Overview"); **no beta flag**; persona default pins as proposed. Consequence: legacy `?view=dashboard` deep links map to the NEW view (`home`) since that's the tab now carrying the label.
- **Phase 1 implemented 2026-07-02**: view switcher + HomeMain (status strip, overview grid, quick actions, compact today's tasks, seasonal picks in simple mode, density toggle), enriched locations query (`area_id, growth_state, plant_name`), persona pins helpers, HOME-001..007 E2E spec + HomeMainPage, DashboardPage repointed to `?view=overview`. Deviations from plan: the quiz-prompt card stays Overview-only for now (the Getting Started checklist — shared across both views — already carries the quiz nudge, and moving the card would have reordered Overview); detailed-mode week strip/yield deferred to Phase 3 alongside the rest of the persona polish.
- **Phase 2 implemented 2026-07-02**: `supabase/functions/home-overview` (auth + membership, home-bounded parallel reads: locations/areas, per-area plant counts by growth state, latest soil readings via `latest_device_readings` RPC + `devices.battery_percent`, valve state from `valve_events` + `automation_valve_queue`, snooze/window-aware task splits, ranked attention list) with pure helpers in `_shared/homeOverview.ts` (10 Deno tests HOME-OV-001..010: valve countdown/turn_off/failed-queue semantics, soil bands, attention ranking, reading summaries). Client: `useHomeOverview` hook (generation-guarded, soft-fails so the grid never blocks on telemetry), `AttentionRow`, sensor/valve/tasks chips in `AreaRow` (stale readings >24h grey out; "running" never claimed past `duration_seconds`). Seed `13_integrations.sql` (ecowitt integration, soil sensor on Raised Bed A with a now()-stamped reading, valve on South Border with a 2h-old run). E2E HOME-008 exercises the chips + attention row via `mockEdgeFunction`. **Deviation:** the sun-hours chip was dropped — there are no per-area sun columns in the schema (sun analysis is computed client-side from shapes/lux), so it would need its own persistence first; revisit if/when sun analysis lands server-side.
- **Phase 3 implemented 2026-07-02**: detailed-mode `WeekPulse` (compact 7-day dot strip + harvests-due/yield line reusing `home-dashboard-stats`; mounted only in detailed mode so simple mode never pays the fetch; taps through to Overview). Persona default pins + density defaults were already in Phase 1; no further copy changes were needed beyond the component copy itself.

## Goal

Give Rhozly a new main dashboard tab that answers "how is my garden doing right now?" at a glance — designed explicitly for two personas (the new gardener and the pro gardener) — while keeping the current dashboard intact as a sibling tab renamed **Overview**.

The centrepiece is a **Garden Overview grid**: every location and its areas shown neatly on one screen with live sensor readings, valve state, current plants and their status — dense enough for a pro, readable enough for a beginner.

## App-reference files consulted

- `02-dashboard/01-dashboard-tab.md` (current composition + card order)
- `99-cross-cutting/21-routing.md` (URL/view-param patterns, deep links)
- `09-persistent-ui/02-sidebar.md` (nav structure)
- `99-cross-cutting/01-data-model-home.md` (homes → locations → areas)
- `99-cross-cutting/09-data-model-integrations.md` (devices, readings, valves, automations)
- `99-cross-cutting/17-tier-gating.md` (which cards gate on which tier)
- `99-cross-cutting/30-onboarding-state.md` via checklist wiring (quiz/persona source)
- Source read: `App.tsx` nav + `/dashboard` view switcher, `HomeDashboard.tsx`, `LocationTile/LocationPage/AreaDetails`, `useHomeDashboardStats`, `usePersona`, `quickLauncherCatalogue`, `GlobalQuickAdd`, `latest_device_readings` RPC, `valve_events` / `automation_valve_queue`.

---

## 1. Information architecture change

Keep the existing `/dashboard` container and its sub-tab switcher; add a new default view and rename the old one:

| View param | Label | Content |
|---|---|---|
| `?view=home` **(new, default)** | **Home** | The new persona-aware main dashboard (this plan) |
| `?view=overview` (renamed from `dashboard`) | **Overview** | The current dashboard, unchanged |
| `?view=locations` | Locations | unchanged |
| `?view=calendar` | Calendar | unchanged |
| `?view=weather` | Weather | unchanged |

- Backwards compatibility: `?view=dashboard` (old deep links, notifications, GlobalQuickAdd routes) maps to `overview`. Existing deep links keep working.
- `localStorage.rhozly_dashboard_view` persistence stays; a stored legacy value `"dashboard"` is migrated once to `"home"` so everyone lands on the new page at release, then their subsequent choice is respected.
- Nav item stays "Dashboard" (route unchanged); mobile landing stays `/quick`. **No route or nav-order changes** — lowest-risk IA change, no PWA/deep-link fallout.
- The current dashboard is NOT modified beyond its tab label.

## 2. The two personas — what each needs

`usePersona()` reads `user_profiles.persona` (set by the Garden Quiz). The page renders one shared spine with **two density modes**:

- **Simple mode** (default when persona is null/beginner-ish): guidance-first, fewer numbers, bigger touch targets.
- **Detailed mode** (default when persona === "experienced"): telemetry-first, denser grid, more per-area data.

A `Simple / Detailed` toggle in the page header lets anyone override; the choice persists to localStorage **only when the user toggles** (same pattern as the Garden Snapshot preference). Exact persona enum values to be confirmed from `types.ts` during implementation; the rule is "experienced → detailed, everything else → simple".

### The new gardener (simple mode) wants
- **"What should I do today?"** answered immediately — one clear next action.
- Their (few) plants visible with a friendly health/status read, not a wall of stats.
- Prompts that teach: what can I grow right now, complete your profile, add your first area.
- Quick actions biased to *learning and capturing*: identify a plant, add a plant, snap a photo, today's tasks.

### The pro gardener (detailed mode) wants
- **Whole-estate telemetry at a glance**: every location/area with soil moisture, temp, battery, valve state, task load — no drilling in unless something needs attention.
- Anomalies surfaced: dry areas, failed automations, low batteries, open harvest windows, frost tonight.
- Quick actions biased to *operating*: garden walk, calendar, automations, journal capture, light sensor.
- Numbers: week strip, yield, streak (already computed by `home-dashboard-stats`).

## 3. Page composition (top → bottom)

### 3.1 Status strip (both modes)
A slim, single-row header replacing the tall DailyBrief hero on this page (the full DailyBrief stays on Overview):
`Good morning, Vinny · ☀ 21° (feels 23) · 4 tasks today · 1 overdue · ❄ frost tonight 1°`
- Data: already in App state (`weather`, `overdueTaskCount`, alerts, frost hint logic from `DailyBriefCard`). Extracted into a `HomeStatusStrip` component reusing DailyBrief's chip logic.
- Tapping a chip deep-links (tasks → `?view=calendar&date=today`, frost → `?view=weather`).

### 3.2 Attention row (both modes; hidden when empty)
Horizontal scroll of **at most 4 “needs attention” cards**, ranked: overdue tasks → active weather alert → failed automation (last 24h) → sensor out-of-range / low battery → harvest window closing. Reuses `TodayFocusCard`'s decision logic, generalised to emit N items instead of 1.
- New gardener typically sees 0–1 of these (calm); pro sees their real problem list.

### 3.3 Garden Overview grid — the centrepiece (both modes, different density)
One **LocationOverviewCard** per location, responsive grid (1-col mobile, 2–3 col desktop). Each card:

**Header:** location name · in/outside icon · hazard banner (existing field) · tasks-today count chip.

**Body: one AreaRow per area:**

| Element | Simple mode | Detailed mode |
|---|---|---|
| Area name | ✔ | ✔ |
| Plants | count + up-to-5 **status dots** (colour = growth_state; grey = unplanted) with tooltip | same + inline `3 flowering · 1 fruiting · 2 seedling` text |
| Soil sensor (if device linked) | single 💧 chip with plain wording: “Soil: OK / Dry / Wet” | 💧 34% · 🌡 18.2° · EC when present · 🔋 % when <25% |
| Valve (if device linked) | ● Running / idle | ● Running (3 min left) / Last ran 06:00 · Next: 06:00 tomorrow / ⚠ failed |
| Sun/microclimate | — | ☀ 6.2h chip when sun analysis exists |
| Tasks today in this area | dot when >0 | count chip |

- Row tap → existing `AreaDetails` modal; card header tap → existing `LocationPage`.
- Empty states: home with no locations → reuse `EmptyGardenPanel` 3-step CTA; location with no areas → “Add an area” inline CTA; area with no sensors simply omits those chips (no upsell — integrations are open to all tiers).
- "Soil: OK / Dry / Wet" banding derives from the same thresholds the automations use (`heatThreshold`/condition-tree bands) — one source of truth, exact helper chosen at implementation.

### 3.4 Quick actions row (both modes, persona-tuned defaults)
Reuse the existing **quick launcher catalogue + pins** (`quickLauncherCatalogue.ts`, `quickLauncherPrefs`) rather than inventing a second system — the customise UI already exists in GardenerProfile.
- Rendered as 4–6 tiles + a “Customise” link.
- **Default pins become persona-aware** (only when the user has no saved pins): simple → `doctor, today, capture, shed`; detailed → `walk, today, journal, light-sensor` (final sets confirmable at review).
- Desktop gets this row for the first time (today the launcher is `/quick` mobile-only) — pure reuse.

### 3.5 Today's tasks (both modes)
Compact list: top 5 by (overdue first, then due order), “See all →” to `?view=calendar`. Reuses `TaskList` with a new `variant="compact"` cap (render-only prop; engine untouched).

### 3.6 Persona extras (bottom)
- **Simple mode:** `GettingStartedChecklist` (moves here from Overview when view=home is default; still renders on Overview too — it self-hides when complete), quiz prompt card, `SeasonalPicksCard`.
- **Detailed mode:** the **week strip** (7-day bar already computed in `home-dashboard-stats.dayStrip`) + yield/harvest line; AI cards (`HeadGardenerCard`, `AssistantCard`) keep their existing tier gates/teasers.

## 4. Data — one new aggregate endpoint

The grid needs per-area data no current endpoint returns together. Add **`home-overview` edge function** (service-role, membership-checked, same auth pattern as `home-dashboard-stats`):

**Input:** `{ homeId, today, tzOffsetMinutes }`
**One response:**
```
locations[]: { id, name, is_outside, hazard,
  areas[]: {
    id, name,
    plants: { total, byGrowthState: {...}, unplanted },
    sensor: { moisture, tempC, ec, batteryPercent, readingAgeMin } | null,
    valve:  { state: "running"|"idle"|"failed", runningUntil?, lastRunAt?, lastRunStatus?, nextRunAt? } | null,
    sunHours: number | null,
    tasksToday: number
  },
  tasksToday: number }
attention[]: ranked items for §3.2 (overdue count, failed automations 24h, low batteries, out-of-range soil, closing harvest windows)
```
**Sources (all existing):** `locations`/`areas`/`inventory_items` (grouped counts), `latest_device_readings(home_id)` RPC + `devices.battery_percent`, `valve_events` last per device + `automation_valve_queue` pending `fire_at` for next run, `automation_runs` failures (24h), areas' sun analysis fields, tasks due today grouped by `area_id`.
**Constraints honoured:** paged via `fetchAllPages` where fleet-sized; queries bounded per home; tz-aware "today" like the stats function; client caches the response in the existing dashboard-cache pattern (localStorage snapshot, hydrate once per home, background revalidate) and refreshes on the existing realtime signals + visibility.

Client: new `useHomeOverview(homeId)` hook mirroring `useHomeDashboardStats` (generation guard, tz offset, `setStats(null)` on home switch — the patterns we just hardened).

## 5. Files

**New**
- `src/components/home/HomeMain.tsx` — page (view=home)
- `src/components/home/HomeStatusStrip.tsx`
- `src/components/home/AttentionRow.tsx`
- `src/components/home/GardenOverviewGrid.tsx` + `LocationOverviewCard.tsx` + `AreaRow.tsx` (+ tiny `SensorChip/ValveChip/PlantStatusDots`)
- `src/components/home/QuickActionsRow.tsx` (renders launcher pins on desktop)
- `src/hooks/useHomeOverview.ts`
- `supabase/functions/home-overview/index.ts` (+ pure helpers in `_shared/homeOverview.ts` for Deno tests)

**Modified**
- `src/App.tsx` — add `home` view to the switcher (default), rename label `Dashboard`→`Overview` for the old view, `view=dashboard`→`overview` compat mapping, one-time localStorage migration
- `src/lib/quickLauncherCatalogue.ts` / `quickLauncherPrefs.ts` — persona-aware default pins (saved pins untouched)
- `src/components/TaskList.tsx` — `variant="compact"` (render cap only)
- `src/components/shared/TodayFocusCard.tsx` — extract the ranking logic so AttentionRow can consume N items (TodayFocusCard behaviour unchanged)

**Untouched:** the current dashboard content, `/quick`, LocationPage/AreaDetails (reused as drill-ins).

## 6. Gating

- Sensor/valve chips: no tier gate (integrations are ALL-tier); they simply don't render when no devices exist.
- `HeadGardenerCard` / `AssistantCard` / week-ahead: existing `FeatureGate` + compact teaser behaviour, unchanged.
- No beta gate proposed; if you'd rather soft-launch, the `home` view can sit behind the existing beta flag for one release (decision at review).

## 7. Phasing

1. **Phase 1 — IA + page skeleton:** view switcher changes, HomeMain with status strip, overview grid using data already on the client (locations/areas/plants/tasks — no sensors/valves yet), quick actions row, compact tasks. Ships useful on its own.
2. **Phase 2 — telemetry:** `home-overview` edge function + hook; sensor/valve/sun chips + attention row.
3. **Phase 3 — persona polish:** simple/detailed toggle defaults, persona default pins, detailed-mode week strip/yield, copy pass.

## 8. Risks / edge cases

- **Big estates:** 10+ locations × many areas — grid virtualises naturally by card; the edge function payload stays bounded (single home); cap status dots at 5 with "+N".
- **Stale sensor data:** show `readingAgeMin`; grey the chip beyond 24h rather than showing a misleading number.
- **Valve "running" truth:** derive from last `turn_on` valve_event without a newer `turn_off` AND countdown not expired — same logic family as the dead-man's switch; never claim "running" beyond `duration_seconds`.
- **Overview regression risk:** zero — the old view's code path is untouched except its tab label.
- **/quick overlap:** deliberate; /quick stays the one-thumb mobile surface, Home is the rich surface. The launcher pins are shared so customisation carries across.

## 9. Tests & docs (mandatory pairs)

- Deno: `supabase/tests/homeOverview.test.ts` for the pure aggregation helpers (valve-state derivation, attention ranking, soil banding).
- Vitest: launcher persona-default logic; TaskList compact variant cap; view-param migration mapping.
- Playwright: new spec `tests/e2e/specs/home-main.spec.ts` (grid renders seeded locations/areas/plants; tab switcher shows Home/Overview; deep-link compat `?view=dashboard`); Page Object `HomeMainPage.ts`; `data-testid` on every card/chip/action tile.
- Seeds: existing seeded locations/areas/plants suffice for Phase 1; Phase 2 needs a seeded integration device + readings (new `13_integrations.sql` seed) — flagged now.
- **App-reference updates:** new `02-dashboard/17-home-main.md` (via `_template.md`, added to `00-INDEX.md`); edits to `01-dashboard-tab.md` (renamed Overview + new sibling), `21-routing.md` (view params), `09-persistent-ui` nav doc, `10-edge-functions-catalogue.md` (home-overview), `02-dashboard/09-quick-access-home.md` (shared pins note), `30-onboarding-state.md` (checklist surfacing on Home).
