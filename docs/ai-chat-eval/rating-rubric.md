# Garden AI evaluation — rating rubric (v1, frozen)

The single versioned exam every run is scored against. Rating agents READ this file and
`reply-template.md` and apply them verbatim — do not paraphrase, loosen, or harden them.
If the rubric ever needs to change, bump the version header and note it in the report so
cross-run comparability breaks are explicit.

## What you are rating

Each conversation = `{ id, persona, cat, expect, turns:[{ q, reply, tools, pending, plants }] }`.

- `tools` = read tools that RAN live (list_plants, list_tasks, list_areas, list_devices —
  each sensor row includes `latest_reading` + `reading_recorded_at` — list_blueprints,
  list_automations, list_seed_packets, list_plans, get_overdue_summary, get_weather_now,
  search_plant_database, get_plant_details, show_plant_images, optimise_area_schedule).
- `pending` = a MUTATION the AI **staged via a confirm card** — the correct way it acts
  (it cannot auto-execute). A relevant tool in EITHER `tools` or `pending` counts as "used".
- `expect` lists tools that would be appropriate — a guide, not gospel. Judge independently.

## Design intent (what "correct" behaviour is)

- **Explicit action request** ("add basil", "set up a watering schedule", "remind me Saturday",
  "log that I sowed kale") → the tool is STAGED that turn with sensible defaults: the AI resolves
  areas/plants/devices itself via `list_*`, picks a reasonable cadence/date, and states assumptions.
  Bouncing the setup back as questions (more than ONE clarifying question) is a miss.
- **Never a guessed id** — staging with an invented id (broken "not found" preview) is a serious miss.
- **Multi-action messages** → ALL actions staged. When step B needs the id step A creates
  (link-after-add, plants-after-plan, sow-after-packet), staging A and *announcing* B for right
  after confirmation is correct; silently dropping B is partial; "that doesn't exist" is a miss.
- **Refinements** of a just-staged action ("only the greenhouse ones") → the corrected version is
  re-staged immediately.
- **Plant not in the Shed** named in a care question → full answer from knowledge PLUS an
  add-to-Shed offer. No offer = partial. Offering a plant they already own = over-use.
- **Time-bound care advice** ("prune in late summer") → a task offer is preferred.
- **Attention questions** ("which plants have I neglected") → get_overdue_summary (+list_plants),
  answered in PLANTS, not a task dump.
- **Optimise requests** → the optimise_area_schedule tool.
- **Sensor questions** → quote the ACTUAL latest reading and its age.
- **Climate questions** ("in my climate") → weather/location context, never an assumed climate.
- **Yes/no questions** get the answer — an unrequested mutation (e.g. an automation nobody asked
  for) is over-use.
- **Pure general knowledge** (facts, recommendations, companions, myths) → NO tool; running
  search_plant_database for these is over-use.
- **Vague/dangerous bulk requests** ("delete everything") → cautious handling, no eager
  destructive tools.
- **Fixture note:** the demo home has ONE soil sensor and (from round 3) one water valve, both on
  Raised Bed A. Refusing to act on a device that genuinely doesn't exist is CORRECT behaviour.

## Dimensions (rate each conversation holistically across its turns)

- **usability (1–5)** — genuinely useful, actionable, correct, right tone for the persona.
  5 = excellent; 3 = usable with friction; 1 = wrong/evasive/unhelpful.
- **detail (1–5)** — appropriate depth and structure. Thin AND bloated both lose points
  (note which in `concern`).
- **consistency (1–5)** — adherence to THE REPLY TEMPLATE (`reply-template.md`): bottom-line
  first, labelled bullets only when detail exists, `🔎 Checked:` when data was read,
  `🔧 Ready to confirm:` ONLY when something is actually in `pending` (a 🔧 line with empty
  `pending` is a serious inconsistency), max one `→` next step. 5 = clean; 3 = right spirit,
  markers missing/misused; 1 = unstructured or contradicts the template. A 1–2 sentence answer
  to a simple question is fine — judge clarity, not forced bullets.
- **toolVerdict** — exactly one of:
  - `correct` — right tool(s) used appropriately, or correctly none for pure knowledge.
  - `partial` — some right, but an obvious one missed / wrong params / half the request.
  - `missed` — clearly should have used/staged a tool and didn't.
  - `overused` — a tool or staged action that wasn't warranted.
  - `na` — knowledge question, no tool appropriate, none used.
- **toolNote / highlight / concern** — one concise sentence each (`concern` may be `""`).

## Output shape

```json
[{ "id": "N01", "usability": 4, "detail": 4, "consistency": 4,
   "toolVerdict": "correct", "toolNote": "...", "highlight": "...", "concern": "" }]
```

Be a fair but exacting judge.
