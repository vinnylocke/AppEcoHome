# Plan — 23.0003: Flow registry refresh (walkthroughs)

Wave C of the onboarding overhaul ([master plan](./onboarding-docs-master-audit.md)). Updates the 14 existing walkthroughs to match the current UI and adds **11 new flows** for surfaces shipped since the registry was last touched. **Depends on 23.0001** for the new `triggerSignal` + `prerequisite` mechanics.

## What changes

### A. Refresh existing 14 flows

Each flow gets a per-step copy + selector audit. The biggest churners:

| Flow id | What's wrong | What's fixed |
|---------|--------------|--------------|
| `global_welcome` | Mentions only the 4-tab era — no Weekly Overview, Notes, Voice, Pl@ntNet | Add a 6th slide mentioning the new pillars (Notes, Weekly Overview, Voice, Pl@ntNet identification); mark `important: true` so it bypasses the per-day throttle (23.0001) |
| `home_setup_tips` | Refers to "Location Management" path that's now in Account menu | Update copy to current path; mark `important: true` |
| `dashboard_tour` | Pre-dates TodayFocusCard, WeekAheadPreview, SeasonalPicksCard | Replace steps to anchor on the new cards' `data-testid`s (`dash-today-focus`, `dash-week-ahead-card`, `dash-seasonal-picks`) |
| `garden_hub_tour` | Library-first vs Perenual-first wording | Reflect new search order (Library → Pl@ntNet → Verdantly → Perenual → AI); mention image credit badges |
| `weather_insights_tour` | No mention of Weekly Overview weather section, Golden Hour, 24h alert expiry | Add a 4th step about the Weekly Overview's weather watch |
| `planner_tour` | Pre-dates phase staging + reference photos + Garden Overhaul | Replace 1 step on staging; add 1 step on Overhaul (Sage+) |
| `task_schedule_tour` | "Automation" wording is gone; now "Task Schedule" | Term swap + Optimise tab mention |
| `tools_hub_tour` | Missing Sun Tracker, Companions, Garden Layout 3D | Add 3 new tile-callout steps |
| `plant_doctor_tour` | Pre-dates Plant Lens rename, Pl@ntNet integration, dual-tile output, image credit badges | Substantial rewrite — see new content sketch below |
| `visualiser_tour` | Mostly accurate | Minor copy refresh |
| `add_manual_plant` | The "Manual" tab inside BulkSearchModal exists but the natural path is library-first now | Reorder steps — show library search first, manual as fallback |
| `add_location_and_area` | Accurate | Selectors verified |
| `guides_tour` | Accurate | Selectors verified |
| `profile_quiz_tour` | Pre-dates Voice section, persona settings | Add 1 step on Voice toggle |

### B. Add 11 new flows

Each new flow uses the new pacing mechanics from 23.0001:
- **`triggerSignal`** — fires only after the user touches the feature for the first time, not on first route visit
- **`prerequisite`** — chains so we never fire a deep-feature tour before the welcome flow

| Flow id | Route | Trigger signal | Prereq | Why |
|---------|-------|---------------|--------|-----|
| `quick_access_tour` | `/quick` | (route — mobile only, first session) | `global_welcome` | Mobile users land here; never explained |
| `weekly_overview_tour` | `/weekly` | `first_weekly_visit` | `global_welcome` | Sunday-morning planning page |
| `notes_tour` | `/notes` | `first_notes_visit` | `global_welcome` | Rich text + many-to-many linking |
| `voice_chat_tour` | `/dashboard` (chat overlay) | `first_chat_opened` | `global_welcome` | Mic + read-aloud + auto-read setting |
| `image_credits_tour` | `/credits` | (route) | `global_welcome` | Manual launch from Help Center only |
| `garden_ai_chat_tour` | `/dashboard` (chat overlay) | `first_chat_opened` | `global_welcome` | Chat shape: page context, suggested plants / tasks, plan suggestions |
| `plantnet_identification_tour` | `/doctor` | (route, after `plant_doctor_tour`) | `plant_doctor_tour` | Pl@ntNet vs AI; CC-BY-SA; "Also from Rhozly AI" tile group |
| `nursery_tour` | `/shed` (Nursery toggle) | `first_nursery_open` | `garden_hub_tour` | Packets, sowings, plant-out, calendar |
| `garden_walk_tour` | `/walk` | `first_walk_started` | `garden_hub_tour` | Snap / Note / All good / Skip per plant |
| `seasonal_picks_tour` | `/dashboard` or `/weekly` | (route, after `dashboard_tour`) | `dashboard_tour` | Why personalised picks matter; how the deterministic vs AI fallback works |
| `quick_launcher_customise_tour` | `/quick` | (route — Account → Quick Launcher) | `quick_access_tour` | Add/remove/reorder pinnable tiles |

### C. Plant Doctor flow — full rewrite content sketch

`plant_doctor_tour` is the biggest single rewrite. Sketch of the new steps:

1. **Plant Lens — your in-pocket plant scientist**
   - Anchor: `[data-testid='doctor-upload-zone']`
   - Body: "Take one or more photos of a plant, leaf, or affected area. Plant Lens runs them through Pl@ntNet first (a botany-trained ID database), then asks Rhozly AI for a second opinion."

2. **Three modes — Identify · Diagnose · Pest**
   - Anchor: `[data-testid='doctor-btn-identify']`
   - Body: same as today but rename "Plant Doctor" → "Plant Lens".

3. **Reading the results — Pl@ntNet candidates**
   - Anchor: `[data-testid='identify-plantnet-tile']`
   - Body: "When Pl@ntNet is confident, you'll see its top matches first. Each shows a small CC-BY-SA badge so you can see where the licence comes from."

4. **Reading the results — Also from Rhozly AI**
   - Anchor: `[data-testid='identify-ai-alternative-0']`
   - Body: "Even when Pl@ntNet is confident, Rhozly AI runs in parallel and shows its top guesses underneath. Tap whichever match feels right."

5. **Add to your Shed**
   - Anchor: `[data-testid='doctor-add-to-shed']`
   - Body: Now routes through library-first search, not AI picker.

6. **The history tab**
   - Anchor: `[data-testid='doctor-tab-history']`
   - Body: unchanged.

### D. Screenshot audit

`/assets/onboarding/*.png` referenced by flows: 10 files. Many are pre-Wave-21. We'll:
- For obviously-broken refs (path doesn't exist OR screen has shifted) → set `image: null` and let Shepherd render the body text only.
- For accurate refs → keep as-is.
- We don't re-shoot in this wave — too time-consuming and the body text alone reads cleanly without an image.

## Files modified

| File | Change |
|------|--------|
| [`src/onboarding/flowRegistry.ts`](../../src/onboarding/flowRegistry.ts) | Refresh 14 existing flows + append 11 new flows |
| `/assets/onboarding/*` | No new images (deferred); broken refs nulled out |
| [`docs/app-reference/99-cross-cutting/30-onboarding-state.md`](../app-reference/99-cross-cutting/30-onboarding-state.md) | Add the new flow keys to the surfaces table |

## Cross-wave coupling

This wave **depends on 23.0001** for `triggerSignal` and `prerequisite` to work. If 23.0001 hasn't shipped, the new flows fall back to legacy route-based triggering (no signal check) and they'd all auto-fire on route visit — which would be exactly the bombardment we're trying to fix.

## Tests

- **TypeScript sanity**: registry compiles cleanly (no broken `attachTo` selectors flagged by ESLint).
- **Vitest snapshot**: count of flows by category — ensures the registry has the expected shape.
- **Visual**: re-launch each refreshed flow from the Help Center, verify selectors anchor correctly. Where they don't, fix.

## Tier gating

None. Walkthroughs are universal.

## Deploy

Frontend-only. Minor bump → **23.0003**.

## Estimate

- 14 flow refreshes: ~15 min each → 3.5 hours
- 11 new flows (4–6 steps each): ~25 min each → 4.5 hours
- Selector audit + Shepherd verification: ~1.5 hours
- Total: ~9.5 hours — comfortably one focused wave.

## Risks

- **Anchored selectors can break silently** — if a tested-fine selector breaks in a future commit, the tour step grays out but Shepherd doesn't crash. Acceptable. We add a CI lint that greps for `data-testid` references in the registry but doesn't block on missing ones.
- **Order field collisions** — the new flows all get fresh `order` slots; we leave 0.5 gaps so future inserts don't require renumbering.
- **Without 23.0001 this regresses pacing** — explicitly call out: do NOT ship 23.0003 before 23.0001. The flow registry refresh by itself would make the bombardment worse.
