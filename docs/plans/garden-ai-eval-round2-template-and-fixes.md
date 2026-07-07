# Garden AI — round 2: remaining missed/partial fixes + the Rhozly Reply Template

Follows [garden-ai-eval-fixes-and-harness.md](garden-ai-eval-fixes-and-harness.md). Driven by the
post-fix run (`docs/ai-chat-eval/runs/run-35.0010_*.json`): 9 partial, 3 missed, 1 over-used.

## Root-cause analysis of the 13 flagged conversations

| Cause | Conversations | Fix layer |
|---|---|---|
| Interrogates instead of resolving + proposing defaults ("which beds? how often?") | N12, E02, E14, E08 | prompt |
| Dependent-action chains dead-end (B needs the id A creates) | E11, E16, E23 | prompt |
| Staged-card turns carry no reply text → canned "I need a quick confirmation" | E04, E06-t1, E11-t1, E16-t1 | **code** |
| Staged a mutation with an invented id → broken "preview unavailable" card | E04 | **code + prompt** |
| Wrong tool for the question (task-dump for a plants question; "no sensor access"; needless DB search) | E05, E09, N20 | prompt + **code (E09)** |
| Refinement of a just-staged action falls into "could you rephrase" | E06-t2 | prompt |

## Code fixes

1. **`agent-chat/index.ts` — preview failure bounces back to the model.** Today a failed
   `mutation.preview()` (e.g. "Automation not found" for a guessed id) still stages a card whose
   preview is a raw error string. Change: don't stage; push a `functionResponse` error telling the
   model to resolve the id via `list_*` and retry — the agent loop continues and self-corrects. (E04)
2. **`agent-chat/index.ts` — informative staged-card fallback.** When the model stages cards but
   returns no text, compose the reply from the pending previews ("🔧 Ready to confirm: … — review the
   card below and tap Confirm") instead of the bare canned sentence. Deterministic fix for the
   cold "I need a quick confirmation" turns.
3. **`agent-chat/executors/read.ts` — `list_devices` includes the latest reading** per device
   (`device_readings` newest row: soil_moisture / soil_temp / soil_ec, valve state, recorded_at) so
   sensor questions can quote real values. (E09 — the tool genuinely had no reading data.)

## The Rhozly Reply Template (new)

Canonical copy: [docs/ai-chat-eval/reply-template.md](../ai-chat-eval/reply-template.md) — embedded
in `rules.ts`, rendered on the eval report, and used as the rubric for the **consistency** rating.

1. **Bottom line** — one plain sentence answering the question / stating what was staged.
2. **Detail bullets** (only when needed, ≤6) — `- **Label:** fact` (When / How / How much / Watch for).
3. `🔎 Checked: <garden data read this turn>` (only when read tools ran).
4. `🔧 Ready to confirm: <staged action(s)>` (+ what will be staged after confirmation, for chains).
5. `→ <one next step>` (optional, max one).
Simple factual questions: sentence + optional `→` only.

## Prompt fixes (`rules.ts`, all tested)

- REPLY TEMPLATE rule (above) — replaces the looser ANSWER FORMAT rule; bans bare "I need a confirmation".
- DEFAULTS, NOT INTERROGATION — resolve the place via `list_areas`/`list_plants`, pick a sensible
  frequency from horticultural knowledge, stage the editable card stating assumptions; ≤1 question.
- NEVER STAGE A GUESSED ID — ids must come from a `list_*`/search result this conversation.
- REFINEMENTS — user tweaks a just-staged action → immediately stage the corrected version.
- DEPENDENT ACTIONS — stage step A now, announce step B in the 🔧 line, stage B next turn after
  confirmation; never "that doesn't exist" for the user's own request.
- ATTENTION QUESTIONS — `get_overdue_summary` (+`list_plants`), answer in plants, not a task dump.
- OPTIMISE — "tidy/streamline/optimise an area" → `list_areas` then `optimise_area_schedule`.
- SENSORS — `list_devices` now carries readings; quote the value + recorded-at.
- TOOL HYGIENE — no `search_plant_database` for general-knowledge facts.

## Rollout

Edge-function only (no migration, no frontend) → `npm run deploy -- --bump 1` → re-run the same
question bank → rate (consistency judged against the template) → comparison report (3rd run in history).

## App-reference

- Update [05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md)
  behaviour-rules block (template + new rules, list_devices readings).
