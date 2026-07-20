# Dashboard Tab (Overview) — ARCHIVED

> This surface no longer exists. The **"Overview"** sub-tab was merged into the Home dashboard in design overhaul **Phase 4.2** — and after the stats+locations redesign Stage 4a (2026-07-20) retired the Locations tab too, `/dashboard` now has **three** sub-tabs (Dashboard / Calendar / Weather). `?view=overview`, legacy `?view=dashboard`, and legacy `?view=locations` all fall through to the merged home (see [Locations Tab — RETIRED](./02-locations-tab.md)).

Where each piece went:

- **DailyBriefCard** (the hero), the **full TaskList**, and the stat wall (relocated to **GardenSnapshot**, then **deleted outright** in the stats+locations redesign Stage 2, 2026-07-20 — see [Home (Main Dashboard)](./17-home-main.md)) → the merged home's **Detailed** density; **HeadGardenerCard**, **AssistantCard**, and **WeekAheadPreview** (FeatureGate `ai_insights`) → **both** densities (product call 2026-07-19). *(DailyBriefCard was itself later deleted — home redesign Stage 2, 2026-07-20; the one `HomeStatusStrip` hero's console voice replaced it. See [Daily Brief Card — RETIRED](./05-daily-brief-card.md). And in Stage 3, 2026-07-20, HeadGardenerCard + AssistantCard merged with the Garden Brain cards into ONE home card — **The Brief** (`the-brief`); AssistantCard's dashboard nudge is now suppressed there in favour of the estate row's single teaser.)*
- **Quiz prompt card** → the single-slot onboarding cascade in App.tsx's home branch (checklist → quiz → notification opt-in → PWA install).
- **TodayFocusCard** → retired 2026-07-20 with the `/quick` launcher home (it only ever mounted there).
- **EmptyGardenPanel**, **TasksPanel** (via the deleted `HomeDashboard.tsx`) and **WeekPulse.tsx** → retired outright; the merged home's `home-empty-garden` card covers EmptyGardenPanel's role. (The GardenSnapshot day strip that briefly carried WeekPulse's stacked-dot language was itself deleted in the stats+locations redesign Stage 2, 2026-07-20.)

**For the current dashboard documentation, see [Home (Main Dashboard)](./17-home-main.md).** Stat semantics (RHO-13/14/15/16) are documented there and in `supabase/functions/_shared/dashboardStats.ts`.
