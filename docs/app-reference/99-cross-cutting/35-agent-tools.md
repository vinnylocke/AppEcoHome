# Agent Tools — Catalogue

> The catalogue of tools the AI Agent (extended Plant Doctor chat) can invoke. Each tool maps to a typed function declaration sent to Gemini and a server-side executor that performs the action. Phase 1 covers 13 read-only tools; Phase 2-4 will add mutations.

---

## Quick Summary

The chat in [PlantDoctorChat.tsx](../../src/components/PlantDoctorChat.tsx) extends into an agentic assistant via [agent-chat](../../supabase/functions/agent-chat/) edge function. Text-only messages route through agent-chat with tool calls; image messages stay on the legacy `plant-doctor-ai` diagnosis path. Tools are typed, tier-gated, and (Phase 2+) protected by a confirm card before mutations.

---

## Role 1 — Technical Reference

### Architecture

```
PlantDoctorChat.tsx
  │ text-only → supabase.functions.invoke('agent-chat', {action, homeId, message, history})
  │ image     → supabase.functions.invoke('plant-doctor-ai', ...)
  ▼
agent-chat/
  ├─ index.ts            request handler + tool-call loop (MAX_TOOL_ROUNDS=4)
  ├─ context.ts          per-(user, home) grounding cache (5-min TTL)
  ├─ tools.ts            tool catalog (declarations + meta)
  └─ executors/
      └─ read.ts         Phase 1 — 13 read executors

Gemini API (function-calling mode)
  │ returns either text OR functionCalls[]
  ▼
Executor runs against service-role client → result fed back into next Gemini turn
```

### Tool risk levels

- **`auto`** — read tools; run without confirmation, results render as `<ToolResultCard>` in the chat.
- **`confirm`** — mutation tools (Phase 2+); produce a `<ToolConfirmCard>` the user taps Confirm on before the executor runs.
- **`strong_confirm`** — destructive / bulk (Phase 4); confirm card requires extra friction (hold-to-confirm or text confirmation).

### Phase 2 tool catalogue (10 mutation tools — confirm-gated)

Phase 2 introduces a confirm card per mutation tool. Flow:

1. Agent decides a mutation is needed → returns the tool call to the server.
2. Server calls `executor.preview()` to build a human-readable description, then INSERTs a `chat_tool_calls` row with `status='pending'` and returns the call to the client.
3. Client renders `<ToolConfirmCard>` with Confirm / Cancel.
4. User taps Confirm → `confirm_tool` action → server validates pending status + 30-min TTL, calls `executor.execute()`, updates row to `status='executed'`, stashes `affected_row_refs` for Undo, returns result.
5. Client transitions card to "done" state with a 60-second visible Undo button.
6. Undo tap → `undo_tool` action → server calls `executor.undo()` reading `affected_row_refs`, marks row `status='cancelled'` with `error_message='undone_by_user'`.

| Tool | Args | Effect | Undo |
|------|------|--------|------|
| `create_one_off_task` | `title, type, due_date, area_id?, inventory_item_ids?, description?` | Insert `tasks` row (status=Pending) | ✅ deletes the task |
| `add_journal_entry` | `subject, description, photo_url?, target?` | Insert `plant_journals` row (polymorphic target) | ✅ deletes the entry |
| `add_plant_to_shed` | `common_name, scientific_name?, area_id?, identifier?, quantity?` | Insert `plants` (source=manual) + `inventory_items` rows | ✅ deletes both |
| `assign_plant_to_area` | `inventory_item_id, area_id` | Update `inventory_items.area_id`, denormalise area_name/location_id, set status=Planted | ❌ payload-aware undo deferred to Phase 4 |
| `add_ailment` | `name, type, description?` | Insert `ailments` row | ✅ deletes |
| `link_ailment_to_instance` | `ailment_id, inventory_item_id` | Insert `plant_instance_ailments` row | ✅ deletes |
| `create_shopping_list` | `name` | Insert `shopping_lists` row | ✅ deletes |
| `add_to_shopping_list` | `list_id?, name, item_type, category?` | Resolves target list (uses most-recent active if list_id omitted), inserts item | ✅ deletes the item |
| `add_seed_packet` | `plant_name, variety?, vendor?, sow_by?` | Insert `seed_packets` row | ✅ deletes |
| `log_sowing` | `packet_id, sown_on?, quantity?, location_note?` | Insert `seed_sowings` row | ✅ deletes |

All Phase 2 tools require Botanist tier or higher (Sprout users see read tools only; the model never proposes mutations to them since they're filtered from the tool catalog).

### Phase 4 tool catalogue (9 destructive / bulk tools)

All Phase 4 tools render with `risk_level: 'strong_confirm'` — the UI swaps the single-tap Confirm for a **hold-to-confirm** button (1 second hold required), styled with an amber warning border. The done card's Undo button stays visible for **24 hours** instead of 60 seconds.

| Tool | Args | Effect | Undo |
|------|------|--------|------|
| `archive_plant` | `plant_id` | UPDATE `plants.is_archived = true` | ✅ restores previous `is_archived` |
| `restore_plant` | `plant_id` | UPDATE `plants.is_archived = false` | ✅ restores previous `is_archived` |
| `end_of_life_instance` | `inventory_item_id, was_natural?, summary?, photo_url?` | UPDATE `inventory_items` (ended_at, was_natural_end, end_summary, status=Archived) + INSERT closing `plant_journals` entry | ✅ restores fields + deletes journal entry |
| `restore_instance` | `inventory_item_id` | UPDATE `inventory_items` (clear EoL fields, status=Planted) + INSERT "Restored from Senescence" journal | ✅ restores fields + deletes journal entry |
| `delete_instance` | `inventory_item_id` | HARD DELETE `inventory_items` row | ❌ **Not reversible** — Undo throws with a helpful message pointing at `end_of_life_instance` for reversible removal |
| `archive_ailment` | `ailment_id` | UPDATE `ailments.is_archived = true` | ✅ restores previous `is_archived` |
| `archive_blueprint` | `blueprint_id` | UPDATE `task_blueprints.is_archived = true` (future tasks stop generating) | ✅ restores previous `is_archived` |
| `bulk_reschedule` | `area_id?, task_type?, blueprint_id?, due_before?, shift_days OR new_date` | UPDATE matching Pending `tasks.due_date` (per-row arithmetic for relative shifts) | ✅ per-row restoration from `previous_state.rows[]` snapshot |
| `bulk_complete_tasks` | `area_id?, task_type?, blueprint_id?, due_before?` | UPDATE matching `tasks` to status='Completed', stamps `completed_at` | ✅ restores status='Pending' + clears `completed_at` |

**Why no hard-delete for blueprints**: `tasks.blueprint_id` is `ON DELETE CASCADE`, so a hard-delete of a blueprint also nukes every task ever generated from it. The agent uses soft-archive instead — historical tasks survive, future task generation stops.

**Why no Undo for delete_instance**: hard delete is final by design (intended for accidental adds / test data). The tool's description steers the model to suggest `end_of_life_instance` for finished plants. If the user explicitly asks to delete, the strong-confirm hold-to-fire UX provides the safety net.

### Phase 3 tool catalogue (6 structural tools)

| Tool | Args | Effect | Undo |
|------|------|--------|------|
| `create_blueprint` | `title, task_type, frequency_days, start_date, end_date?, area_id?, inventory_item_ids?, description?` | Insert `task_blueprints` row. Preview projects next 3 occurrences. | ✅ deletes the blueprint |
| `update_blueprint` | `blueprint_id, title?, description?, frequency_days?, end_date?, area_id?` | Update specified fields on an existing blueprint. Preview shows diff. | ✅ restores `previous_state` snapshot |
| `pause_blueprint` | `blueprint_id, until_date` | Set `paused_until`; pass null to unpause. | ✅ restores previous `paused_until` |
| `create_location` | `name, postcode?` | Insert `locations` row scoped to the home. | ✅ deletes |
| `create_area` | `location_id, name` | Insert `areas` row inside the location (areas has no `home_id` — location ownership is verified). | ✅ deletes |
| `create_plan` | `name, description?, status?` | Insert `plans` row (default status `Draft`). | ✅ deletes |
| `add_plant_to_plan` | `plan_id, common_name, quantity?, scientific_name?` | Appends a plant to the plan's `ai_blueprint.plant_manifest` + sets `staging_state.plant_mapping[newIndex]="create"`, mirroring PlanStaging's manual "add custom plant" flow. Requires the plan to already have a `plant_manifest` (i.e. opened in the Planner). | ✅ restores prior `ai_blueprint` + `staging_state` snapshot |

**Note on `areas`**: this table has no `home_id` column — ownership flows through `location_id → locations.home_id`. The Phase 3 fix corrected this both in the `list_areas` read tool and in the `context.ts` system prompt grounding (previously empty for all users — silently returning zero areas).

### Phase 1 tool catalogue (13 read tools)

| Tool | Args | Effect |
|------|------|--------|
| `list_plants` | `area_id?, status?, search?, limit?` | Returns active inventory items in the Shed |
| `list_tasks` | `area_id?, due_from?, due_to?, status?, overdue_only?` | Returns tasks (physical only — ghosts not yet exposed) |
| `list_blueprints` | `area_id?, type?, is_archived?` | Returns active task schedules |
| `list_locations` | — | All locations in the home |
| `list_areas` | `location_id?` | Areas, optionally filtered |
| `list_ailments` | `include_archived?, type?` | Watchlist entries |
| `list_shopping_lists` | `include_completed?` | Shopping lists with items |
| `list_seed_packets` | `sown?` | Nursery seed packets |
| `list_plans` | `status?` | Planner plans |
| `search_plant_database` | `query, edible?, limit?` | Searches `plant_library` (Phase 2 will broaden to multi-provider) |
| `get_plant_details` | `plant_id` | Full care guide |
| `get_weather_now` | — | Current snapshot + alerts |
| `get_overdue_summary` | — | Combined digest of overdue tasks + ailments + alerts |
| `optimise_area_schedule` | `area_id` | Invokes `optimise-area-ai` and returns schedule-consolidation suggestions. Read-shaped (proposes only — applying stays manual in the Optimise tab). Forwards the caller's bearer token so the downstream function's auth + AI quota apply. Botanist+. |

### Tier gating

Per [tools.ts](../../supabase/functions/agent-chat/tools.ts) `getToolsForTier()`:

| Tier | Reads | Writes (Phase 2+) | Daily messages |
|------|-------|---------------------|----------------|
| Sprout | ✅ | ❌ | 5 |
| Botanist | ✅ | ✅ | 25 |
| Sage | ✅ | ✅ | 100 |
| Evergreen | ✅ | ✅ | 9999 |

Tier limits live in `agent-chat/index.ts:TIER_MESSAGE_LIMITS`. Quota is enforced via the `check_ai_message_quota` SQL function against `ai_usage_log` rows with `function_name = 'agent-chat-message'` in the last 24 hours.

### Persistence across reloads

Confirm cards survive page reloads. On chat history load, `PlantDoctorChat` fetches `chat_tool_calls` for the loaded message IDs and rebuilds:
- `pending` rows → re-rendered confirm cards (using the stored `preview` text)
- `executed` rows → done cards (summary from the stored `result` jsonb)
- `cancelled` / `failed` / `expired` rows → their resolved card states

The `preview` text is persisted on the `chat_tool_calls` row at insert time (added in migration `20260628000000`) precisely so the card can re-render without re-running the tool's preview function.

### Database objects

| Object | Purpose |
|--------|---------|
| `chat_tool_calls` | Per-tool-call audit log; lifecycle pending → confirmed → executed (or cancelled / expired). `affected_row_refs` enables Undo (Phase 2+). `preview` column stores the confirm-card text for reload hydration + the Audit page. Two RLS read policies: own-rows (chat hydration) + home-scoped (Audit page). Surfaced in the Audit page's "AI Actions" tab. |
| `check_ai_message_quota(user_id, function_name, limit)` | Returns `{used, limit, remaining, allowed}` for rolling 24h window. |
| `ai_usage_log` row with `function_name='agent-chat-message'` | One row per user-initiated chat turn (regardless of internal tool calls). Counts against quota. |

### Per-turn loop

`agent-chat/index.ts` runs up to `MAX_TOOL_ROUNDS = 4` iterations per user message:

1. Send messages + tool catalog to Gemini.
2. If response has `functionCalls`, execute each in parallel-by-tool, append both the `model` turn (with function calls) and the `user` turn (with function responses) to the message history, loop.
3. If response has `text` only, that's the final reply — break and return.
4. If 4 rounds elapse without a text reply, return a generic "I tried but couldn't" message.

### Context grounding cache

`context.ts` builds a compact "what the user has" summary for each (user, home) pair, cached 5 minutes. Includes locations, areas, top 30 active plants, top 20 active blueprints, active plans, and tier. The cache invalidates manually (Phase 2+ will call `invalidateContext()` after mutation tools).

### Performance notes

- Gemini calls in tool mode use `temperature: 0.3` (lower than chat) for deterministic tool-arg generation.
- All 13 tools are scoped via `eq('home_id', homeId)` server-side — RLS doesn't apply on the service-role client, so home scoping is enforced manually.
- The context cache hit means most messages within a conversation skip the 5-query grounding fetch.

### Failure modes

- **Quota exceeded** → 429 with explicit message + quota object. Client should show "upgrade" pill.
- **Gemini cascade exhausted** → 500. Client retries are user-initiated.
- **Tool executor throws** → caught; returns `{payload: null, summary: 'tool_name failed: msg'}`. Conversation continues, model sees the failure.
- **Tool round limit reached** → returns generic message; preserves the partial tool results so the user can still see what was fetched.

### Phase roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| 1 | ✅ Shipped | 13 read tools, auto-execute |
| 2 | ✅ Shipped | 10 safe-create tools with `<ToolConfirmCard>` + Undo |
| 3 | ✅ Shipped | 6 structural tools (blueprints, locations, areas, plans) with rich previews |
| 4 | ✅ Shipped | 9 destructive/bulk tools with hold-to-confirm + 24h Undo |

---

## Role 2 — Expert Gardener's Guide

### Why this exists

The chat used to be a *suggestion engine* — it could tell you "you might want to set up a watering schedule" but you had to go and do it. Phase 1 closes the gap on the read side: the chat can now look up your data and give you specific answers without you switching tabs. "What's overdue?" — it lists them. "Show me my Shed" — there's the list. "Find a blight-resistant tomato" — search result, ready to add (Phase 2).

### What you can ask the agent today (Phase 1)

- **State of play**: "What's overdue?", "What needs my attention?", "What's the weather looking like?"
- **Shed lookups**: "What plants do I have in the back garden?", "Show me everything I'm growing", "Where is my Sweet Million tomato?"
- **Task / schedule lookups**: "What tasks do I have this week?", "What watering schedules am I running?", "What's pending in the front bed?"
- **Plant research**: "Find me a shade-tolerant herb", "What tomato varieties are in the database?", "Tell me about Tagetes patula"
- **Project status**: "What plans am I running?", "What's in my shopping list?", "What seeds do I have ready to sow?"

### What it cannot do yet

Anything that would *change* your data — adding plants, creating tasks, scheduling, deleting, archiving. All of that lands in Phase 2-4 with confirmation cards.

### Daily limits

Per-tier daily message caps prevent runaway cost. Sprout gets 5 messages a day, Botanist 25, Sage 100, Evergreen unlimited. The chat shows a quota note when you're close. Hitting the cap surfaces a 429 with an upgrade prompt — your existing message history is unaffected.

### Common pitfalls

- **AI mentions a plant you don't have** — it might be referencing the global database (`search_plant_database`) rather than your Shed. Ask "do I have this in my Shed?" to clarify.
- **AI gives stale data** — context cache lasts 5 minutes. If you just added a plant in another tab and ask about it, give it a minute or reload the chat.

### Recommended workflows

- **Morning glance**: "What needs doing today?" — the agent will run `get_overdue_summary` + `list_tasks` and give you a digest.
- **Planning research**: "Find me 3 hardy perennials that flower in August" — search runs, results render as a card you can act on (once Phase 2 ships).
- **Inventory questions**: "How many tomatoes am I growing?" — runs `list_plants` with the search arg.

---

## Related reference files

- [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md) — the chat surface that hosts the agent
- [AI — Gemini](./13-ai-gemini.md) — function-calling section
- [Edge Functions Catalogue](./10-edge-functions-catalogue.md) — `agent-chat` entry
- [Tier Gating](./17-tier-gating.md) — per-tier limits
- [Data Model — Plants](./03-data-model-plants.md), [Tasks](./04-data-model-tasks.md), [Plans](./05-data-model-plans.md) — tables the read tools query

## Code references for ongoing maintenance

- [supabase/functions/agent-chat/index.ts](../../supabase/functions/agent-chat/index.ts) — entry point + tool-call loop
- [supabase/functions/agent-chat/tools.ts](../../supabase/functions/agent-chat/tools.ts) — declarations + meta
- [supabase/functions/agent-chat/executors/read.ts](../../supabase/functions/agent-chat/executors/read.ts) — Phase 1 executors
- [supabase/functions/agent-chat/context.ts](../../supabase/functions/agent-chat/context.ts) — grounding cache
- [supabase/functions/_shared/gemini.ts](../../supabase/functions/_shared/gemini.ts) — `callGeminiWithTools`
- [src/components/PlantDoctorChat.tsx](../../src/components/PlantDoctorChat.tsx) — chat UI + routing
- [src/components/chat/ToolResultCard.tsx](../../src/components/chat/ToolResultCard.tsx) — read-result renderer
- [supabase/migrations/20260627030000_agent_chat_foundations.sql](../../supabase/migrations/20260627030000_agent_chat_foundations.sql) — table + quota function
