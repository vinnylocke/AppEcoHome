# Garden AI — round 5: read-then-stall retry, wave-2 verbs, use-what-you-read

Follows [round 4](garden-ai-eval-round4-forced-retry-and-wave2.md). Wave-1 like-for-like improved
across every metric (missed 6→2); wave-2's first outing surfaced three new clusters.

## 1. Forced retry covers "read-then-stall" (E14/E16/E23/E32)

The retry only fired when round 0 made **zero** calls. The remaining stall shape is: run a
`list_*`, then answer in prose with nothing staged. Change (`agent-chat/index.ts`): replace the
`round === 0` condition with a once-per-send flag — whenever the model is about to finish with
prose (`no functionCalls`), the message is action-explicit, **nothing is pending yet**, and the
retry hasn't been used, force `toolChoice: "ANY"`. Crucially this now happens WITH the read
results already in `messages`, so the model stages with real ids. Nudge updated: "you already
gathered the data — stage the action now".

## 2. Wave-2 verbs in `actionIntent.ts` (E31/E45/E35)

New conservative patterns: open/close a valve; change/adjust/update an alert/automation/
schedule/reminder/blueprint/threshold; imperative "Plan a … [and add …]". Fixture tests extended
with the real wave-2 phrasings (positives) and the over-use victims (N30/N33/E33/E46) as
negatives — they must NOT be flagged.

## 3. Rules: use-what-you-read + over-acting counterweight (N30/N32/N33/E26/E33/E44/E46/N47)

- **USE WHAT YOU READ** (new rule): a read tool's payload must shape the reply — quote the
  values/names it returned (reading + age, automation names). Never call a tool then answer as
  if you hadn't; never call one whose result you don't need — pure knowledge facts (toxicity,
  sun needs, watering science) call NOTHING.
- **DON'T OVER-ACT** gains the N33 example: an "is that bad?" temperature question gets an
  answer, never an unrequested automation proposal.
- **PLANT-IN-SHED OFFER** gains: the SHED section is the source of truth for ownership — never
  claim a plant isn't tracked from a catalogue miss (N47), check the SHED list (or list_plants).

## Rollout

rules + actionIntent + index.ts (+ tests) → deploy `--bump 1` → run all 96 → rate (8 batches,
rubric v1.1 unchanged) → 6-run report → commit. Wave-2 now has a prior run to compare against.
