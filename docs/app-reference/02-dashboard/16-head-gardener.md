# Head Gardener

> The flagship AI garden-manager tab: one first-person manager that oversees the whole home — a confirmed Garden Brief (goals + constraints), a standing Estate Report, a rolling Year Plan, the raw insights feed, and a grounded chat.

**Route / how to reach it:** `/manager` (nav item "Head Gardener", leaf icon). Sub-tabs via `?tab=overview|brief|year|insights|ask`. Also reachable from the dashboard **HeadGardenerCard** entry point.

> **Status (home redesign, `docs/plans/home-redesign-two-postures.md`):** Stage 3 (2026-07-20) merged the dashboard's HeadGardenerCard (with the AI Insight card and the Garden Brain brief + adaptive care) into one dashboard voice — **The Brief** (`src/components/home/TheBrief.tsx`, `the-brief`). The card now renders `embedded` as The Brief's compact **estate row** (same `head-gardener-card` testid, same `dashboard-head-gardener-card` wrapper, same Evergreen gate + compact-nudge fallback — which is The Brief's ONE upgrade teaser — same `/manager` deep link; it reports self-visibility via `onVisibilityChange`). This `/manager` page itself is unaffected.
**Source files (entry points):**
- `src/components/manager/HeadGardenerPage.tsx`
- `src/components/manager/ManagerReportPanel.tsx`
- `src/components/manager/GardenBriefPanel.tsx`
- `src/components/manager/ManagerYearPlan.tsx`
- `src/components/manager/ManagerLog.tsx`
- `src/components/manager/HeadGardenerChat.tsx`
- `src/components/manager/HeadGardenerCard.tsx` (dashboard tie-in)

---

## Quick Summary

Where Rhozly's other AI surfaces fire isolated, reactive alerts, the Head Gardener holds the whole picture. It knows what you *want* (the Garden Brief), compares it against what you *have*, and gives you a goal-by-goal management breakdown, a year plan, and continuity ("last month I flagged X — nice work doing it"). The dominant intent: "tell me how my whole garden is doing and what to do next, like a real gardener would."

---

## Role 1 — Technical Reference

### Component graph

- `HeadGardenerPage.tsx` — hub. `FeatureGate feature="head_gardener"`, URL-driven sub-tabs (`useSearchParams`), header + tab bar. Takes `homeId` prop (passed from `App.tsx` route as `profile.home_id`).
  - `ManagerReportPanel.tsx` — Overview tab; renders the Estate Report (headline, greeting, sections, gaps).
  - `ManagerLog.tsx` — under the report on Overview; the continuity timeline.
  - `GardenBriefPanel.tsx` — Brief tab; AI-draft / edit / confirm flow.
  - `ManagerYearPlan.tsx` — Year Plan tab; this-month / this-season / coming-up.
  - `AiInsightsPage.tsx` — Insights tab; the unified feed, embedded as the raw signal layer. This is now its ONLY home — the standalone `/insights` route + nav item were removed (folded in here); `/insights` redirects to `/manager?tab=insights`.
  - `HeadGardenerChat.tsx` — Ask tab; grounded conversation.

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | `App.tsx` route element (`profile.home_id`) | scopes brief / report / log reads + writes |

### State (local)

- `HeadGardenerPage`: tab is derived from the `?tab=` search param (no local state besides `setParams`).
- `GardenBriefPanel`: `brief`, `editing`, `drafting`, `saving`, plus form fields (`goals`, `styles`, `time`, `budget`, `experience`, `notes`, `aiSummary`, `derivedFrom`).
- `ManagerReportPanel`: `report`, `loading`, `refreshing`.
- `ManagerYearPlan`: `yearPlan`, `loading`, `generating`.
- `ManagerLog`: `entries`, `loading`.
- `HeadGardenerChat`: `messages`, `input`, `sending`.

### Data flow — read paths

- **Garden Brief** — `supabase.from("garden_brief").select("*").eq("home_id", homeId).maybeSingle()` (mount of Brief panel). RLS: home members. No cache.
- **Estate Report** — `supabase.functions.invoke("garden-manager-report", { body: { bust } })` (mount of Overview; `bust:true` on refresh). Returns `{ locked, report, cached }`. The function caches by content hash in `garden_manager_reports`; a cache hit returns instantly without an AI call.
- **Year Plan** — reads the cached `garden_manager_reports.report.yearPlan` row directly (`select("report").eq("home_id")`), no AI cost. Falls back to invoking the report function only if no row exists.
- **Continuity log** — `supabase.from("garden_manager_log").select(...).in("status",["open","acted"]).order("created_at",desc).limit(12)`. RLS: home members.
- **Chat** — `supabase.functions.invoke("head-gardener-chat", { body: { messages } })` per send. Returns `{ reply, savedPreferences }`.
- **Dashboard card** — `HeadGardenerCard` reads `garden_manager_reports` (headline) + an `garden_manager_log` open count directly; renders nothing until a report exists.

### Data flow — write paths

- **Confirm brief** — `supabase.from("garden_brief").upsert({ ...form, confirmed_at, updated_at }, { onConflict: "home_id" })`. RLS-gated. No optimistic UI (reloads after save). No offline queue.
- **Log dismiss / mark-done** — `supabase.from("garden_manager_log").update({ status, resolved_at, outcome_note }).eq("id")`. Optimistic (drops/flips locally before the round-trip).
- **Report generation** writes `garden_manager_reports` (service-role, inside the edge function) and reconciles `garden_manager_log` (closes gaps that have gone, opens fresh gap entries — deterministic).
- **Chat** persists newly-expressed likes/dislikes to `planner_preferences` (source `chat`), deduped against existing prefs.

### Edge functions invoked

- `synthesize-garden-brief` — drafts the brief from quiz/preferences/plants/climate. Returns a draft for the user to confirm; never writes `garden_brief`. Evergreen-gated.
- `garden-manager-report` — builds the Estate Report (brief + `buildUserContext` + `gapAnalysis` + `aggregateInsights` + continuity log). Caches by hash; reconciles the log on regenerate. On-demand (user) + weekly cron (`{cron:true}`).
- `head-gardener-chat` — grounded chat over brief + latest report + context + open log; learns preferences. Read/advise-only.

### Cron / scheduled jobs that affect this surface

- `garden-manager-report-weekly` — Mondays 05:00 UTC (`supabase/migrations/20260821000000_manager_report_cron.sql`). Posts `{cron:true}`; iterates Evergreen homes, reconciles each log, refreshes each report when inputs changed. The Year Plan + dashboard card read whatever this last wrote.

### Realtime channels

None. All reads are request/response; the log uses optimistic local updates.

### Tier gating

- **Sprout / Botanist / Sage:** the `/manager` nav item still renders, but the page shows the `FeatureGate` upgrade nudge (feature `head_gardener` → Evergreen only). All three edge functions return `{ locked: true }` for non-Evergreen tiers (server mirror via `tierAllowsInsights`).
- **Evergreen:** full experience.

Gate knobs: client `src/constants/tierFeatures.ts` (`FEATURE_GATES.head_gardener = EVERGREEN`); server `supabase/functions/_shared/insightTiers.ts` (`tierAllowsInsights`).

### Beta gating

None.

### Permissions / role-based UI

Brief / report / log are **home-scoped** — every member of the home sees the same Head Gardener. No per-permission gating beyond the tier gate.

### Error states

- Network / AI failure on report → panel shows the empty state with a "Check again" action; the feed still returns.
- Brief draft AI failure → falls back to manual setup (the user is never blocked).
- Chat failure → an apologetic assistant message, conversation preserved.
- Tier insufficient → `FeatureGate` upgrade nudge.
- No home → panels render their empty states.

### Performance notes

- `HeadGardenerPage` is lazy-loaded (`React.lazy`) — ~28 kB gzip ~7 kB chunk.
- The report is the highest-context AI call in the app; cost is contained by the Evergreen gate, the `based_on` content-hash cache, the weekly cron cadence, and deterministic pre-computation (`gapAnalysis`, follow-ups) so the model summarises facts rather than computing them. Flash cascade, not Pro. All calls logged to `ai_usage_log`.
- Year Plan + dashboard card read the cached row directly (zero AI cost).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

This is the screen you open when you want someone to just *tell you how your garden is doing*. Not a list of alerts to triage — a considered, joined-up read from someone who knows your whole plot: what you're trying to achieve, what's thriving, what's missing, and what to do this week. For Sarah (amateur) it replaces the anxiety of "am I doing this right?" with a short, confident to-do list. For Marcus (expert) it's a fast situational brief — gaps named with specifics, no hand-holding — that respects his judgement.

The difference from the rest of the app is the **Garden Brief**: once you've told your head gardener what you want (grow your own, year-round colour, attract wildlife, keep it low-maintenance, containers only, family-safe…), everything else is measured against *that*. The manager reasons from your goal → the gap → the fix.

It's also the only surface with **memory**. It remembers what it advised and follows up — and it only ever says "nice work, that's sorted" when your data genuinely shows the gap has closed.

### Every flow on this page

1. **Overview (the Estate Report)** — *What you see:* a green hero with a one-line state-of-your-garden + a warm greeting, then a card per goal (with a Priority / Worth doing / On track badge and a recommendation), then "Gaps worth closing", then your manager's notes. *Action:* read it; tap "Take me there" / "Fix this" to jump to the relevant screen; tap refresh to regenerate. *Why a gardener cares:* it's the weekly catch-up that tells you where to spend your time. *Beginner:* a short, reassuring list. *Expert:* terse, specific, numbers-forward.
2. **Brief** — *What you see:* either your confirmed brief (goals, style, time, experience) or an invite to set one up. *Action:* tap "Draft my brief for me" (AI fills it from your quiz + plants), tweak the chips, then "Confirm brief"; or "Set it up myself". *Why:* this is the north star — get it right and everything else sharpens.
3. **Year Plan** — *What you see:* "This month / This season / Coming up" lists. *Action:* read; "Build my year plan" if none yet. *Why:* turns "what should I be doing now?" into a concrete, season-aware list.
4. **Insights** — the existing unified feed, embedded — the raw signals (frost, pests, watering, stalled plans) your manager draws on.
5. **Ask** — *What you see:* a chat with your head gardener + a few starter questions. *Action:* ask anything ("what should I focus on this week?", "how do I get more winter colour?"). *Why:* grounded, opinionated answers about *your* garden — and it quietly remembers any likes/dislikes you mention.

### Information on display — what every field means

- **Headline** — the honest one-line summary of where your garden stands.
- **Section badge** — Priority (rose, needs attention now), Worth doing (amber), On track (green).
- **Recommendation** (✨ line) — the single next action for that goal.
- **Gap** — a factual shortfall against a goal you set (e.g. "Nothing flowers Nov–Feb"). Gaps are computed from your real plants, not guessed.
- **Manager's notes** — open items (with Mark-done / Dismiss) and recently-closed ones (✓ with a note). A closed note only appears when your data shows the gap actually went.
- **Brief chips** — your goals, styles, weekly time, experience, optional budget.

### Tier-by-tier experience

Head Gardener is **Evergreen-only**. Sprout / Botanist / Sage see an upgrade nudge on `/manager` and on the dashboard card. Evergreen unlocks the brief, report, year plan, log and chat in full.

### New user vs returning user vs power user

- **Brand new** (no brief, few plants): the Brief tab invites setup; the report is sparse and nudges you to plant + set a brief.
- **Returning** (a brief + some plants): a populated report with 2–4 goal sections and the odd gap; a glance tells them the week's focus.
- **Power user** (many plants, a clear brief): rich goal-by-goal sections, precise gaps (harvest continuity, winter colour, toxic-plant flags for family-safe), and a continuity log that tracks progress over time.

### Beta user experience

No beta-only behaviour.

### Common mistakes / pitfalls

- **Thinking the brief is fixed.** It's editable any time — re-derive or tweak it as your goals change; the report follows.
- **Expecting instant changes after acting.** Follow-ups reconcile when the report regenerates (on refresh or the weekly cron), not the instant you complete a task.
- **Treating the Insights tab as the manager.** Insights are the raw signals; the Overview is the manager's synthesis of them.

### Recommended workflows

- *Set your direction:* Brief → "Draft my brief for me" → tweak → Confirm. Then open Overview.
- *Plan your week:* Overview headline + Priority sections → Year Plan "This month".
- *Close a gap:* Overview → "Gaps worth closing" → "Fix this" → act → it reconciles to a ✓ on the next refresh.

### What to do if something looks wrong

- Report looks stale or empty → tap **refresh** on the Overview hero (forces a regenerate).
- Brief looks off → Brief tab → **Edit my brief**.
- A note you've actioned still shows open → **Mark done**, or refresh the report to let it reconcile from your activity.

---

## Related reference files

- [AI Assistant Card](./06-assistant-card.md) — the `user_insights` surface the manager draws on; dashboard tie-in lives next to it.
- [Weekly Overview Page](./15-weekly-overview.md) — the Sunday summary; a sibling AI surface.
- [Pattern Engine](../99-cross-cutting/26-pattern-engine.md) — produces the `user_insights` the report consumes.
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — cascade, JSON mode, caching, cost logging.
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — the three Head Gardener functions.
- [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) — the weekly report cron.
- [Tier Gating](../99-cross-cutting/17-tier-gating.md) — the `head_gardener` gate.
- [Seasonality](../99-cross-cutting/29-seasonality.md) — hemisphere/season logic the gap analysis + year plan use.

## Code references for ongoing maintenance

- `src/components/manager/HeadGardenerPage.tsx` — hub + tabs
- `src/components/manager/GardenBriefPanel.tsx`, `ManagerReportPanel.tsx`, `ManagerYearPlan.tsx`, `ManagerLog.tsx`, `HeadGardenerChat.tsx`, `HeadGardenerCard.tsx`
- `src/lib/gardenBrief.ts`, `src/lib/managerReport.ts` — pure helpers (unit-tested)
- `src/constants/gardenBrief.ts` — brief vocabulary
- `supabase/functions/synthesize-garden-brief/index.ts`
- `supabase/functions/garden-manager-report/index.ts`
- `supabase/functions/head-gardener-chat/index.ts`
- `supabase/functions/_shared/insightSources.ts` — shared insight aggregation (also used by `insights-feed`)
- `supabase/functions/_shared/gapAnalysis.ts`, `supabase/functions/_shared/managerLog.ts` — deterministic logic (Deno-tested)
- `supabase/migrations/20260820000000_head_gardener.sql` — `garden_brief`, `garden_manager_reports`, `garden_manager_log`
- `supabase/migrations/20260821000000_manager_report_cron.sql` — weekly cron
- `supabase/seeds/14_head_gardener.sql` — E2E fixtures
