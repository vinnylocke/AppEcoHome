# Garden AI: automation tools + tool audit

## Goals

1. Give the agent-chat (Garden AI) the ability to **create, amend, delete (and run)** automations.
2. **Audit** the existing tool set — confirm they all work and surface gaps.

## App-reference consulted

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — agent-chat tool loop, confirm cards.
- `docs/app-reference/07-management/06-integrations-automations.md` — automations data model
  (`trigger_logic` tree + `automation_actions`), the unified builder, `run-automations`.
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`, `13-ai-gemini.md`,
  `09-data-model-integrations.md`.

## Audit findings

**Architecture** (`supabase/functions/agent-chat/`): tools declared in `tools.ts` (read / mutation /
structural / destructive), executed via `executors/*.ts`. Read tools auto-run; mutation/structural/
destructive go preview → `chat_tool_calls` (pending) → user confirm → execute, with optional `undo`.
Tier-gated via `minTier`.

**Coverage — every declared tool has an executor (no orphans):**

| Group | Tools | Executors | Status |
|-------|------:|----------:|--------|
| Read (auto) | 15 | 15 | ✅ wired |
| Mutation (confirm) | 10 | 10 | ✅ wired |
| Structural (confirm) | 7 | 7 | ✅ wired |
| Destructive (strong_confirm) | 9 | 9 | ✅ wired |

So nothing is declared-but-broken at the wiring level, and unknown-tool / no-executor / executor-throw
all return a graceful error in the loop. (A line-by-line correctness pass on each executor body — column
names, RLS via service client + membership check — is part of the work below; I'll flag anything off.)

**Gaps (missing tools):**

| Area | Missing | Priority |
|------|---------|----------|
| **Automations** | list / create / update / delete / run / enable-disable | **High (this task)** |
| **Devices** | `list_devices` (valves + sensors) — needed to wire automations, useful generally | **High (enabler)** |
| Tasks | single complete / skip / snooze (bulk variants exist) | Low |
| Shopping | remove item, tick item bought, complete list | Low |
| Ailments | resolve / unlink from instance | Low |
| Plans | update / archive plan, remove plant | Low |
| Areas/locations | rename / delete | Low |

Per decision, this plan **fills all gaps** — High and Low (see "Gap-filling tools" below).

## New tools

### Read (auto)
- **`list_devices`** — list the home's devices (valves, soil sensors) with id, name, type, area,
  online/last-reading. Lets the AI resolve the valve/sensor IDs an automation needs.
- **`list_automations`** — list automations with a plain-English trigger summary (reuse the tree
  summariser), actions, active state, run-limit, and `rate_limited_until` / last run.

### Create / amend / run (confirm)
- **`create_automation`** — full **multi-trigger, multi-action** (decision: complex builds are the
  high-value case). Params:
  - `trigger`: a condition **tree** — `{ op: "and" | "or", conditions: [ <leaf | group> ] }`, where a
    leaf is one of: `sensor` (`metric` soil_moisture|soil_temp_c|soil_ec, `comparator`, `value`, +
    `sensor_device_ids` or `area_id`, `agg` any|all|average), `time` (`time`, `days[]`), `date_range`
    (`from`/`to` MM-DD), `weather` (`rain_forecast`/heat, `negate`, thresholds), `task_due`
    (`blueprint_ids[]`) — and a group is itself `{ op, conditions[] }` (nesting allowed).
  - `actions`: an **ordered list** — `valve_open` (`device_id` + `duration_seconds`), `valve_close`,
    `notification` (optional `title`/`body`), `complete_task` (`blueprint_id`).
  - `run_limit_count` / `run_limit_window_hours` / `cooldown_minutes` / `area_id` / `name`.

  Gemini's schema doesn't do true recursion, so `trigger` is declared as a documented nested object
  (2 explicit group levels in the schema + the description spelling out the shape, which covers
  realistic depth); the executor runs it through a **strict pure validator/normaliser**
  (`automationTriggerBuild`) that rejects malformed trees and produces the canonical `trigger_logic`
  jsonb the engine expects. The confirm card previews the plain-English `summariseTree` so the user
  verifies the whole logic before it saves.
- **`update_automation`** — amend `name` / `is_active` / `run_limit_*` / `cooldown_minutes`, AND
  optionally **replace** the whole `trigger` tree and/or the `actions` list (same shapes as create).
  Partial: only provided fields change; provided `trigger`/`actions` fully replace.
- **`run_automation`** — manually fire one now (reuses the just-fixed `run-automations` manual path
  via `fanoutActions`), bypassing conditions.

### Delete (strong_confirm)
- **`delete_automation`** — delete the automation (cascades `automation_actions` / runs). Reversible-
  by-recreate only, so strong-confirm. `undo` not provided (recreate is non-trivial).

### Gap-filling tools (all remaining gaps)
- **Tasks:** `complete_task`, `skip_task`, `snooze_task` (single-task, confirm; undo where possible) —
  the single-item complements to the existing bulk variants.
- **Shopping:** `remove_shopping_item`, `toggle_shopping_item_bought`, `complete_shopping_list`.
- **Ailments:** `resolve_ailment` (clear active on an instance), `unlink_ailment_from_instance`.
- **Plans:** `update_plan` (name/description/status), `archive_plan`, `remove_plant_from_plan`.
- **Areas / locations:** `rename_area`, `rename_location`, `delete_area`, `delete_location`
  (delete = strong_confirm; block/guard when non-empty).

Risk levels follow the existing convention (edits = confirm, deletes = strong_confirm); all
`botanist+`. Each gets preview + execute (+ undo where cheap).

**Reliability for complex trees:** the pure validator is the safety net — any tree the AI emits is
validated (valid leaf kinds, comparators, referenced device/blueprint/area IDs belong to the home)
before save, with a clear error back to the model if malformed, and the human-readable preview in the
confirm card is the final check. So "complex" stays safe.

## Files that will change

| File | Change |
|------|--------|
| `supabase/functions/agent-chat/tools.ts` | New `AUTOMATION_TOOLS` group (the tools above) with risk levels (`list_*` auto, create/update/run confirm, delete strong_confirm), `minTier: "botanist"`; add to `ALL_TOOLS`. |
| `supabase/functions/agent-chat/executors/read.ts` | `list_devices`, `list_automations` executors + registry entries. |
| `supabase/functions/agent-chat/executors/automations.ts` | **New** — `create_automation` / `update_automation` / `run_automation` / `delete_automation` (preview + execute + undo where sensible). Shares the tree-build + action-build helpers. |
| `supabase/functions/_shared/automationTriggerBuild.ts` | **New, pure** — build a `trigger_logic` tree + `automation_actions` rows from structured params (Deno-testable). |
| `supabase/functions/agent-chat/index.ts` | Register the new automations executor registry in `ALL_MUTATION_EXECUTORS`. |
| `supabase/tests/automationTriggerBuild.test.ts` | **New** — unit-test the pure tree/action builder. |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Add the automation + device tools to the tool catalogue. |
| `docs/app-reference/07-management/06-integrations-automations.md` | Note the agent can now CRUD automations. |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Update agent-chat tool count. |

## Risks / edge cases

- **Tree validity** — the builder is pure + Deno-tested, and `evaluate-automations` already tolerates
  partial trees; create previews the plain-English summary in the confirm card so the user verifies
  before it saves.
- **ID resolution** — the AI must call `list_devices` / `list_areas` / `list_blueprints` first; tool
  descriptions enforce this, and the executor validates that referenced devices/blueprints belong to
  the home (membership already checked in the loop).
- **run_automation immediacy** — reuses the fixed manual path (fan-out + queue drain).
- **Correctness audit** — while here I'll read each existing executor body for column/RLS issues
  (we found a `uid` mis-key earlier) and fix any in the same task, noting them in this doc.

## Tests / docs

- Deno unit tests for `automationTriggerBuild`.
- App-reference updates (tool catalogue + automations + edge-fn catalogue).
- No migration (schema exists). Ships via `npm run deploy` (edge function). No APK.

## Decisions (resolved)

1. **`create_automation` scope** → **full multi-trigger / multi-action** (complex nested trees),
   made safe by the pure validator + plain-English confirm preview.
2. **Gaps** → **fill all of them** (the Gap-filling tools above).
3. **Tier** → **botanist+** for all new tools.

## Scale note

This is now ~10 automation/device tools **plus** ~12 gap-filling tools (~22 new tools) + a pure
tree-builder/validator + tests + docs. I'll implement in coherent batches (automations+devices first,
then gap tools), keeping each batch building + Deno-green, and ship once at the end (or in two
deploys if you'd prefer the automations live sooner — say the word).
