# Head Gardener — AI Garden Manager

## Goal

Transform Rhozly's AI from a set of independent, reactive **suggestion** surfaces (pattern hits, frost warnings, the `/insights` feed) into a single, coherent, first-person **garden manager** that oversees the whole home. The manager should:

- **Know what you want** (a structured, editable *Garden Brief* of goals + constraints), not infer it every call.
- **Hold the whole picture** — a standing *Estate Report* organised by your goals, not by alert type.
- **Reason from goal → gap → fix** (goal-gap analysis) so output feels like management, not tips.
- **Plan ahead** — a rolling 12-month *Year Plan* keyed to your climate, hemisphere, and goals.
- **Remember and follow up** — a *Manager Log* that tracks advice it gave and reconciles outcomes ("Three weeks ago I flagged your tomatoes needed feeding — I can see you did it").
- **Be askable** — a grounded *Ask your Head Gardener* chat that can take actions (draft a plan, add a task, update the brief).

It should speak in one named voice, adapt tone for amateur vs. expert gardeners (reusing the existing persona system), and live as the flagship AI tab.

This is a large feature; it is **phased** below so it can be built and shipped incrementally, but the plan covers the full vision.

---

## App-reference files consulted (mental model)

Read end-to-end (via codebase exploration) before writing this plan:

- `docs/app-reference/02-dashboard/06-assistant-card.md` — current AI insight surface on dashboard/planner/shed.
- `docs/app-reference/99-cross-cutting/26-pattern-engine.md` — pattern-scan / pattern-evaluate pipeline + `user_insights`.
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` — Gemini cascade, JSON mode, caching, cost logging.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — existing AI function registry (`insights-feed`, `generate-grow-suggestions`, `plant-doctor-ai`, etc.).
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — cron registration + per-home failure isolation + `cron_run_logs`.
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — `FEATURE_GATES` lattice + `FeatureGate` + server re-verification.
- `docs/app-reference/99-cross-cutting/21-routing.md` — React Router v6 route + nav registration in `src/App.tsx`.
- `docs/app-reference/99-cross-cutting/30-onboarding-state.md` — quiz/onboarding state; where stated goals originate.
- `docs/app-reference/99-cross-cutting/01-data-model-home.md`, `03-data-model-plants.md`, `04-data-model-tasks.md`, `05-data-model-plans.md`, `06-data-model-ailments.md` — the data the report synthesises.

**Note:** The `/insights` page (`AiInsightsPage`) has **no** standalone app-reference file yet (the original `ai-insights-overhaul.md` plan left it as a TODO). This plan will create the Head Gardener surface reference AND backfill an `/insights` reference, since Head Gardener embeds it.

---

## What already exists (reuse, don't rebuild)

- `buildUserContext(db, { userId, homeId, skip })` + `renderContextBlock(ctx, sections)` — aggregates identity, location, climate, areas, inventory, tasks, preferences, behaviour, weather. `_shared/userContext.ts`.
- `insights-feed/index.ts` — aggregates 8 insight sources (`user_insights`, `automation_suggestions`, `area_ai_insights`, `weekly_overviews`, stalled plans, frost, `home_pest_insights`, `home_grow_suggestions`) + persona-aware Gemini summary cached in `ai_insight_summaries`.
- `loadPreferences` / `savePreferences` / `formatPreferencesBlock` / `extractPreferencesFromFeedback` — `_shared/preferences.ts`. Entity vocab: `plant, aesthetic, feature, maintenance, difficulty, wildlife, colour, pest_management, soil, climate, water_usage`.
- `callGeminiCascade` / `callGeminiWithTools` (tool calling) / JSON-schema mode — `_shared/gemini.ts`.
- `getCached` / `setCached` / `cacheKey` (TTL + bust) — `_shared/aiCache.ts`, backed by `ai_response_cache`.
- `logAiUsage(...)` — `_shared/aiUsage.ts` → `ai_usage_log` (cost, prompt, context, result; payloads pruned after 30 days).
- `tierAllowsInsights(tier)` / `AI_INSIGHT_TIERS = ["evergreen"]` — `_shared/insightTiers.ts`.
- Persona threading — `personaInstruction(persona)` (new vs. experienced gardener wording).
- Quiz → preferences write path — `HabitQuiz.tsx` (goals, time, experience, wildlife, watering, style) and `PlantSwipeDeck.tsx`, both writing `planner_preferences` with a `source` value.
- Seasonality (`src/lib/seasonal.ts`, hemisphere-aware), frost dates (`frostDatesForHome`), weather snapshots.
- Tab/route registration pattern in `src/App.tsx` (lazy import + `TAB_URL` + `navLinks` + `<Route>`), `FeatureGate` in `src/components/shared/FeatureGate.tsx`, `FEATURE_GATES`/`FEATURE_LABELS` in `src/constants/tierFeatures.ts`.

---

## New data model (3 tables + 1 column)

All tables follow the canonical post-2026-10-30 boilerplate (CREATE TABLE → ENABLE RLS → policies → indexes → `GRANT ... TO authenticated`), mirroring `20260812000000_ai_observability.sql` and `20260817000000_content_feedback.sql`.

### 1. `garden_brief` — the manager's job spec (one row per home)

```
home_id          uuid PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE
goals            text[]    -- enum-ish: grow_your_own | year_round_colour | attract_wildlife |
                           --           low_maintenance | container_only | family_safe | calm_retreat | privacy_screening
time_per_week    text      -- 'under_1h' | '1_3h' | '3_7h' | '7h_plus'
budget_tier      text      -- 'budget' | 'moderate' | 'premium' (nullable)
experience_level text      -- 'beginner' | 'improving' | 'confident' | 'expert'
styles           text[]    -- cottage | modern_minimal | tropical | mediterranean | wild_natural | kitchen_veg
notes            text      -- free-text "anything else you want me to know"
ai_summary       text      -- the manager's one-paragraph understanding of the garden (persona-aware)
derived_from     jsonb     -- provenance: which prefs/quiz answers seeded it (for transparency + re-derive)
confirmed_at     timestamptz  -- null until user confirms; drives "review your brief" nudge
updated_at       timestamptz NOT NULL DEFAULT now()
created_at       timestamptz NOT NULL DEFAULT now()
```

- RLS: SELECT/INSERT/UPDATE for home members (`home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())`).
- Home-scoped (the brief describes the *garden*); per-user taste still layers in via `planner_preferences`.
- Seeded from quiz answers + `planner_preferences` by `synthesize-garden-brief`, then **user-confirmed/edited** — never silently assumed.

### 2. `garden_manager_reports` — the standing Estate Report (latest per home)

```
home_id       uuid PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE
report        jsonb NOT NULL   -- structured sections (see Report shape below)
persona       text
based_on      text             -- content hash of source inputs (brief + inventory + tasks + insights + season)
generated_at  timestamptz NOT NULL DEFAULT now()
```

- RLS: SELECT for home members; writes service-role only (edge function), like `ai_insight_summaries`.
- Latest-only (PK `home_id`); regenerated weekly by cron + on-demand with cache bust.

### 3. `garden_manager_log` — continuity / follow-up (append-only)

```
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
home_id       uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE
user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL
created_at    timestamptz NOT NULL DEFAULT now()
kind          text NOT NULL    -- 'recommendation' | 'gap' | 'seasonal_action' | 'follow_up'
title         text NOT NULL
body          text
goal          text             -- which brief goal this advances (nullable)
target_kind   text             -- 'plant' | 'area' | 'plan' | 'task' | 'blueprint' (nullable)
target_id     text
status        text NOT NULL DEFAULT 'open'  -- 'open' | 'acted' | 'dismissed' | 'expired'
resolved_at   timestamptz
outcome_note  text             -- how it was reconciled ("user completed feeding task on 2026-06-18")
```

- RLS: SELECT for home members; INSERT/UPDATE service-role (cron + report fn) + user UPDATE for dismiss.
- Reconciliation is **deterministic** (driven by `user_events` / `tasks` / `inventory_items` changes), not AI guesswork — this is what makes "memory" trustworthy.

### 4. Column add (verify-first)

- Confirm whether `planner_preferences.source` already exists (quiz/swipe writes imply it does). If a migration is genuinely missing it, add `source text` in the same migration set. Otherwise no-op. **No new column is invented if the existing one already covers it.**

---

## New edge functions (3)

### A. `synthesize-garden-brief`
- Input: `homeId`. Auth + Evergreen gate.
- Reads quiz answers (`planner_preferences` where `source='quiz'`), all preferences, inventory composition, climate.
- Gemini (JSON-schema mode) → drafts `{ goals, time_per_week, experience_level, styles, ai_summary, derived_from }`.
- Returns a **draft** for the user to confirm/edit; does **not** auto-write `confirmed_at`. Logged via `logAiUsage` (action `synthesize_brief`).
- Brief save/edit is plain `supabase-js` upsert from the client (RLS-gated) — no edge function needed for CRUD.

### B. `garden-manager-report` (the flagship)
- Input: `homeId`, optional `bust=true`.
- Auth + Evergreen gate. Cache check via `based_on` hash; return cached `garden_manager_reports.report` if fresh.
- Builds: `buildUserContext` (all sections) + `garden_brief` + aggregated insight sources (extract `insights-feed`'s aggregation into a shared `_shared/insightSources.ts` so both functions share one implementation) + open `garden_manager_log` entries.
- Runs three reasoning passes (single multi-section Gemini call with JSON schema, temperature ~0.35, persona-aware):
  1. **Estate sections** — narrative per active goal (edible garden, year-round colour, wildlife, maintenance load, problem areas), each with a manager recommendation + optional action link.
  2. **Goal-gap analysis** — for each goal, compute concrete gaps grounded in inventory/areas/seasonality (e.g. "nothing flowers Nov–Feb; north bed suits hellebores"). Deterministic pre-computation in `_shared/gapAnalysis.ts` feeds the prompt facts so the model reasons over real data, not hallucinations.
  3. **Year Plan** — 12-month rolling actions from `src/lib`/`_shared` seasonal helpers (sow/plant/prune/protect), filtered to the user's plants + goals + hemisphere.
- Writes structured `report` JSON + new `garden_manager_log` rows for fresh recommendations/gaps (deduped against open log entries). Logs via `logAiUsage` (action `manager_report`).
- Persona-aware via `personaInstruction(persona)`.

**Report JSON shape (cached):**
```
{
  headline: string,                      // one-line "state of your garden"
  greeting: string,                      // persona-aware, references continuity log
  sections: [{ goal, title, body, severity, recommendation, link }],
  gaps:     [{ goal, title, detail, suggestion, link }],
  yearPlan: { thisMonth: [...], thisSeason: [...], comingUp: [...] },
  followUps:[{ logId, title, status, note }],
  generatedAt: string,
  persona: string
}
```

### C. `head-gardener-chat`
- Conversational manager grounded in brief + latest report + full context. Reuses `callGeminiWithTools`.
- **Phase 5** — tools added incrementally: `draft_plan` (seed a `plans` draft), `add_blueprint` (recurring task), `update_brief` (write `garden_brief`), `note_outcome` (resolve a `garden_manager_log` entry). Tools can be enabled one at a time; the chat ships first as read/advise-only, then gains actions.
- Logs via `logAiUsage` (action `manager_chat`).

### Cron
- New migration `…_manager_report_cron.sql`: `cron.schedule('garden-manager-report-weekly', '0 5 * * 1', net.http_post(... /garden-manager-report ...))` — Monday 05:00 UTC, iterating Evergreen homes, per-home failure isolation + `cron_run_logs` (mirrors `generate-grow-suggestions` cron).
- The same cron pass runs **log reconciliation** first (deterministic: mark `garden_manager_log` entries `acted`/`expired` from `user_events`/`tasks`/inventory deltas) so the regenerated report can speak to outcomes.

---

## New UI

Flagship tab **Head Gardener** at `/manager` (leaf/sparkle icon, label "Head Gardener"). The existing `/insights` feed is **embedded as one tab** inside it (kept working + cross-linked; not deleted).

Registration in `src/App.tsx`: lazy import + `TAB_URL.manager = "/manager"` + `navLinks` entry + `<Route path="/manager">`. New feature flag `head_gardener` in `tierFeatures.ts` gated `EVERGREEN`, mirrored server-side by reusing `tierAllowsInsights`.

New components (`src/components/manager/`):
- `HeadGardenerPage.tsx` — hub, `FeatureGate feature="head_gardener"`, sub-tabs: **Overview · Brief · Year Plan · Insights · Ask**. `data-testid="head-gardener-page"`.
- `GardenBriefCard.tsx` + `GardenBriefEditor.tsx` — view/confirm/edit brief; "Re-derive from my answers" calls `synthesize-garden-brief`.
- `ManagerReport.tsx` — renders `sections` + `gaps` with action buttons (Take me there / Add to plan / Create tasks).
- `ManagerYearPlan.tsx` — this-month / this-season / coming-up.
- `ManagerLog.tsx` — continuity timeline with dismiss + "mark done".
- `HeadGardenerChat.tsx` — chat surface (reuses existing chat UI patterns from `plant-doctor-ai`).
- Dashboard tie-in: upgrade `AssistantCard` (or add a sibling "Your Head Gardener" entry card) to surface the report headline + deep-link to `/manager`.

All interactive elements get `data-testid` attributes.

New client lib helpers (pure, unit-tested): `src/lib/gardenBrief.ts` (derive/normalise brief, goal labels), `src/lib/managerReport.ts` (section ordering, severity sort) — kept side-effect-free for Vitest.

---

## Phasing

| Phase | Deliverable |
|------|-------------|
| 0 | Migrations (3 tables + `source` verify), tier flag `head_gardener`, `/manager` route + empty hub scaffold, seeds |
| 1 | Garden Brief: `synthesize-garden-brief` fn, editor/confirm UI, brief storage |
| 2 | Estate Report + Goal-gap: `garden-manager-report` fn, `_shared/insightSources.ts` + `_shared/gapAnalysis.ts`, `ManagerReport.tsx`, on-demand generate + cache |
| 3 | Year Plan section + `ManagerYearPlan.tsx` (seasonal helpers) |
| 4 | Continuity: `garden_manager_log` writes + weekly cron + deterministic reconciliation + `ManagerLog.tsx` follow-ups in report |
| 5 | Ask your Head Gardener chat (read-only first, then tools: draft_plan → add_blueprint → update_brief → note_outcome) |
| 6 | Dashboard entry point / `AssistantCard` tie-in + polish |

Each phase is independently shippable and individually testable.

---

## Tests (mandatory, per phase)

- **Vitest** (`tests/unit/lib/`): `gardenBrief.ts` (derivation/labels/normalisation), `managerReport.ts` (section/severity ordering).
- **Deno** (`supabase/tests/`): `gapAnalysis` (goal → gap given inventory/season fixtures), `insightSources` aggregation, year-plan builder (hemisphere-aware), report-hash stability.
- **Playwright** (`tests/e2e/specs/` + page object `tests/e2e/pages/`): `/manager` loads gated, brief confirm/edit flow, report renders sections, year plan tab, log dismiss, chat send. New `HeadGardenerPage` page object.
- **Seeds** (`supabase/seeds/`): new file `13_head_gardener.sql` — a confirmed `garden_brief`, a `garden_manager_reports` row, 2–3 `garden_manager_log` entries (open + acted) for worker accounts. UUID prefixes: brief is keyed by existing home; reports by home; log `…-0013-…`. Update `docs/e2e-test-plan/01-seeded-fixtures.md`.

Never leave tests red; update existing tests when behaviour changes.

---

## Docs to update (mandatory, same task)

**App-reference (create):**
- New surface ref file(s) for **Head Gardener** using `_template.md` verbatim (Role 1 technical + Role 2 gardener). Add `- [x]` rows to `00-INDEX.md`.
- Backfill a reference for the embedded `/insights` page (currently undocumented).

**App-reference (update):**
- `99-cross-cutting/10-edge-functions-catalogue.md` — add `synthesize-garden-brief`, `garden-manager-report`, `head-gardener-chat`.
- `99-cross-cutting/11-cron-jobs.md` — add the weekly manager-report + reconciliation cron.
- `99-cross-cutting/13-ai-gemini.md` — note the new high-context report call + caching/cost posture.
- `99-cross-cutting/17-tier-gating.md` — add `head_gardener` feature gate (Evergreen).
- `99-cross-cutting/19-rls-patterns.md` — add the 3 new tables' RLS.
- New cross-cutting **data-model** note (or extend `01-data-model-home.md` / add a short `…-data-model-manager.md`) for `garden_brief` / `garden_manager_reports` / `garden_manager_log`.
- `99-cross-cutting/30-onboarding-state.md` — brief is seeded from quiz answers.
- `99-cross-cutting/26-pattern-engine.md` — cross-link: report consumes pattern `user_insights`.
- `02-dashboard/06-assistant-card.md` — dashboard tie-in to `/manager`.

**Test plan:** new `docs/e2e-test-plan/NN-head-gardener.md` + index row in `docs/e2e-test-plan.md`; `TESTING.md` inventory + counts.

---

## Risks, edge cases, decisions

- **Token cost.** The report is the highest-context AI call in the app. Mitigations: Evergreen-only gate (client + server), `based_on` hash cache, weekly cron refresh + manual bust, Flash cascade (not Pro), deterministic pre-computation (`gapAnalysis`, year-plan) so the model summarises facts rather than computing them. All calls logged to `ai_usage_log`.
- **Trustworthy "memory."** Continuity reconciliation is deterministic from events/tasks/inventory — the AI never claims you did something it can't verify.
- **Don't assume goals.** The brief is always user-confirmed; `confirmed_at` gates a "review your brief" nudge. AI-derived ≠ accepted.
- **Home vs. user scope.** Brief + report + log are home-scoped (shared garden); personal taste still flows via `planner_preferences`. Members all see the manager.
- **Drift to verify:** `planner_preferences.source` column existence (see Data model §4). Resolve in-task; note in commit.
- **Avoid duplication.** Extract `insights-feed` aggregation into `_shared/insightSources.ts` and have both `insights-feed` and `garden-manager-report` consume it — no parallel copies.
- **No new pattern detectors** are required; the manager *consumes* existing `user_insights`/grow/pest/automation outputs and adds synthesis + brief + year plan + continuity on top.

**Alternatives considered:** (1) Folding everything into the existing `/insights` page — rejected; the manager is a distinct, goal-organised surface and the user explicitly wants a "main AI tab." (2) Per-user brief — rejected in favour of home-scoped to match areas/plans/tasks scoping. (3) Storing the report in `ai_response_cache` — rejected; a first-class `garden_manager_reports` table gives RLS + history hooks + a stable read path for the UI.
