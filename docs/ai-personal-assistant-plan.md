# AI Personal Assistant — Build Plan

> **Purpose:** A full-stack AI assistant that learns from user behaviour across the app (task completions, postponements, plant interactions) and proactively surfaces personalised insights and nudges.

---

## Progress

- [x] Phase 1 — Event Logging
- [x] Phase 2 — Pattern Detection Engine
- [x] Phase 3 — AI Evaluation Layer
- [x] Phase 4 — Notification Surface & Assistant UI

---

## Architecture Principles

1. **Single registry files** — new event types and new patterns each require changes to exactly one file.
2. **SQL pre-filters are cheap; AI calls are not** — SQL narrows candidates down to a short list, AI only evaluates those candidates with full context.
3. **Predefined templates over AI formatting** — message text uses static templates with variable substitution. AI message generation is reserved for the handful of patterns whose content is genuinely dynamic (e.g. pest recurrence with specific location/suggestion).
4. **No DB enum for event types** — `event_type` is `text`, TypeScript enforces valid values at compile time via the registry. No migration needed when adding events.

---

## Database Schema (overview)

```sql
-- Phase 1
user_events (
  id          uuid primary key,
  user_id     uuid references auth.users,
  event_type  text not null,           -- free text, typed by registry
  meta        jsonb default '{}',      -- arbitrary payload per event
  created_at  timestamptz default now()
)

-- Phase 2
user_pattern_hits (
  id           uuid primary key,
  user_id      uuid references auth.users,
  pattern_id   text not null,          -- matches PatternDetector.id
  plant_id     integer references plants,
  raw_data     jsonb,                  -- the SQL candidate data
  evaluated    boolean default false,  -- true once Phase 3 has processed it
  created_at   timestamptz default now()
)

-- Phase 3
user_insights (
  id           uuid primary key,
  user_id      uuid references auth.users,
  pattern_id   text not null,
  plant_id     integer references plants,
  is_significant boolean,             -- AI verdict: worth surfacing?
  insight_text text,                  -- built from template or AI
  ai_meta      jsonb,                 -- raw AI response for debugging
  surfaced_at  timestamptz,           -- when shown to user
  dismissed_at timestamptz,
  created_at   timestamptz default now()
)
```

---

## Phase 1 — Event Logging

**Goal:** Capture user behaviour throughout the app into `user_events`. Every meaningful action becomes a row. No logic here — just recording.

### Event Registry

Single source of truth at `src/events/registry.ts`:

```typescript
export const EVENT = {
  // Tasks
  TASK_COMPLETED:     "task_completed",
  TASK_POSTPONED:     "task_postponed",
  TASK_SKIPPED:       "task_skipped",
  // Plants
  PLANT_ADDED:        "plant_added",
  PLANT_ARCHIVED:     "plant_archived",
  PLANT_VIEWED:       "plant_viewed",
  // Visualiser
  VISUALISER_CAPTURE: "visualiser_capture",
  VISUALISER_ANALYSE: "visualiser_analyse",
  // Garden profile
  GARDEN_QUIZ_DONE:   "garden_quiz_done",
} as const;

export type EventType = typeof EVENT[keyof typeof EVENT];

export function logEvent(
  userId: string,
  type: EventType,
  meta?: Record<string, unknown>
) {
  return supabase
    .from("user_events")
    .insert({ user_id: userId, event_type: type, meta: meta ?? {} });
}
```

> **To add a new event:** add one line to `EVENT`, call `logEvent(userId, EVENT.YOUR_NEW_EVENT, { ... })` at the trigger point. Nothing else changes.

### What to instrument (Phase 1 scope)

| Trigger location | Event | Key meta fields |
|---|---|---|
| Task "Done" button | `TASK_COMPLETED` | `task_id`, `plant_id`, `task_type` |
| Task "Postpone" button | `TASK_POSTPONED` | `task_id`, `plant_id`, `task_type`, `delay_hours` |
| Task "Skip" button | `TASK_SKIPPED` | `task_id`, `plant_id`, `task_type` |
| Add plant flow complete | `PLANT_ADDED` | `plant_id`, `source` (api/ai/manual) |
| Plant archived | `PLANT_ARCHIVED` | `plant_id` |
| Visualiser capture saved | `VISUALISER_CAPTURE` | `capture_id` |
| Garden quiz completed | `GARDEN_QUIZ_DONE` | `profile_id` |

### Migration

`supabase/migrations/YYYYMMDD_user_events.sql`
- Create `user_events` table with RLS (user sees only own rows)
- Index on `(user_id, event_type, created_at)` for the pattern queries
- Index on `(user_id, meta->>'plant_id', created_at)` for per-plant queries

### Deliverables

- [x] Migration: `user_events` table + indexes + RLS
- [x] `src/events/registry.ts` — EVENT constants + `logEvent` helper
- [x] Wire `logEvent` calls into: task complete, postpone, skip, plant add/archive

---

## Phase 2 — Pattern Detection Engine

**Goal:** A cron-based engine that scans `user_events` for anomalies and writes candidate hits to `user_pattern_hits`. No AI calls here — just cheap SQL.

### PatternDetector interface

Single registry at `supabase/functions/_shared/patterns/index.ts`:

```typescript
export interface PatternHit {
  plantId:  number | null;
  rawData:  Record<string, unknown>;
}

export interface PatternDetector {
  id:     string;   // e.g. "consecutive_postponements"
  label:  string;   // human-readable, for logging
  detect: (userId: string, db: SupabaseClient) => Promise<PatternHit[]>;
}

export const PATTERNS: PatternDetector[] = [
  (await import("./consecutivePostponements")).default,
  (await import("./neglectedPlant")).default,
  (await import("./highPostponeRate")).default,
  // Add new pattern: one file + one line here
];
```

> **To add a new pattern:** create `supabase/functions/_shared/patterns/myPattern.ts` exporting a `PatternDetector`, add one import line to the array. The cron runner picks it up automatically.

### Cron runner

Edge function `pattern-scan` runs via Supabase cron (e.g. every 6 hours):

```typescript
for (const pattern of PATTERNS) {
  const hits = await pattern.detect(userId, db);
  for (const hit of hits) {
    await db.from("user_pattern_hits").upsert({
      user_id:    userId,
      pattern_id: pattern.id,
      plant_id:   hit.plantId,
      raw_data:   hit.rawData,
      evaluated:  false,
    }, { onConflict: "user_id,pattern_id,plant_id" });
  }
}
```

### Initial pattern set

| Pattern ID | What it detects | SQL approach |
|---|---|---|
| `consecutive_postponements` | N postponements in a row for the same plant (regardless of schedule frequency) | Window function on ordered `task_postponed` events per plant |
| `neglected_plant` | Plant with zero completions in last X days (relative to its watering frequency) | Join `user_events` with `plants.watering` field to set X dynamically |
| `high_postpone_rate` | >50% postpone rate for a plant over last 30 days | `COUNT(postponed) / COUNT(total)` per plant |
| `all_tasks_morning` | All completions happen before 9am (good habit) | Hour extraction from `created_at` |
| `streak_broken` | Had a 7-day completion streak, then broke it | Gap detection in daily completion counts |

### Key design decision: schedule-relative thresholds

Raw counts are meaningless without knowing the plant's schedule. Each pattern's `detect` function joins against the `plants` table to get `watering` frequency and adjusts thresholds accordingly:

- Daily-watered plant → "neglected" after 3 days no event
- Weekly-watered plant → "neglected" after 12 days no event
- `consecutive_postponements` counts events relative to expected schedule, not calendar days

### Deliverables

- [x] Migration: `user_pattern_hits` table + RLS
- [x] `supabase/functions/_shared/patterns/index.ts` — interface + registry
- [x] Pattern: `consecutivePostponements.ts`
- [x] Pattern: `neglectedPlant.ts`
- [x] Pattern: `highPostponeRate.ts`
- [x] Edge function: `pattern-scan` (cron, every 6 hours)
- [x] Supabase cron job wired up (replace YOUR_PROJECT_REF + YOUR_ANON_KEY before remote push)

---

## Phase 3 — AI Evaluation Layer

**Goal:** Take the candidate hits from Phase 2 and use AI to decide (a) whether the pattern is actually significant given full context, and (b) what the insight payload should be. AI is only called on candidates — not on every user.

### Context passed to AI

For each candidate hit:
- Plant name, species, watering frequency, sunlight requirements
- User's location / climate zone (from garden profile)
- Current season (derived from location + date)
- Recent weather summary (optional — requires weather API integration, can be added later)
- The raw pattern data (e.g. "postponed 4 times, expected frequency weekly")
- Last 20 `user_events` for that plant for context

### Edge function: `pattern-evaluate`

Called by `pattern-scan` after writing hits (or as a separate second-pass cron):

```typescript
const prompt = buildEvaluationPrompt(hit, plantContext, userProfile);
const result = await callGemini(prompt, EVALUATION_SCHEMA);
// result: { isSignificant: boolean, confidence: number, insightKey: string, vars: {...} }

if (result.isSignificant) {
  await db.from("user_insights").insert({
    user_id:      userId,
    pattern_id:   hit.pattern_id,
    plant_id:     hit.plant_id,
    is_significant: true,
    insight_text: buildMessage(result.insightKey, result.vars),
    ai_meta:      result,
  });
}
await db.from("user_pattern_hits").update({ evaluated: true }).eq("id", hit.id);
```

### Message templates

Static templates keyed by `insightKey`. AI returns the key + variable values — we do the substitution, no AI generates the message text:

```typescript
const TEMPLATES: Record<string, string> = {
  consecutive_postponements:
    "Looks like {plant_name} watering has been pushed back {count} times in a row — might be worth adjusting the schedule.",
  neglected_plant:
    "{plant_name} hasn't had any attention in {days} days. A quick check-in might be due.",
  high_postpone_rate:
    "You've postponed {plant_name} watering {rate}% of the time recently. A less frequent schedule might suit it better.",
  streak_broken:
    "You had a {streak}-day care streak going — nice work. {plant_name} is lucky to have you.",
};
```

AI generates free-form text only for the small set of patterns where template substitution can't capture the nuance (e.g. pest recurrence with specific pest type and location-based suggestion).

### Deliverables

- [x] Migration: `user_insights` table + RLS
- [x] `supabase/functions/_shared/templates.ts` — TEMPLATES map + `buildMessage()`
- [x] Edge function: `pattern-evaluate`
- [x] Evaluation prompt template

---

## Phase 4 — Notification Surface & Assistant UI

**Goal:** Surface insights to the user in the right place at the right time. Non-intrusive by default — a persistent assistant card on the home screen, plus optional push notifications for high-priority insights.

### Home screen assistant card

- Lives at the top of the home/dashboard tab
- Shows the single most recent unread `user_insights` row
- "See all" expands to a full list
- Each insight has a "Got it" dismiss button (sets `dismissed_at`)
- Insight cards use the plant's thumbnail as an accent image

### Notification strategy

| Insight type | Delivery |
|---|---|
| Low urgency (streaks, gentle nudges) | Card only — no push notification |
| Medium urgency (neglected plant, high postpone rate) | Card + push if user has notifications enabled |
| High urgency (potential plant health risk) | Push notification with action button |

### Deliverables

- [x] Home screen assistant card component
- [x] "All insights" list view (inline expand)
- [x] Dismiss / acknowledge flow
- [ ] Push notification integration (Capacitor Push + Supabase trigger or edge function)

---

## Open Questions / Future Extensions

- **Weather API**: Integrate OpenWeatherMap or similar to give AI evaluator real weather context. Adds significant value to pattern relevance but is non-trivial (user location consent, API costs).
- **User feedback loop**: "Was this helpful?" thumbs up/down on insights → feeds back into confidence thresholds for that pattern.
- **Cross-plant patterns**: Currently all patterns are per-plant. Could detect "you tend to neglect all plants in winter" as a cross-plant pattern.
- **Proactive scheduling suggestions**: If `high_postpone_rate` fires repeatedly, suggest a reschedule directly with a one-tap "Update schedule" CTA in the insight card.
