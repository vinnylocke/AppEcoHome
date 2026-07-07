# Garden AI — round 3: phantom-🔧 guard, achievable fixtures, frozen rubric, trimmed rules

Follows [round 2](garden-ai-eval-round2-template-and-fixes.md). Round-2 findings: code fixes
verified working, but (a) 2 phantom-🔧 turns (template line written with nothing staged),
(b) some rules slipped (defaults-not-interrogation, tool hygiene, shed-offer), (c) two
measurement confounds — the consistency rubric hardened between runs, and E03/E04 are
unachievable because the demo home has one soil sensor and **no valve**.

## Changes (user-approved)

### 1. Phantom-🔧 guard — server + prompt
- **`agent-chat/index.ts`**: after `finalReply` is final, if `pendingToolCalls.length === 0`
  and the reply contains a `🔧` line, strip those lines (logged as `phantom_action_line_stripped`).
  The reply can never claim an action is staged when no card exists — deterministic, model-proof.
- **`rules.ts`**: the template rule states the 🔧 line only *describes* a card created by an
  actual tool call this turn — writing the line creates nothing; no call → no line.

### 2. Achievable fixture — a valve for the demo home
- **`scripts/seed-test-account.mjs`**: `seedSmartHome` also seeds a `water_valve` device on the
  same custom_http integration + Raised Bed A (with a couple of `{state}` readings), so future
  reseeds include it.
- **One-off prod insert** for the existing demo home (same integration id, mirrors the seeder).
- **`question-bank.mjs`**: E03 references "South Border" — an area the demo home doesn't have.
  Reworded to "Raised Bed A" (comparability caveat noted in the bank; E03 was unachievable
  before, so there was nothing valid to compare against anyway).

### 3. Frozen rater rubric — `docs/ai-chat-eval/rating-rubric.md`
The full rating instructions (dimensions, template rubric, tool-verdict definitions, design-intent
bullets) live in one versioned file. Rating agents are told to READ this file + `reply-template.md`
and apply them verbatim — every future run is scored against the same exam. Rubric content is
locked to round-2 strictness (now the standard).

### 4. Trimmed, consolidated rules (`rules.ts`)
23 flat rules → grouped blocks so compliance stops diluting:
- **ACTING** block: stage-don't-describe · defaults-not-interrogation · resolve-ids/no-guessed-ids ·
  do-everything-asked · dependent chains · refinements.
- **TOOL ROUTING** block: attention→overdue-summary(answer in plants) · optimise→optimise_area_schedule ·
  sensors→quote latest reading · "my climate"→get_weather_now/location context · no plant-DB lookups
  for knowledge facts (recommendations + companion facts included).
- Knowledge/no-refusal, shed-offer, care→task, don't-over-act, bulk-vs-ghosts, diagnosis, template,
  and hygiene rules kept, tightened where round 2 slipped (N03 offer, N14/N19 hygiene, E05 routing, E18 climate).
- `agentChatRules.test.ts` updated to the consolidated phrasing (all guarantees keep a test).

## Rollout
Edge-function + scripts + eval docs (no migration) → deploy `--bump 1` → one-off valve insert →
re-run bank → rate via frozen rubric → 4-run comparison report → commit.
