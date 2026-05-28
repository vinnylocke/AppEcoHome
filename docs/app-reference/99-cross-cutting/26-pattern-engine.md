# Pattern Engine — Detectors, Insights, Behaviour Summary

> Background pattern detection. Detectors run every 8 hours in `pattern-scan`, each producing `pattern_hits`. The `pattern-evaluate` cron scores + dedupes hits into `user_insights` that surface in the AI Assistant Card. A weekly `refresh-behaviour-summary` cron builds a per-user history summary fed to AI prompts.

---

## Quick Summary

```
pattern-scan (cron, every 8h)
└── for each user (in parallel, concurrency cap 10):
    └── for each detector in _shared/patterns/:
        └── detect(userId, homeId, db) → PatternHit[]
            └── batch-upsert into pattern_hits

pattern-evaluate (cron, every 8h, +30 min)
└── score + dedupe pattern_hits → user_insights

user_insights ──► AssistantCard on the dashboard

refresh-behaviour-summary (cron, weekly)
└── reads pattern_hits + recent actions + preferences
    → writes user_behaviour_summary (per user)
    → consumed by Gemini grounding in edge functions
```

---

## Role 1 — Technical Reference

### `_shared/patterns/` directory

Each file exports an async detector:

```ts
async function detect(
  userId: string,
  homeId: string,
  db: SupabaseClient,
): Promise<PatternHit[]>
```

Example detectors (illustrative names):
- `overdueTasksPattern` — "X tasks overdue this week"
- `dryAreaPattern` — moisture trend low
- `seasonShiftPattern` — calendar season change
- `harvestReadyPattern` — fruiting + days-past-planted check
- `lowEngagementPattern` — user hasn't opened in N days

### `PatternHit` shape

```ts
{
  user_id, home_id,
  detector_key, severity: number,
  payload: jsonb,
  detected_at,
}
```

### `pattern-evaluate`

Reads recent `pattern_hits`, applies dedup + scoring (severity × recency), emits `user_insights`:

```ts
{
  user_id, home_id,
  detector_key, headline, body, severity,
  action_label?, action_path?,
  expires_at,
  status: "active" | "dismissed",
}
```

### `user_behaviour_summary`

Per-user weekly summary fed into AI prompts:

```ts
{
  user_id, summary: text,       // human-readable
  preferences: jsonb,           // distilled from quiz + swipe
  recent_themes: jsonb,         // last week's pattern themes
  refreshed_at,
}
```

### Consumer surfaces

- **AssistantCard** — top user_insights on the dashboard.
- **Plant Doctor Chat** — grounding context.
- **Plan suggestions** — generate-landscape-plan reads behaviour summary.
- **Optimise AI** — uses it to tune proposals.

### Beta gating

Some detectors are beta-gated during rollout.

### Manual dismissal

User can dismiss an insight from AssistantCard → marks `user_insights.status = "dismissed"`.

---

## Role 2 — Expert Gardener's Guide

### Why patterns

Rhozly accumulates a lot of data — tasks, plants, weather, lux readings, journal entries. The Pattern Engine looks for non-obvious connections ("you skip pruning when it's hot", "your south bed has been dry 3 weeks in a row") and surfaces them.

### Implications

- AssistantCard suggestions improve as you use the app.
- AI advice gets sharper because it has context.
- Dismissed insights inform future engine tuning.

---

## Related reference files

- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [AI — Gemini](./13-ai-gemini.md)
- [Cron Jobs](./11-cron-jobs.md)

## Code references for ongoing maintenance

- `supabase/functions/_shared/patterns/` directory
- `supabase/functions/pattern-scan/index.ts`
- `supabase/functions/pattern-evaluate/index.ts`
- `supabase/functions/refresh-behaviour-summary/index.ts`
- `supabase/migrations/*_pattern_hits.sql`, `*_user_insights.sql`, `*_user_behaviour_summary.sql`
- `docs/ai-personal-assistant-plan.md` — full plan
