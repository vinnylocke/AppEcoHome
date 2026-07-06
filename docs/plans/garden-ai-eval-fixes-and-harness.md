# Garden AI — eval fixes, format rule, and a versioned eval harness

Driven by the Garden AI chat evaluation ([docs/ai-chat-eval/](../ai-chat-eval/)). Three strands.

## 1. Fix the missed/partial opportunities + real bugs

### Prompt fixes (`supabase/functions/agent-chat/rules.ts`)
- **Stage the confirm card, don't just offer** (N12, N15, N18, E14, E16, E19): when the intent to act is already explicit ("set up a watering schedule", "add slugs to my watchlist", "link it to them"), CALL the tool to stage the confirm card in the same turn — don't only describe it or ask "want me to?" without staging.
- **Resolve IDs yourself** (E02, E03): never ask the user for an area/device/blueprint/plant id or name you can look up — call the matching `list_*` first, match by name, proceed. Only ask if genuinely ambiguous after looking.
- **Do ALL explicitly-requested actions** (E16): a message asking for several actions gets all of them staged, not just the first.
- **Don't offer to add a plant already in the Shed** (N20): re-scan SHED before offering `add_plant_to_shed`; if it's already there, reference the existing instance instead.
- **Don't over-propose** (E09): answer the question actually asked; never stage a mutation (e.g. an automation) the user didn't request. A yes/no question gets the reading + answer.
- **Bulk task tools vs schedule ghosts** (E06): `bulk_reschedule`/`bulk_complete_tasks` only affect already-created task rows, not schedule-projected occurrences. If a bulk action matches nothing but tasks are clearly due, explain they come from a schedule and offer `update_blueprint`/`pause_blueprint` instead.
- **Diagnosis** (N04): describe-a-problem messages get a real diagnosis (likely causes + fixes) from the symptoms — never a symptom-named ailment ("Yellow Leaves") and never a bare "I need a confirmation".

### Code fix (`supabase/functions/agent-chat/executors/read.ts`)
- **`get_plant_details` catalogue fallback** (E12): after the `plants` lookup misses, resolve the id against `plant_library` (incl. `soil_*` care ranges) so a post-`search_plant_database` details lookup returns real data instead of "no plant found".

## 2. Consistent answer format (new)

- **Prompt (`rules.ts`)** — a house format so replies are predictable & scannable: bottom-line-first sentence → short **bolded-label** bullets for multi-part detail → at most one trailing offer/question. Simple factual questions stay 1–2 sentences (no forced bullets).
- **Eval** — new rating dimension **consistency** (1–5): does the reply follow that predictable, parseable structure? Added to raters + report.

## 3. Versioned, modular eval harness ([docs/ai-chat-eval/](../ai-chat-eval/))

- **`question-bank.mjs`** — the conversations extracted into an exported, documented array so the bank is easy to expand (add an object → next run picks it up). Same questions re-asked each run.
- **`run-eval.mjs`** — imports the bank, stamps each run with `{ runAt (ISO), appVersion (from public/build-version.json), label }`, writes `runs/<stamp>.json` = `{ meta, results }`. Ratings merged into the run file after the rating pass.
- **`build-report.mjs`** — reads ALL `runs/*.json`, renders a **run-history** table (date/time · version · avg usability/detail/consistency · verdict mix) so you see trend, then the **latest** run in full with a delta-vs-previous on the KPIs. Backwards compatible: older runs simply lack newer metrics (shown as "–").
- The just-completed eval is frozen as the **baseline** run file (version 35.0009, pre-fix); the re-run after deploy is the **latest** (post-fix), so the report shows the before/after.

## Deploy + re-run
Prompt + `read.ts` are edge-function only (no migration) → `npm run deploy`. Then re-run the same bank → rate (incl. consistency) → report shows latest vs baseline.

## Tests / docs
- Extend `supabase/tests/agentChatRules.test.ts` to guard the new rules (stage-the-card, resolve-ids, format).
- Update [05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md) (behaviour + format) and the eval README.
