# Garden AI — round 6: mechanical template markers (consistency)

Follows [round 5](garden-ai-eval-round5-read-stall-and-overuse.md). Consistency has plateaued
~3.5. Diagnosis from run 35.0014: the server-composed 🔧 line hits **29/29 staged turns**, while
the model-emitted 🔎 line hits **2/60 read turns** — and 28 of the 47 low-consistency rater
notes cite the missing 🔎. Deterministic beats prompted; make the template mechanical wherever
the server knows the truth.

## Changes

1. **`agent-chat/replyMarkers.ts`** (new, pure, Deno-tested): `normaliseReplyMarkers(reply,
   { readTools, pendingPreviews })` →
   - strips model-emitted `🔎` lines and appends ONE canonical `🔎 Checked: …` built from the
     read tools that actually ran (friendly-name map: list_plants → "your plants",
     get_weather_now → "weather", list_devices → "your devices & sensors", search/get catalogue
     → "the plant catalogue"; display-only tools excluded);
   - when cards are pending: keeps the model's first `🔧` line (richer assumptions) or composes
     one from the previews; when nothing is pending: strips ALL `🔧` lines (absorbs the
     phantom-🔧 guard);
   - canonical tail order: body → 🔎 → 🔧 → final `→` offer (an existing trailing `→` line is
     re-appended last); interior content untouched.
2. **`index.ts`**: replace the inline phantom-guard + staged-fallback blocks with the module.
   Staged-with-no-text fallback becomes template-compliant ("I've prepared that for you —
   review and confirm below." + module-appended 🔧).
3. **`rules.ts`**: template rule updated — the app now writes the 🔎 line itself (model told
   NOT to); one compact worked EXAMPLE reply added (bottom line + labelled bullets + `→`),
   since bullets/bottom-line remain model-generated and examples beat prose rules.
4. Tests: new `agentChatReplyMarkers.test.ts` (reads/staged/both/neither, phantom strip,
   model-🔎 replaced, model-🔧 kept, `→` stays last, fallback compose); rules tests updated.

## Expected effect

🔎 and 🔧 → ~100% by construction; consistency driver (28/47 notes) removed; example lifts
bullet/bottom-line adherence. Target: consistency mid-4s.

## Rollout

Deploy `--bump 1` → run 96 → rate (8 batches, rubric v1.1 unchanged) → 7-run report → commit.
