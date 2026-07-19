# AI Assistant Card

> A purple gradient card showing the most recent unread insight from the pattern engine. Surfaces the AI's read on your gardening behaviour ("you usually water every 3 days but it's been 6 — heatwave?").

**Rendered on:** the merged home in **both densities** (`/dashboard` — [Home (Main Dashboard)](./17-home-main.md), in a `data-testid="dashboard-assistant-card"` wrapper, with `showUpgradeWhenLocked`), `/planner` (PlannerDashboard), `/shed` (TheShed)
**Source file:** `src/components/AssistantCard.tsx`

---

## Quick Summary

A drop-in self-resolving card that fetches the user's recent `user_insights` (created by the `pattern-evaluate` cron) and surfaces the top one. Users can dismiss insights individually; expand to see older un-dismissed ones. Hidden entirely if no insights exist or the user is on a non-AI tier.

---

## Role 1 — Technical Reference

### Component graph

```
AssistantCard
├── Header row
│   ├── Sparkles icon
│   ├── Label: "AI Insight" or "AI · <contextLabel>"
│   ├── Count chip (when > 1 insight)
│   └── Dismiss X button (current insight)
├── Insight text (current)
├── Actions row
│   ├── "Got it" button (dismisses current insight)
│   └── Expand toggle (when > 1 total)
└── Expanded list (when expanded)
    └── Older insights rendered with their own dismiss button
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string \| undefined` | Optional from parent | If omitted, the component self-resolves via `supabase.auth.getUser()` |
| `contextLabel` | `string \| undefined` | Optional from parent | Replaces "AI Insight" with e.g. "AI · Your plans" |
| `showUpgradeWhenLocked` | `boolean` (default `false`) | Opt-in per surface | The card wraps itself in `FeatureGate feature="ai_insights"`; when locked, the fallback is a compact `UpgradeNudge` **only if** this prop is set (RHO-2). The merged home passes it (both densities); Planner/Shed omit it, so the card hides entirely when locked there |

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `resolvedUserId` | `string \| null` | The user id — either prop or self-resolved |
| `insights` | `Insight[]` | Top 20 un-dismissed insights |
| `loading` | `boolean` | Initial fetch in flight |
| `expanded` | `boolean` | Whether to show all or just the top |

### Data flow — read paths

#### `load()` (called on mount + after every dismiss)

```ts
supabase.from("user_insights")
  .select("id, insight_text, created_at")
  .eq("user_id", resolvedUserId)
  .is("dismissed_at", null)
  .order("created_at", { ascending: false })
  .limit(20);
```

#### `surfaced_at` write (best effort)

When the first insight is shown:

```ts
supabase.from("user_insights")
  .update({ surfaced_at: new Date().toISOString() })
  .eq("id", latestId)
  .is("surfaced_at", null);
```

Marks that the user has at least *seen* the insight even if they haven't dismissed it. Used by analytics + future ranking.

### Data flow — write paths

#### Dismiss

```ts
supabase.from("user_insights")
  .update({ dismissed_at: new Date().toISOString() })
  .eq("id", id);
```

Local state filters the dismissed insight out; if no more remain, `expanded` resets to false so the card hides cleanly.

### Edge functions invoked

None directly. Data is written upstream by:
- `pattern-scan` (cron) → writes `user_pattern_hits` rows
- `pattern-evaluate` (cron) → promotes hits into `user_insights` rows via Gemini reasoning

### Cron / scheduled jobs that affect this surface

| Cron | Cadence | Effect |
|------|---------|--------|
| `pattern-scan` | Daily | Runs detectors in `_shared/patterns/*` → `user_pattern_hits` |
| `pattern-evaluate` | After scan | Uses Gemini to decide which hits become surfaceable `user_insights` |
| `refresh-behaviour-summary` | Weekly | Updates `user_behaviour_summary` jsonb used by pattern-evaluate for personalised context |

### Realtime channels

None directly — relies on next fetch. Insights are slow-moving (1-3 per week typical) so polling on mount is sufficient.

### Tier gating

| Tier | Visibility |
|------|------------|
| Sprout | Locked by `FeatureGate feature="ai_insights"` — on the merged home (`showUpgradeWhenLocked`, both densities) a compact `UpgradeNudge` teaser renders; on Planner/Shed the card hides entirely |
| Botanist | Same as Sprout |
| Sage | Visible when at least one insight exists |
| Evergreen | Visible same as Sage |

Two layers: the wrapper's `FeatureGate` (`ai_insights`) gates by tier, and data absence gates within — the pattern engine doesn't run for non-AI users, and the inner card returns `null` when `insights.length === 0`.

### Beta gating

None.

### Permissions / role-based UI

None — insights are per-user, not per-home.

### Error states

| State | Result |
|-------|--------|
| Auth not resolved yet | Card doesn't render (waits for resolvedUserId) |
| No insights | Card doesn't render at all (returns null) |
| Network failure on dismiss | Local state still removes the insight; next page load may resurrect it if write didn't commit |

### Performance notes

- Mounts cheaply — single read on mount, no rerenders on the parent state.
- Self-resolving userId means it can be placed anywhere without prop threading.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why look at this card

The AI Assistant Card is the only surface in Rhozly that talks to you about *your* pattern, not generic gardening advice. The pattern engine watches what you actually do — when you water, when you skip, when you complete tasks late vs on time, what plants you keep adding to the watchlist — and once a week or so spots something worth saying. For beginners, this is the AI mentor coming alongside ("you've watered the herb bed every 3 days for a month; nice rhythm"). For experts, it's the second pair of eyes that catches drift you didn't notice ("you used to prune the roses fortnightly but it's been 5 weeks — life got busy?").

### Every flow on this card

#### 1. Read the insight

- **What you see:** the most recent un-dismissed insight, rendered as a one-paragraph string.
- **What you do:** read it, decide if it changes anything.
- **Why a gardener cares:** because this is the only surface that shows *you* back to yourself.

#### 2. Dismiss the current insight

- Two equivalent buttons: X (top right) or "Got it" (bottom). Either marks `dismissed_at` and removes the card if no more insights remain.

#### 3. Expand to see older insights

- Only visible when `insights.length > 1`. Shows the rest in a vertical list, each individually dismissible.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| "AI Insight" label | Default header |
| "AI · Your plans" (etc.) | When the card is placed on a specific page, the contextLabel customises the header so the user knows it's relevant to that surface |
| Count chip ("3") | Number of unread insights total |
| Insight text | The full insight string from `user_insights.insight_text` |
| "Got it" button | Primary dismiss action |
| Expand toggle | Show older insights |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Card never appears |
| Botanist | Card never appears |
| Sage | Card appears when insights exist |
| Evergreen | Same as Sage |

### New user vs returning user vs power user

- **Brand new user (Sage/Evergreen)**: card doesn't appear for the first few weeks — the pattern engine needs behaviour data to detect anything worth surfacing.
- **Returning user**: typically 1-2 insights per week.
- **Power user**: more behaviour data = more nuanced insights. The expand toggle shows the back-catalog.

### Beta user experience

Same as non-beta. The pattern engine doesn't have beta-specific paths.

### Common mistakes / pitfalls

- **Treating it as advice you must follow.** Insights are observations + hypotheses. "You haven't watered the lavender in 10 days" might be because lavender is established and drought-tolerant — not because you forgot. Dismiss accordingly.
- **Hoping for daily insights.** The pattern engine only surfaces things worth surfacing. Quiet weeks = no card. That's the right behaviour.
- **Wanting to retrieve dismissed insights.** Once dismissed, they don't resurface unless the underlying pattern fires again (which it might, in a different month).

### Recommended workflows

- **Glance weekly:** if the card's there, read it. If not, move on.
- **Expand monthly:** open the expand toggle once a month to skim what you've been ignoring.

### What to do if something looks wrong

- **Insight references a plant you don't have:** dismiss it. The pattern engine occasionally over-generalises. File a beta feedback note so we can adjust.
- **Same insight keeps reappearing:** the underlying pattern is firing repeatedly. Either change the behaviour or ignore.
- **Card never appears (you're Sage/Evergreen):** check `pattern-scan` cron is running for your home. If you have < 30 days of data, that's normal.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — hosts this card in both densities (with `showUpgradeWhenLocked`)
- [Planner Dashboard](../04-planner/01-planner-dashboard.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Pattern Engine (cross-cutting)](../99-cross-cutting/26-pattern-engine.md)
- [AI — Gemini Calls (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/AssistantCard.tsx` — the card itself
- `supabase/functions/pattern-scan/index.ts` — detector orchestrator
- `supabase/functions/pattern-evaluate/index.ts` — Gemini-based promoter
- `supabase/functions/_shared/patterns/*.ts` — individual detectors
- `supabase/functions/refresh-behaviour-summary/index.ts` — weekly context refresh
- `supabase/migrations/*user_insights*` — schema
