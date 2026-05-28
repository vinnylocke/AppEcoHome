# UI Wave 3 — Dashboard + Quick Access polish

## Goal

Lift the two landing surfaces toward 95+:
- **Quick Access (mobile, `/quick`)** 88 → ~94
- **Desktop Dashboard (`/dashboard`)** 82 → ~92

Two new shared components do the heavy lifting:

1. **`<TodayFocusCard>`** — a small smart-prompt card that picks ONE of: overdue-task nudge, weather alert, streak milestone, or a quiet "all caught up" — and renders it at the top of BOTH landing surfaces. Cross-platform consistency baked in by reuse.

2. **`<DashboardOnboardingPanel>`** — replaces the 20-zero-stats grid on the desktop dashboard when the home has no plants + no schedules yet. Three action tiles: Add a Location / Add Plants / Set a Watering Reminder.

Plus a Garden Snapshot collapse so the stats grid stays available to experienced users but doesn't dominate the dashboard for newcomers.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](docs/app-reference/02-dashboard/01-dashboard-tab.md)
- [`docs/app-reference/02-dashboard/02-quick-access.md`](docs/app-reference/02-dashboard/02-quick-access.md)
- [`docs/app-reference/02-dashboard/14-seasonal-picks.md`](docs/app-reference/02-dashboard/14-seasonal-picks.md) — the SeasonalPicksCard already on `/quick`.

---

## Today's Focus card

### Decision logic (priority order, top wins)

| # | Condition | Variant | Copy |
|---|---|---|---|
| 1 | `tasks.overdue >= 1` AND it's after 8 AM | `urgent` (red accent) | "X overdue task(s) — finish them off →" |
| 2 | A weather alert exists for today (heat or frost) | `weather` (amber accent) | "Hot/Frost forecast — your plants may need water/cover →" |
| 3 | `tasks.streak >= 3` AND no `urgent` items | `streak` (emerald accent) | "X-day streak — keep it going →" |
| 4 | Nothing urgent + no streak yet | `quiet` (muted) — show on dashboard, **hide on /quick** (the SeasonalPicksCard already fills this slot there) | "All caught up. Nothing urgent today." |

Tapping a non-quiet variant navigates to the relevant surface (`/schedule?filter=overdue`, weather card, etc).

### Data source

Both surfaces already have access to:
- `useHomeDashboardStats` → tasks.overdue, tasks.streak.
- `WeatherForecast` → today's weather alerts.

Card reads from the same `useHomeDashboardStats` hook used in `HomeDashboard`. On `/quick` we can fetch the stats lazily (only the fields needed for the prompt).

### Persona-aware behaviour

- `experienced` persona: card is slightly more compact, tighter copy ("3 overdue. Finish?" vs "3 overdue tasks — finish them off →").
- `new` / null: full descriptive copy.
- This is the second persona-aware surface after `<InfoTooltip>`.

---

## Dashboard onboarding panel

When `garden.totalPlants === 0 && tasks.total === 0` AND `automations.totalAutomations === 0`:

```
┌──────────────────────────────────────────────────────────────┐
│  Welcome to your dashboard 🌿                                │
│                                                              │
│  Once your garden is set up, this is where you'll see        │
│  what's needed today, weather alerts, and how you're doing.  │
│  Start here:                                                 │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ Add a    │  │ Add      │  │ Set a    │                    │
│  │ Location │  │ Plants   │  │ Watering │                    │
│  │          │  │          │  │ Reminder │                    │
│  └──────────┘  └──────────┘  └──────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

Each tile is a small card with icon + title + 1-line blurb + chevron, that navigates to the relevant screen. Uses the design tokens consistent with QuickTile.

The Getting Started checklist (shipped in Wave 1) stays above this panel — they're complementary surfaces. The checklist shows step-by-step progress; this panel shows BIG visible next-actions for the truly-empty state.

## Garden Snapshot collapse

The big stats grid (existing `<StatsPanel>`) gets wrapped in:

```tsx
<details className="...">
  <summary>Garden Snapshot — tap to expand</summary>
  <StatsPanel ... />
</details>
```

Open by default for users with `persona === "experienced"`, collapsed by default for `new` / null. Persisted to localStorage so subsequent visits remember the user's preference.

---

## Files

| File | Change |
|---|---|
| `src/components/shared/TodayFocusCard.tsx` | NEW — smart prompt, 4 variants, persona-aware copy. |
| `src/components/shared/DashboardOnboardingPanel.tsx` | NEW — 3 action tiles for empty-home dashboard. |
| `src/components/HomeDashboard.tsx` | Render `<TodayFocusCard>` at the top; render `<DashboardOnboardingPanel>` in place of stats when truly empty; wrap stats in collapsible `<details>` with persona default. |
| `src/components/QuickAccessHome.tsx` | Render `<TodayFocusCard>` above the tile grid (hide when `quiet` variant). |
| `tests/unit/components/TodayFocusCard.test.ts` | NEW — variant selection logic + copy. |

---

## Risks & edge cases

- **`/quick` doesn't currently use `useHomeDashboardStats`** — adding it adds a DB round-trip on every quick-access visit. Mitigated by the hook's existing 60s cache.
- **`<details>` styling** isn't always pretty out of the box. We'll style it to look like a button + open-state with caret.
- **Empty-home detection is binary** — if a user has plants but 0 schedules, they currently get the stats grid (with low numbers) rather than the panel. Acceptable — they've made progress past "absolute zero" and the empty grid is informative at that point.
- **TodayFocusCard on `/quick` competes with SeasonalPicksCard** — both are "what to do now" prompts. Priority: TodayFocusCard wins when there's urgency (overdue / weather), else hidden so SeasonalPicksCard owns the slot.

---

## Steps

1. Build `<TodayFocusCard>` with decision logic + tests.
2. Build `<DashboardOnboardingPanel>`.
3. Integrate into HomeDashboard + QuickAccessHome.
4. Wrap stats panel in `<details>` collapsible.
5. Typecheck + tests + deploy.
