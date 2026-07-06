# Fix — Garden AI chat refuses plant questions when the plant isn't in the Shed

## The problem

Asking the Garden AI chat **"we have a crab tree, when should we harvest the apples"** returns:

> "I can't find any information about crab apple trees in my database."

But taking a **photo** of the apples and asking if they're ripe answers perfectly — when they'll be ripe, what to look for, how to test them.

So the text chat refuses general horticultural questions about plants the user doesn't have catalogued, while the image path answers freely. That's backwards — a "when do I harvest crab apples?" question needs zero data about the user's garden.

## Why it happens

The two paths are different edge functions (see [Garden AI chat reference](../app-reference/05-tools/03-plant-doctor-chat.md)):

- **Text** → `agent-chat` — a tool-using agent grounded in the user's garden.
- **Image** → `plant-doctor-ai` — Gemini vision + general knowledge, no DB grounding. Answers fine.

In [`agent-chat/context.ts`](../../supabase/functions/agent-chat/context.ts) the system prompt has two rules that conflict:

1. **KNOWLEDGE QUESTIONS** (line ~177) — "answer directly from your gardening knowledge."
2. **MANDATORY — PLANT-IN-SHED CHECK** (line ~180) — every time the user names a plant in a care/harvest question "it is a PERSONAL-GARDEN question… The user phrasing it as a how-to does NOT make this a knowledge question."

Rule 2 is worded far more forcefully ("MANDATORY", "You MUST", "does NOT make this a knowledge question") and **overrides** rule 1. So the model treats "when to harvest crab apples" as a personal-garden question, calls the `search_plant_database` tool, which on a miss returns the summary **"Found 0 matching plants in the database."** ([`executors/read.ts:326`](../../supabase/functions/agent-chat/executors/read.ts)), and the model echoes that as *"I can't find any information about crab apple trees in my database"* — a hard refusal.

The image path has no Shed-check rule and no plant-DB tool, so it just answers.

## App-reference files consulted

- [05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md) — Garden AI chat (the `agent-chat` surface). **Will update.**
- [05-tools/02-plant-doctor.md](../app-reference/05-tools/02-plant-doctor.md) — the image path, for contrast.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini usage + grounding.

## The fix (prompt-first, no behaviour tools changed)

### 1. `supabase/functions/agent-chat/context.ts` — reconcile the rules

Rewrite the RULES block so the Shed check is **additive, never a gate**:

- A plant-care/harvest question is **both** a knowledge question **and** (if the plant is theirs) a personal one. The assistant must **always answer the horticultural question from its own expert knowledge first**, then — only if that named plant isn't in the SHED — append the concrete "want me to add it?" offer.
- Add an explicit **anti-refusal rule**: *Never* tell the user you "can't find information about X" or that "X isn't in my database." The SHED and `search_plant_database` only track/return the user's-and-catalogue plants — they are **not** the limit of your horticultural knowledge. A `search_plant_database` result of 0 means "no catalogue entry to add," **not** "unknown plant."
- Keep the genuinely-personal path intact: when the plant **is** in the Shed, or the question is about their specific instance ("is *my* tomato ready?"), still use tools / their data.

### 2. `supabase/functions/agent-chat/executors/read.ts` — soften the empty summary (secondary)

Change the empty-result summary of `search_plant_database` from the refusal-inviting *"Found 0 matching plants in the database."* to something that steers the model to answer from knowledge, e.g. *"No catalogue match for '<query>' — this is not a limit on your knowledge; answer from your own horticultural expertise and, if it's a plant the user grows, offer to add it as a manual plant."* (Non-empty summary unchanged.)

## Files to change

| File | Change |
|------|--------|
| `supabase/functions/agent-chat/context.ts` | Rewrite RULES: reconcile knowledge vs shed-check, add anti-refusal rule |
| `supabase/functions/agent-chat/executors/read.ts` | Soften `search_plant_database` empty-result summary |

## Tests

- LLM output isn't deterministic, so the *behaviour* can't be unit-asserted. I'll check `supabase/tests/` for an existing `agent-chat` context/prompt test; if the prompt is assembled by a testable pure path, add a **Deno test asserting the built prompt contains the anti-refusal guidance** (a cheap regression guard that the rule text is present and the old "does NOT make this a knowledge question" phrasing is gone). `buildHomeContext` needs a DB client, so this may require the existing test's mock — I'll follow whatever pattern `supabase/tests/` already uses, and if none exists for agent-chat, note that and rely on manual verification.
- **Manual verification (post-deploy):** on the demo account, ask the chat "we have a crab tree, when should we harvest the apples" → expect a real harvest-timing answer **plus** an offer to add crab apple to the Shed, and **no** "not in my database" refusal. Re-test an in-Shed plant ("is my tomato ready to pick?") to confirm the personal path still works.

## App-reference updates

- [05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md) — under *Error states* / behaviour, document that the assistant answers general horticultural questions even for plants not in the Shed (never refuses with "not in my database") and instead offers to add the plant.

## Risks / notes

- **Don't over-correct:** the fix must preserve the valuable "offer to add this plant to your Shed" and "offer to create a task" behaviours — it only stops the *refusal*. The rewrite keeps both offers, just downgrades the Shed check from a gate to an addendum.
- Prompt-only + one summary string — no tool logic, schema, or client changes. Deploys as an edge-function update.
