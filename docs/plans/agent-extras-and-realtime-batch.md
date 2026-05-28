# Plan — Five-item batch: agent extras, persistence, audit, realtime, library AI add

Covers five independent pieces of work the user requested together. Each is independently shippable; I'd deploy them as separate waves so a problem in one doesn't block the others.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/35-agent-tools.md` (agent tool catalogue)
- `docs/app-reference/99-cross-cutting/15-realtime.md` (realtime channels)
- `docs/app-reference/07-management/08-audit-log.md` (Audit page)
- `docs/app-reference/07-management/10-plant-library-admin.md` (Plant Library admin)
- `docs/app-reference/04-planner/02-plan-staging.md` (plan staging state)
- `docs/scalability-audit.md` (Wave D source)

---

## Item A — Two deferred Phase 3 agent tools

### A1. `optimise_area_schedule` (low risk — ship first)
- **Current state**: `optimise-area-ai` edge function (427 lines) exists. It analyses an area's blueprints and returns consolidation proposals. It does NOT auto-apply — the user applies proposals from the Optimise tab.
- **Approach**: New agent tool, `risk: "auto"` (it's read-only — it only *proposes*). The executor invokes `optimise-area-ai` for the given `area_id`, returns the proposal summaries as a `<ToolResultCard>`. The agent tells the user "I found 3 ways to streamline — open the Optimise tab to apply, or ask me to apply a specific one" (applying stays manual in this phase).
- **Files**: `tools.ts` (declaration), `executors/read.ts` (executor — it's read-shaped), `35-agent-tools.md`.
- **Risk**: low. No mutation.

### A2. `add_plant_to_plan` (higher risk — needs careful scoping)
- **Current state**: a plan's plants live in `plans.staging_state.plant_mapping` (jsonb), NOT a join table. Tasks/blueprints link via `plan_id`. The staging_state shape is owned by `PlanStaging.tsx` and has `has_started`, `plant_mapping`, and phase structure. Writing into it blind is risky — a malformed mapping could break the staging UI.
- **Recommended approach (safe)**: rather than manipulate `staging_state` directly, the tool creates an **inventory_items row tagged to the plan via a planning task**, OR appends to a clearly-documented sub-key. Given the risk, I recommend **scoping A2 to: "create a Planting task linked to the plan"** (uses `tasks.plan_id`, which is well-understood) rather than mutating `staging_state`. Full staging-state plant insertion would need a dedicated design pass with the PlanStaging owner's data contract.
- **Decision needed from you**: (i) ship the safe "planting-task-linked-to-plan" version now, or (ii) defer A2 until we design proper staging_state insertion. I recommend (i).
- **Files**: `tools.ts`, `executors/structural.ts`, `35-agent-tools.md`.

---

## Item B — Persist confirm cards across reloads

- **Current state**: `chat_tool_calls` already has a `message_id` FK to `chat_messages`. But `PlantDoctorChat.loadHistory()` only loads `chat_messages` columns — it never fetches the tool calls, so on reload the confirm/done cards vanish (pending calls are orphaned, executed ones lose their done-card).
- **Approach**:
  1. In `loadHistory()`, after loading messages, fetch `chat_tool_calls` for the loaded message IDs (`.in("message_id", ids)`).
  2. Map them back onto each message: rows with `status='pending'` → `pending_tool_calls` (rebuild `PendingCall` shape — need to store the `preview` text; see note below); rows with `status IN (executed, cancelled, failed)` → seed `callStates` so the card renders in its resolved state.
  3. **Schema gap**: the confirm card needs the `preview` text to render, but `chat_tool_calls` doesn't persist it today (it's only returned in the live response). **Add a `preview text` column** to `chat_tool_calls` in a small migration, and populate it on insert in `agent-chat`.
  4. For executed rows, rebuild `callStates[id] = { kind: 'done', summary: result.summary }` from the stored `result` jsonb.
- **Files**: migration (add `preview` column), `agent-chat/index.ts` (persist preview on insert), `PlantDoctorChat.tsx` (hydrate on load), `35-agent-tools.md`.
- **Risk**: low. Additive column + read-path change.

---

## Item C — Audit page: AI Actions tab

- **Current state**: `AuditPage.tsx` has two tabs (`activity`, `ai_usage`). Admin-only, date-range + user filters.
- **Approach**: Add a third tab `ai_actions`. Query `chat_tool_calls` joined to `chat_messages` (for the triggering message) within the date range, scoped to the home. Columns: timestamp, user, tool_name, risk_level, status (colour-coded), summary/preview, and an expandable args view. Reuse the existing table styling + date filters.
- **Files**: `AuditPage.tsx`, `07-management/08-audit-log.md`, E2E page object + spec.
- **Risk**: low. Read-only admin surface. Depends on Item B's `preview` column for nicer display (or shows tool_name + status without it).

---

## Item D — Wave D: narrow the realtime subscription

- **Current state**: `HomeRealtimeContext` subscribes to **13 tables** with `event: "*"`. Every INSERT/UPDATE/DELETE on any of them broadcasts to every connected client. Memory + CPU cost on the realtime server scales with concurrent users × tables × write rate.
- **Approach**:
  1. **Drop low-value subscriptions** that the app already refetches on tab focus: `weather_snapshots`, `weather_alerts`. These change on a cron, not from user action — realtime is overkill. Replace with a focus/interval refetch where consumed.
  2. **Keep the high-value, collab-sensitive ones**: `tasks`, `inventory_items`, `shopping_lists`, `shopping_list_items` (multi-member live updates matter here), plus `homes`, `locations`, `areas`, `plants`, `ailments`, `plans`, `task_blueprints`.
  3. **Narrow events**: change `event: "*"` to specific events where DELETE detection isn't needed (most read-models only care about INSERT + UPDATE).
  4. Verify the focus-refetch fallback exists for the dropped tables (weather card already refetches on mount, so likely safe).
- **Files**: `HomeRealtimeContext.tsx`, any component relying on weather realtime, `15-realtime.md`, `docs/scalability-audit.md` (mark Wave D done).
- **Risk**: medium. Dropping a subscription means a surface that relied on it for live updates now updates on focus instead. Need to verify weather surfaces don't depend on realtime push. Will test by checking weather card mount behaviour.

---

## Item E — Plant Library admin: AI single search + add

- **Current state**: `PlantLibrarySearchTab` has a modular `SEARCH_METHODS` registry (alphabetical / relevance / advanced / fuzzy), each a self-contained file. All search the *existing* `plant_library` rows. `search-plants-ai` edge function exists (returns AI plant name + description matches). `seed-plant-library` enriches names via `buildEnrichmentPrompt` (in `_shared/plantSeedPrompt.ts`) + Gemini and inserts rows.
- **Approach**:
  1. **New search method `ai`** in the registry. When run, it calls `search-plants-ai` with the query → gets AI-suggested plant matches. For each match, cross-check `plant_library` by name / scientific_name to determine "already in library" vs "not yet".
  2. **Result rendering**: rows already in the library render like normal library hits; rows NOT in the library render with an **"Add to Library"** button.
  3. **New edge function `add-plant-to-library`** (admin-gated): takes a single plant name, runs `buildEnrichmentPrompt([name])` + Gemini (reusing the exact seed path so the row shape matches), inserts ONE `plant_library` row (dedup via `scientific_name_key` unique index), logs to `plant_library_runs` as a 1-row seed run, returns the new row.
  4. Clicking "Add" calls the function, then refreshes that result row to show it's now in the library (with a care-guide preview link).
- **Files**: new `src/services/plantLibrarySearch/ai.tsx` (method), `PlantLibrarySearchTab.tsx` (Add button wiring), new `supabase/functions/add-plant-to-library/index.ts`, `_shared/plantSeedPrompt.ts` (reuse), `10-edge-functions-catalogue.md`, `10-plant-library-admin.md`.
- **Risk**: medium. New edge function + AI enrichment. Reuses proven seed logic so row shape is consistent. Admin-only so blast radius is small.

---

## Suggested wave order (each its own deploy)

1. **Wave 1 — Item B (persistence)** + small migration. Foundational; makes the agent feel solid. Also unblocks Item C's nicer display.
2. **Wave 2 — Item C (audit AI actions tab)**. Read-only, low risk, builds on B.
3. **Wave 3 — Item A (both agent tools)**. A1 safe; A2 pending your decision on scope.
4. **Wave 4 — Item E (library AI add)**. Self-contained admin feature.
5. **Wave 5 — Item D (realtime narrowing)**. Most caution needed; ship last + watch realtime metrics.

## Migrations needed
- Item B: `ALTER TABLE chat_tool_calls ADD COLUMN preview text;`
- (No other schema changes — C/D/E reuse existing tables.)

## App-reference docs to update
- `35-agent-tools.md` — Items A, B
- `08-audit-log.md` — Item C
- `15-realtime.md` — Item D
- `10-plant-library-admin.md` + `10-edge-functions-catalogue.md` — Item E
- `scalability-audit.md` — mark Wave D done

## Open decisions for you
1. **A2 scope**: ship the safe "planting-task-linked-to-plan" version, or defer full staging_state insertion? (I recommend ship-safe.)
2. **Wave order**: happy with B → C → A → E → D, or reprioritise?
