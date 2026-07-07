# Garden AI — round 8: wave-3 "raw" persona questions (no app knowledge)

User request: a large batch of questions from both personas written as if they have **zero
knowledge of how the app works** — no app vocabulary (Shed, blueprints, areas, confirm cards),
no assumed mechanics. This tests dimensions the bank never covered: translating app concepts
into plain language, honest capability answers ("can it…?"), first-run orientation, offline/
privacy/data questions, and raw action requests ("can you remind me to water stuff?").

## Changes

1. **`question-bank.mjs` — wave 3 (+44 → 140 conversations, ~158 turns):**
   - `RAW_NEW` (RB01–RB22): brand-new gardener + app novice — "what do I do first?", "how do I
     put my plants into the app?", "is this free?", "does it work with no signal?", "why does it
     want my location?", "can my husband see the same garden?", "what's the green chat button?".
   - `RAW_EXP` (RE01–RE22): expert gardener + app novice — "can this replace my 20-year paper
     journal?", "80 plants — one by one?", "is it a timer or does it think?", "which sensors does
     it support?", "who owns my data?", "how do I know the AI isn't making things up?",
     "remind me every February to chit my potatoes".
2. **`rating-rubric.md` → v1.2 (additive):** wave-3 guidance — plain-language concept
   translation (jargon dumped on a novice is a usability hit), accurate capability answers
   (features that exist: reminders/schedules, photo ID, weather alerts, plans, shared homes,
   Ecowitt/eWeLink/webhook sensors; honest "not yet" for export/API), raw action phrasing still
   deserves staging, first-run orientation should be brief and confidence-building.

No code/deploy — eval assets only. Run against the live 35.0017 (Pro), rate (12 batches),
9-run report. Wave-3 ids have no prior-run comparisons.
