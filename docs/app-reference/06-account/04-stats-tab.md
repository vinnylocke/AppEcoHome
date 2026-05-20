# Stats Tab

> Gardener stats summary — current/longest streak, plants added, tasks completed, AI usage, journal entries, etc. A simple 2-column grid of metric tiles.

**Route:** Account Settings, `?tab=stats`.
**Source file:** `src/components/GardenerProfile.tsx` — `StatsTab()` function (~lines 880–917)

---

## Quick Summary

Renders 19 metric tiles in a 2-column grid. Each tile shows an emoji + a value + an uppercase label. Values come from the same `useAchievements` hook used for the Awards tab — so the two tabs are always consistent.

---

## Role 1 — Technical Reference

### Component graph

```
StatsTab
└── grid grid-cols-2
    └── Tile (one per metric)
        ├── Emoji
        ├── Value (tabular-nums)
        └── Label
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `stats` | `AchievementStats` | `useAchievements` (parent) | All values |

### Metrics rendered

| Label | Stat | Format |
|-------|------|--------|
| Current Streak | `streakDays` | "Nd" or "—" |
| Longest Streak | `longestStreak` | "Nd" or "—" |
| Plants Added | `plantAdded` | int |
| Tasks Completed | `taskCompleted` | int |
| Pruning Tasks | `plantPruned` | int |
| Harvests | `plantHarvested` | int |
| Yields Logged | `yieldRecorded` | int |
| Journal Entries | `journalEntries` | int |
| Area Scans | `scansCompleted` | int |
| AI Identifications | `aiIdentify` | int |
| AI Diagnoses | `aiDiagnose` | int |
| AI Chat Messages | `chatMessages` | int |
| Plans Completed | `planCompleted` | int |
| Automations Created | `blueprintCreated` | int |
| Ailments Logged | `ailmentAdded` | int |
| Ailments Resolved | `ailmentResolved` | int |
| Guides Published | `guidesPublished` | int |
| Comments Posted | `commentsPosted` | int |
| Profile Complete | `profileComplete` | Yes/No |

### Data flow

No fetches at this level — receives `stats` as a prop. Hook ([useAchievements](./03-awards-tab.md#data-flow--read-paths-via-useachievements)) is the source.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — every tier sees the same metrics. AI-related counts will be 0 on non-AI tiers.

### Beta gating

None.

### Permissions

- Per-user.

### Error states

| State | Result |
|-------|--------|
| Stats null | Parent shows "No stats yet" placeholder |

### Performance

- Pure render.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

For users who like numbers. "Have I tracked 50 plants yet?" "What's my streak?" "How many tasks have I completed this season?" Stats Tab is the dashboard.

It's also useful before tier upgrades — see your AI usage count to decide whether Sage is worth it.

### Every flow on this tab

#### 1. Read

- Each tile is a single number. Tap nothing — passive display only.

### Information on display — what every field means

| Metric | Meaning |
|--------|---------|
| Current Streak | Consecutive days you've completed at least one task |
| Longest Streak | All-time record |
| Plants Added | Total inventory items added (lifetime) |
| Tasks Completed | All `tasks` with `status = "Completed"` |
| Pruning / Harvests | Type-filtered task counts |
| Yields Logged | Records in `yield_logs` |
| Journal Entries | `plant_journal` posts |
| Area Scans | AI scans of an area |
| AI Identifications / Diagnoses / Chat | Per-action AI session counts |
| Plans Completed | Phase-5 plans |
| Automations Created | Blueprints you've built |
| Ailments Logged / Resolved | Watchlist counts |
| Guides Published / Comments | Community contributions |
| Profile Complete | Quiz done |

### Tier-by-tier experience

Same for every tier. AI metrics zero-out on Sprout/Botanist.

### Common mistakes / pitfalls

- **Treating Plants Added as "currently in your shed".** It's a lifetime count — archived plants still count.
- **Streak resets.** Miss a day, streak resets. Frustrating but intended — there's no "freeze".

### Recommended workflows

- **Periodic check:** glance once a week — watch streak grow.
- **Before upgrading tier:** check AI counts to gauge value.

### What to do if something looks wrong

- **All zeros:** stats hook didn't compute — refresh.
- **Streak feels wrong:** the streak algorithm uses task completion dates — make sure timezone is correct in profile.

---

## Related reference files

- [Awards Tab](./03-awards-tab.md)
- [Account Tab](./01-account-tab.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — StatsTab function
- `src/hooks/useAchievements.ts` — stats aggregation
- `src/lib/achievements.ts` — `AchievementStats` shape
