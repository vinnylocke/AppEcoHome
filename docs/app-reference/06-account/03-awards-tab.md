# Awards (Achievements) Tab

> Unlocked badges + progress bars for every Rhozly achievement. Six categories (Growing, Tasks, AI, Planning, Health, Explorer) with hidden + reveal-on-unlock badges plus stats-driven progress chips.

**Route:** Account Settings, `?tab=achievements` (label: "Awards").
**Source files:**
- `src/components/GardenerProfile.tsx` — render block
- `src/lib/achievements.ts` — achievement definitions
- `src/hooks/useAchievements.ts` — fetch + stat aggregation

---

## Quick Summary

A 2-column grid of `AchievementCard` items, one per definition in `ACHIEVEMENTS`. Unlocked badges show full colour with the unlock timestamp. Locked badges show a greyed-out preview with a progress bar (e.g. `3 / 5 plants added`). Stats are computed by `useAchievements` from the user's actual data — plants added, tasks completed, AI scans, plans completed, journal entries, comments, streak days, etc.

---

## Role 1 — Technical Reference

### Component graph

```
GardenerProfile (Awards tab)
└── grid of AchievementCard
    ├── Icon (emoji)
    ├── Label + description
    ├── Locked / Unlocked badge
    ├── Unlocked timestamp (if applicable)
    └── Progress bar (if locked + has progress fn)
```

### Data flow — read paths (via `useAchievements`)

The hook computes `stats: AchievementStats` from multiple supabase queries:

| Stat | Source |
|------|--------|
| `plantAdded` | `inventory_items` count |
| `plantPruned` / `plantHarvested` | `tasks` filtered by type + completed |
| `taskCompleted` | `tasks` where `status = "Completed"` |
| `aiIdentify` / `aiDiagnose` | `plant_doctor_sessions` per action |
| `planCompleted` | `plans` where `status = "Completed"` |
| `blueprintCreated` | `task_blueprints` count |
| `ailmentAdded` / `ailmentResolved` | `plant_instance_ailments` |
| `profileComplete` | `user_profiles.quiz_completed` |
| `journalEntries` | `plant_journal` count |
| `yieldRecorded` | `yield_logs` count |
| `scansCompleted` | `area_scans` count |
| `guidesPublished` | `community_guides` count by author |
| `commentsPosted` | `community_guide_comments` count by author |
| `chatMessages` | `chat_messages` count by user, role=user |
| `streakDays`, `longestStreak` | computed from task completion dates |
| `hasWinterTask`, `hasSpringPlanting` | flags derived from task types + dates |

`unlockedKeys` + `unlockedAt` come from `user_achievements` rows.

### Data flow — write paths

#### Unlock
When a stat threshold is crossed, the hook (or a server-side cron) inserts:

```ts
supabase.from("user_achievements").insert({
  user_id, key, unlocked_at: now,
});
```

Surfaces other than this tab can also unlock — e.g. completing a plan in Plan Staging fires `logEvent(PLAN_COMPLETED)` which the achievements engine listens to.

### Achievement definition shape

```ts
{
  key, label, description,
  category: "growing" | "tasks" | "ai" | "planning" | "health" | "explorer",
  icon: emoji,
  check: (stats) => boolean,
  progress?: (stats) => { current, total },
}
```

### Edge functions invoked

- Achievement unlocking is currently client-side; a future cron may sweep all users for missed unlocks.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `refresh-achievements` (planned) | Server-side sweep + retroactive unlocks |

### Realtime channels

None.

### Tier gating

- Same achievement list for every tier. Some achievements (AI-related) are practically impossible without AI tiers — they remain locked.

### Beta gating

None.

### Permissions

- Per-user. No shared achievements.

### Error states

| State | Result |
|-------|--------|
| Stats fetch fails | Loading spinner persists; cards show greyed |

### Performance

- Single hook call computes everything.
- Grid is virtual-friendly (lazy emoji-only icons).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

Awards are the gamification layer — pure motivation, no functional impact. Looking at the locked ones gives you a sense of what you haven't tried yet ("oh, I've never published a community guide — let's give it a go").

### Every flow on this tab

#### 1. Browse

- Scroll the grid.
- Unlocked = full colour + date earned.
- Locked = greyed out + progress bar if there's a measurable target.

#### 2. (Implicit) Earn

- Achievements unlock automatically when you cross a stat threshold somewhere else in the app — adding plants, completing tasks, finishing a plan.
- A toast may fire when one unlocks ("🌳 Plant Collector unlocked!").

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Emoji icon | Visual flair |
| Label | The badge name |
| Description | What earned it |
| Unlocked date | When you got it |
| Progress chip | "3 / 5" for measurable progress |

### Tier-by-tier experience

Same for every tier. Some achievements lean on features only AI tiers have — you can still see them locked.

### Common mistakes / pitfalls

- **Expecting awards to unlock retroactively after data import.** They unlock on event firing; data added historically may not trigger the unlock.
- **Confusing achievements with permissions.** Awards are cosmetic; they don't gate anything.

### Recommended workflows

- **First-week:** check after each task batch — unlocks happen fast early on.
- **Long-term:** treat the locked list as a "things to try" menu.

### What to do if something looks wrong

- **Unlock didn't fire after hitting the threshold:** the event registry may have missed the call. Restart the app to re-eval stats.
- **Unlocked date missing:** older unlocks may not have stored a timestamp — harmless.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Stats Tab](./04-stats-tab.md)
- [Pattern Engine (cross-cutting)](../99-cross-cutting/26-pattern-engine.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — Awards render
- `src/lib/achievements.ts` — definitions
- `src/hooks/useAchievements.ts` — stats aggregation
- `src/events/registry.ts` — event hooks that drive unlocks
- `supabase/migrations/*_user_achievements.sql` — schema
