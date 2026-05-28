# Audit Log

> A read-only timeline of every action members have taken in this home — plus a separate AI usage breakdown by user / function / model / cost. Admin / `audit.view_all` only.

**Route:** `/audit`
**Source file:** `src/components/AuditPage.tsx` (~600 lines)

---

## Quick Summary

Three tabs:

1. **Activity Log** — every `user_events` row for this home, with friendly labels per event type, expandable meta payload, user filter, date range filter.
2. **AI Usage** — every `ai_usage_log` row: timestamp, user, function name, action, model, tokens (prompt + candidates + total), estimated cost in USD.
3. **AI Actions** — every `chat_tool_calls` row: timestamp, user, tool name (with a "destructive" badge for strong-confirm tools), status (executed / failed / cancelled / pending / expired, colour-coded), and the human-readable `preview`. Rows expand to show the raw tool args + any error message. Sourced from the agent (tool-calling Plant Doctor chat) — see [Agent Tools](../99-cross-cutting/35-agent-tools.md).

Filters: user picker, date range (default last 30 days), event-type group. Export CSV / print supported. Mobile collapses the three token columns into one for readability.

---

## Role 1 — Technical Reference

### Component graph

```
AuditPage
├── Header (title, info tooltips)
├── Filter bar (user / date range / event type)
├── User Events section
│   ├── Table header
│   └── Row per event (expandable)
│       ├── Friendly label (EVENT_LABELS)
│       ├── User column (resolved display_name)
│       ├── Timestamp
│       └── Expanded meta JSON
├── AI Usage section
│   ├── Aggregated totals (top tiles)
│   └── Row per call
│       ├── Timestamp / user / fn name / action
│       ├── Tokens columns
│       └── Cost
├── Export CSV button
└── Print button
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |

### `EVENT_LABELS` registry

Long map of `event_type` → human-friendly label. Examples:
- `TASK_CREATED` → "Created a task"
- `PLANT_ADDED` → "Added a plant"
- `AI_IDENTIFY` → "Identified a plant with AI"
- `GARDEN_QUIZ_DONE` → "Completed habit quiz"

About 60+ event types covered.

### Data flow — read paths

```ts
supabase.from("user_events")
  .select("id, user_id, event_type, meta, created_at")
  .eq("home_id", homeId)
  .gte("created_at", startDate)
  .lte("created_at", endDate)
  .order("created_at", { ascending: false });

supabase.from("ai_calls")
  .select("id, created_at, user_id, function_name, action, model, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd")
  .eq("home_id", homeId)
  .gte("created_at", startDate)
  .order("created_at", { ascending: false });
```

User profile names resolved via second query to `user_profiles`.

### Data flow — write paths

Read-only.

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `refresh-behaviour-summary` | Reads `user_events` to build per-user summary for AI prompts |
| `cleanup-old-events` (planned) | Prune events older than N months |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `audit.view_all` — gates the page entirely.
- Without it, the link in the User Profile Dropdown is hidden.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Retry banner |
| Empty | "No activity in this range" |

### Performance

- Default date range = last 30 days (avoids loading everything on first visit).
- Per-row expansion of meta JSON is lazy.
- Pagination via "Show more" or page numbers (varies by implementation).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this page

For shared homes / admin oversight. The Audit Log lets you see who did what when:
- "Did my partner already water the basil today?"
- "Who archived this plant?"
- "How much AI cost did we run up this month?"

Most casual users never open it. Owners of shared homes use it weekly.

### Every flow on this page

#### 1. Filter

- User dropdown → narrow to one member.
- Date range → default last 30 days; widen if needed.
- Event type chip group → focus on a category (Tasks / Plants / AI / etc.).

#### 2. Read events

- Newest first.
- Tap to expand → see the meta payload (e.g. `{ task_id: "...", area: "South Bed" }`).

#### 3. AI Usage section

- **Cost strip** at the top: three tiles showing **Today**, **This Week** (rolling 7 days), and **This Month** (calendar month) spend. Computed against absolute calendar windows so the numbers stay stable regardless of the filter date range below.
- **Cost forecast** bar below — projects monthly spend from the current daily run-rate.
- Per-feature breakdown cards (Plant Doctor, Garden Plan, etc.) — calls, tokens, cost per feature.
- Per-call detail table further below.
- Useful for tracking quota / cost.

#### 4. Export

- CSV download for spreadsheet analysis.
- Print → browser print dialog (save as PDF).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Event label | Human-friendly action description |
| User | Display name of the actor |
| Timestamp | When it happened (home timezone) |
| Meta | Raw JSON payload |
| Tokens | Units of AI text — prompt + candidates + total |
| Cost | Estimated USD per call |

### Tier-by-tier experience

Same for every tier — but AI Usage section is mostly zero for non-AI tiers.

### New user vs returning user

- **New user:** rarely lands here; usually doesn't have `audit.view_all`.
- **Returning shared-home owner:** weekly check-in.

### Common mistakes / pitfalls

- **Default date range too narrow.** Last 30 days hides older context. Widen for historical analysis.
- **Reading meta JSON as truth.** Schemas evolve — older events may have different fields than newer ones.
- **Treating cost as authoritative.** `estimated_cost_usd` is the *estimate* at insert time; actual provider bill may differ slightly.

### Recommended workflows

- **Shared home owner:** weekly review → spot stale data / abandoned tasks.
- **Cost tracking:** end-of-month export → review AI spend.
- **Debugging:** when something seems "off", filter by user + date to find the relevant action.

### What to do if something looks wrong

- **Page shows "no permission":** `audit.view_all` is off for your role. Ask owner.
- **Events missing:** check date range. Older events may have been pruned.
- **AI Usage section empty:** no AI calls in range, or `ai_calls` table not populated.

---

## Related reference files

- [Members & Permissions](./02-members-permissions.md) — `audit.view_all`
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md) — Audit Log link
- [Events Registry (cross-cutting)](../99-cross-cutting/10-edge-functions-catalogue.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/AuditPage.tsx`
- `src/events/registry.ts` — `EVENT` enum + `logEvent` helper
- `supabase/migrations/*_user_events.sql` — schema
- `supabase/migrations/*_ai_calls.sql` — schema
