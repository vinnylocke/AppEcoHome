# Dashboard Tab (Overview) — ARCHIVED

> This surface no longer exists. The **"Overview"** sub-tab was merged into the Home dashboard in design overhaul **Phase 4.2** — `/dashboard` now has four sub-tabs (Dashboard / Locations / Calendar / Weather), and both `?view=overview` and legacy `?view=dashboard` fall through to the merged home.

Where each piece went:

- **DailyBriefCard** (the hero), the **full TaskList**, and the stat wall (now **GardenSnapshot** — collapsible, zero-value tiles hidden, dot-based day strip) → the merged home's **Detailed** density; **HeadGardenerCard**, **AssistantCard**, and **WeekAheadPreview** (FeatureGate `ai_insights`) → **both** densities (product call 2026-07-19). *(DailyBriefCard was itself later deleted — home redesign Stage 2, 2026-07-20; the one `HomeStatusStrip` hero's console voice replaced it. See [Daily Brief Card — RETIRED](./05-daily-brief-card.md). And in Stage 3, 2026-07-20, HeadGardenerCard + AssistantCard merged with the Garden Brain cards into ONE home card — **The Brief** (`the-brief`); AssistantCard's dashboard nudge is now suppressed there in favour of the estate row's single teaser.)*
- **Quiz prompt card** → the single-slot onboarding cascade in App.tsx's home branch (checklist → quiz → notification opt-in → PWA install).
- **TodayFocusCard** → retired 2026-07-20 with the `/quick` launcher home (it only ever mounted there).
- **EmptyGardenPanel**, **TasksPanel** (via the deleted `HomeDashboard.tsx`) and **WeekPulse.tsx** → retired outright; the merged home's `home-empty-garden` card and GardenSnapshot's dot strip cover their roles.

**For the current dashboard documentation, see [Home (Main Dashboard)](./17-home-main.md).** Stat semantics (RHO-13/14/15/16) are documented there and in `supabase/functions/_shared/dashboardStats.ts`.
