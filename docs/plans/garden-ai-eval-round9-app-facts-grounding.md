# Garden AI — round 9: APP FACTS block + ungrounded-data-claim guard

Follows [round 8](garden-ai-eval-round8-raw-persona-wave.md). Wave-3 raw questions exposed two
systemic gaps: (1) zero app-capability grounding — the assistant denied real features (photo ID
RB06, shared homes RB15, frost alerts RE15) and invented fake ones (Zigbee sensors RE09, CSV
export RE12); (2) ungrounded data claims — "your watchlist is empty", fabricated frost dates,
with no tool call behind them (RB16/RE10/RE13/RB11/RB19).

## 1. APP FACTS block (`agent-chat/appFacts.ts`, appended to the system prompt)

A compact, maintained truth-table of Rhozly's actual capabilities in plain words — what exists
(and what it's called), what doesn't. Sources: app-reference + tools catalogue. Key truths:
Plant Lens photo ID/diagnosis EXISTS; shared homes with member permissions EXIST; frost & heat
weather ALERTS exist natively (but automation *triggers* support rain/heatwave only, NOT frost);
sensors = Ecowitt, eWeLink, DIY HTTP webhook ONLY (no Zigbee/Matter/brands); bulk add via
paste-a-list AI parsing + seed-packet camera scan; journals/photos per plant; multiple locations
each with their own weather; PWA offline viewing with sync queue (AI needs connection); Sprout
free tier + paid tiers; NO CSV/data export, NO public API, NO printing. Ends with: when asked
about an app capability, answer from THIS list — never guess in either direction.

## 2. Ungrounded-claim guard (prompt + forced-retry trigger)

- Rule: NEVER state a fact about THEIR data (plant lists, empty/overdue states, frost dates,
  sensor values) without a tool call behind it this turn — read first.
- Mechanical: `claimsUserData(text)` (conservative patterns: "your X is empty", "you have no…",
  "you don't have any…") added to `actionIntent.ts`; the existing once-per-send forced retry
  gains a second trigger — model about to finish in prose + ZERO read tools ran + reply claims
  user data → retry with `toolChoice: "ANY"` and a grounding nudge. Same machinery that fixed
  action staging.

## Rollout

Deno tests for both modules → deploy `--bump 1` → run 140 → rate (12 batches, rubric v1.2
unchanged) → 10-run report. Success criteria: wave-3 capability answers flip to the truth-table
(RE09/RE12/RB06/RB15/RE15), zero ungrounded empty-claims.
