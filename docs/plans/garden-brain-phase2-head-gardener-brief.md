# Garden Brain — Phase 2: the Head Gardener briefing (implementation plan)

**Date:** 2026-07-10 · **Parent:** [`garden-brain-strategy.md`](./garden-brain-strategy.md) (greenlit) · Phase 1 shipped OS 37.0001. **Awaiting approval before any code.**

**Goal:** one ranked morning voice. Every signal the app already produces — overdue/today tasks, Phase-1 care adjustments + verifications, pattern insights, weather alerts + weather tasks, harvest/pruning windows, automation failures, low batteries, and the good news — synthesised into a single dashboard brief with a reason and a one-tap route per item. **AI is tier-gated by design (user directive)**: the synthesis prose is Sage/Evergreen; lower tiers get the full deterministic brief with template copy.

## App-reference consulted
- [`99-cross-cutting/39-garden-brain.md`](../app-reference/99-cross-cutting/39-garden-brain.md) (Phase 1), [`26-pattern-engine.md`](../app-reference/99-cross-cutting/26-pattern-engine.md), [`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md), [`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md), [`11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md), [`12-notifications.md`](../app-reference/99-cross-cutting/12-notifications.md), [`35-agent-tools.md`](../app-reference/99-cross-cutting/35-agent-tools.md), [`02-dashboard/17-home-main.md`](../app-reference/02-dashboard/17-home-main.md).

## Verified foundations
- **Per-tier model ladders exist**: `agent-chat/chatModels.ts` `modelsForTier(tier)` → EVERGREEN (led by gemini-3.1-pro-preview, tier-exclusive), SAGE (2.5-pro-led), FLASH (everything else). Reused, not duplicated.
- **AI grounding standard** (established memory): `buildUserContext` as the context base, `logAiUsage` for context/prompt/result/cost, `ai_feedback` rows (`rating ±1, function_name, target_kind/target_id`), and a regenerate-with-feedback path.
- Signals all queryable server-side: `tasks` (overdue/today), `care_adjustments` (open + freshly verified + `in_range` good news), `user_insights`, `weather_alerts` (active), `task_blueprints` windows, `automation_runs` (failed, 24h), `devices.battery_percent`.

## Mid-build discovery (2026-07-10) — the existing Head Gardener AI Manager

The codebase already has a **strategic** "Head Gardener" suite (missed by the inventory sweep): `synthesize-garden-brief` (goals/constraints draft → user-confirmed `garden_brief` row), `garden-manager-report` (Estate Report, cached, Evergreen via `tierAllowsInsights`/`FEATURE_GATES.head_gardener`) and `head-gardener-chat` (see `docs/plans/head-gardener-ai-manager.md`). **Amendments to avoid collision and integrate:**
- **Rename** this phase's surface to the **Daily Brief** (card "Your daily brief"; fn `generate-daily-brief`; table `daily_briefs` unchanged) — the Head Gardener manager is the standing strategy layer; the Daily Brief is the Garden Brain's operational morning note. Docs will state the relationship.
- **Integrate**: when a `garden_brief` row exists, its `goals` are passed into the Sage/Evergreen prose prompt so the daily voice aligns with the home's stated goals.
- **Config catch**: cron-invoked functions require `verify_jwt = false` in `supabase/config.toml` — `garden-brain-reconcile` (Phase 1) was missing and its 03:45 prod cron would have 401'd on first fire tomorrow; **fixed in this deploy** alongside the new `generate-daily-brief` entry.

## Design

### 1. `daily_briefs` table (migration)
`(home_id uuid, brief_date date, payload jsonb, tier text, model text, generated_by text CHECK ('deterministic','ai'), created_at, PK (home_id, brief_date))`. RLS members SELECT; INSERT/UPDATE service-role. Grants: SELECT to authenticated. Payload:
```ts
{ summary: string;                    // 2–3 sentences, the "voice"
  items: BriefItem[];                 // ranked, capped at 6
  goodNews: string[];                 // 0–2 lines ("Raised Bed A on track"; "✓ verified")
  stats: { overdue, dueToday, windowsOpen } }
// BriefItem: { kind, title, reason, route, score, meta }
```

### 2. Pure assembly + ranking — `_shared/dailyBrief.ts` (Deno-tested)
`assembleBrief(signals) → { items, goodNews, stats }` with a deterministic scoring table (tested): overdue block (score 100) > stress_risk/care proposals (90) > active weather alerts today (80) > windows opening/closing ≤3 days (70) > failed automations (65) > pattern insights (50) > low battery <20% (40). Good news from `in_range` + fresh `verified_good` + a 3-day completion streak. Template `summary` builder for the deterministic tier (persona-neutral, plain words). Cap 6 items; each carries `route` (deep link) + `reason` (the "why", from the signal's own numbers).

### 3. Generator — `generate-daily-brief` edge fn + cron 04:30 UTC
After the 03:45 reconcile. Per home **with recent activity** (mirror pattern-scan's 7-day activity filter — cost control):
1. Fetch signals → `assembleBrief` → deterministic payload (every eligible home gets this).
2. **Tier gate (owner tier, same rule as Phase 1):**
   - **Sprout/Botanist** → store deterministic brief (`generated_by:'deterministic'`, no Gemini call, no model).
   - **Sage/Evergreen** → one Gemini call via `modelsForTier(tier)` (Evergreen's 3.1-pro ladder stays exclusive): rewrite `summary` (and lightly polish item reasons) in the head-gardener voice, grounded on `buildUserContext` + the assembled items. Strict JSON schema; **on any AI failure, fall back to the deterministic payload** (brief always exists). `logAiUsage` with context/prompt/result + cost.
3. Upsert on `(home_id, brief_date)` — idempotent; re-runs refresh.
4. **On-demand regenerate** (authenticated member, Sage+ only, rate-limited): `{ homeId, regenerate: true, feedback?: string }` — includes the user's recent `ai_feedback` comments for this function in the prompt (the regenerate-with-feedback requirement).

### 4. Dashboard card — `HeadGardenerBriefCard` (top of HomeMain, both densities)
- Summary line(s) + ranked items (simple density: summary + top 3; detailed: all + `reason` numbers), each item tapping through to its `route`; good-news lines render green and calm.
- **Feedback**: 👍/👎 → `ai_feedback` (`function_name:'generate-daily-brief'`, `target_kind:'daily_brief'`, `target_id: brief_date`), thumbs-down opens an optional comment; **Refresh** (Sage+) calls regenerate with that feedback. Snapshot-cached for offline (`rhozly:snap:v1:daily-brief:{homeId}`).
- Deterministic-tier card is identical minus the AI voice + Refresh; a subtle "Upgrade for your AI head gardener" line only on the deterministic card (no dark patterns).
- Renders nothing when no brief row for today (e.g. brand-new home pre-cron).

### 5. Chat grounding — new read tool `get_daily_brief`
`agent-chat/tools.ts` Phase-1 read tool (auto risk, sprout+ — it reads the stored brief, no new AI): "what should I do today?" grounds on the same voice. One executor + catalogue row (35-agent-tools doc).

### 6. Morning push — minimal daily-batch extension
`daily-batch-notifications` already fires each user's task digest at their local `reminderTime`: when today's brief exists for the home, prepend its `summary` first sentence to the digest body (pure helper + fallback to unchanged body when absent). No new pref, no new channel — the brief is content inside the existing digest. Flagged as the riskiest touch; covered by a Deno test on the helper.

## Tier summary (the user directive, explicit)
| Tier | Brief | Voice | Refresh/regenerate | Chat tool |
|---|---|---|---|---|
| Sprout/Botanist | ✅ deterministic | template copy | — | ✅ (reads stored brief) |
| Sage | ✅ | **AI (SAGE ladder)** | ✅ | ✅ |
| Evergreen | ✅ | **AI (EVERGREEN ladder — 3.1-pro exclusive)** | ✅ | ✅ |

## Files
**Server:** migration (`daily_briefs`, cron 04:30), `_shared/dailyBrief.ts` (pure), `generate-daily-brief/index.ts`, `agent-chat/tools.ts` + read executor, `daily-batch-notifications` helper.
**Client:** `src/components/home/HeadGardenerBriefCard.tsx` (+ HomeMain mount above AdaptiveCareCard), feedback wiring.
**Docs:** 39-garden-brain (Phase 2 section), 11-cron-jobs, 35-agent-tools, 12-notifications (digest line), 17-home-main, e2e rows (HOME-012+), plan record.

## Tests
- **Deno `dailyBrief.test.ts`**: ranking order + cap; each signal type maps to the right item/reason/route; good-news assembly; deterministic summary; digest-prepend helper (present/absent).
- **Deno generator shape test** (mock db): deterministic tier skips Gemini; AI failure falls back to deterministic; upsert idempotent.
- **Live**: seed signals on the test home → run generator (deterministic path for a downgraded tier + AI path as Evergreen) → card renders both densities → feedback row lands → regenerate honours feedback → digest line appears. Verify `ai_usage_log` rows carry cost.
- e2e plan rows.

## Risks
- **AI cost**: 1 call/day/home, Sage+ only, activity-filtered, flash-context-sized prompt; hard fallback to deterministic. Metered by `ai_usage_log`.
- **daily-batch regression**: helper is additive with absent-brief fallback; existing digest tests must stay green.
- **Voice drift/hallucination**: the AI only REWRITES assembled items (it cannot add items); schema-validated; items keep their deterministic `route`/data.
- Local edge runtime needs stop/start for the new function (documented Phase-1 ops note).

## Rollout
One deploy (migration locally first), live-verified both tiers before finishing. Phase 3 (photo timeline) remains separate.

## Delivered (2026-07-10)

Shipped per plan + the mid-build amendments (rename to **Daily Brief**; `garden_brief.goals` integration; the **config.toml `verify_jwt` catch** — Phase 1's `garden-brain-reconcile` cron would have 401'd on its first prod fire; both functions added). Card is `GardenBrainBriefCard.tsx` (`DailyBriefCard.tsx` was taken by the legacy dashboard hero).

**Live-verified on the local stack (real data):**
- Generator → brief for the test home: 16 overdue + the active heat alert + a window item, ranked exactly per the scoring table; summary coherent template copy; `stats {overdue:16, dueToday:0, windowsOpen:1}`.
- **AI fallback proven**: Evergreen owner, no local Gemini key → `generated_by:'deterministic'`, `aiVoiced:0` — the brief still generated (the always-exists guarantee).
- **Card**: renders summary + `daily-brief-item-{overdue,weather,window}` deep-links; **Refresh correctly hidden** on the deterministic brief; 👍 wrote the `ai_feedback` row (rating 1, right function/target).
- **Tier gate proven live**: sprout member regenerate → **403** "Regenerate is available on Sage and Evergreen"; evergreen → 200 with feedback threaded. Tier restored.

**Tests:** Deno `dailyBrief.test.ts` DB-001..011 (scoring order, cap, route+reason on every item, good-news assembly incl. `verified_mixed` exclusion, calm/busy summaries, stats, digest-prepend present/absent, window copy) — all green first run. 902 Deno / 1396 unit total at ship.
