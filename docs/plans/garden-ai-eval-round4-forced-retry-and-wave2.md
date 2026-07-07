# Garden AI — round 4: forced tool-choice retry + wave-2 question bank

Follows [round 3](garden-ai-eval-round3-phantom-guard-and-rubric.md). The stuck cluster
(N12/E02/E14/E16/E23 — explicit action, no tool call; E11/E06-t2 — cross-turn continuity)
didn't move across three prompt iterations → mechanical fix, plus a user-requested +50
conversations probing robustness, accuracy, usefulness and the high-tech surface.

## 1. Forced tool-choice retry (mechanical fix)

- **`agent-chat/actionIntent.ts`** (new, pure): `isActionExplicit(message, history)` —
  conservative regex battery for imperative requests ("set up…", "remind me…", "log that…",
  "mark … as done", "push … back"…) plus refinement detection (previous model turn carries 🔧
  and the message adjusts it). Deliberately prefers misses over false positives — a false
  positive would force a tool call onto a knowledge question (round-2's over-acting bug).
  Fixtures in `agentChatActionIntent.test.ts` are the real question-bank phrasings.
- **`agent-chat/index.ts`**: computed once per send; if round 0 returns **zero** function calls
  on an action-explicit message, re-ask once with `toolChoice: "ANY"` (+ a nudge: stage the
  action, list_* first if an id is missing, survey-don't-destroy when the ask is dangerously
  broad). Logged as `forced_action_retry`.

## 2. Wave-2 question bank (+50 → 96 conversations, 111 turns)

`NEW2` (N23–N47) + `EXP2` (E25–E49) in `question-bank.mjs`: input robustness (typos, gibberish,
emoji, rambling, injection ×2), factual accuracy (pH, germination temps, EC, watering science,
hemisphere conflict), usefulness (prioritisation, budgets, garden-centre prep, season synthesis,
toddler-safety cross-reference), high-tech (multi-condition + rain-skip automations, automation
forensics, battery health, surgical edits, bulk winter toggle, capability honesty: CSV/API/frost
triggers/journal read-back). Rubric bumped **v1.1** (additive wave-2 guidance; dimensions
unchanged — v1 comparability preserved).

## Rollout

Edge-function + eval docs only → deploy `--bump 1` → run all 96 → rate (8 batches of 12, frozen
rubric) → 5-run report. Wave-2 ids have no prior-run comparisons (first appearance).
