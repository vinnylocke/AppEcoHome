# Plan — Chat knowledge-Q fallback + Overhaul empty-plants safety net

## Context

Two bugs reported by Vinny on 2026-05-30:

1. **Chat assistant bails on general gardening questions.** Asking *"how far apart should I plant butterhead lettuce?"* (a knowledge question, no relevant tool) returned a canned *"I ran the tools but couldn't put a final answer together"* instead of an answer. The agent is biased toward tool use by the system prompt and falls into a hard-coded fallback when Gemini exits without text.
2. **Garden Overhaul plan opens with an empty Phase 2 (The Shed) — no plants suggested.** A user opens a freshly-generated overhaul plan, advances through Phase 1, and Phase 2 shows the "Tick any plants…" hint with no plant cards at all.

## App-reference files consulted

- [docs/app-reference/04-planner/02-plan-staging.md](docs/app-reference/04-planner/02-plan-staging.md) — Phase 2 contract (reads `localBlueprint.plant_manifest`)
- [docs/app-reference/04-planner/09-garden-overhaul.md](docs/app-reference/04-planner/09-garden-overhaul.md) — overhaul write path (`ai_blueprint.plant_list`)
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](docs/app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini integration patterns

## Root causes

### Chat
- [supabase/functions/agent-chat/context.ts:154-155](supabase/functions/agent-chat/context.ts#L154-L155): rules push "use the provided tools" without telling Gemini what to do when no tool fits the question.
- [supabase/functions/agent-chat/index.ts:351-353](supabase/functions/agent-chat/index.ts#L351-L353): when the agentic loop exits with `finalReply` undefined, a canned line is shipped — there's no "answer this conversationally" fallback.

### Overhaul empty plants
- [supabase/functions/generate-garden-overhaul/index.ts:309-318](supabase/functions/generate-garden-overhaul/index.ts#L309-L318) persists `ai_blueprint: parsed.blueprint` without validating that `plant_list` is non-empty. Gemini can (and clearly did) return `plant_list: []` despite the prompt asking for 8–15 items.
- [src/lib/overhaulBlueprintAdapter.ts:169-177](src/lib/overhaulBlueprintAdapter.ts#L169-L177) maps `plant_list → plant_manifest` faithfully; empty in → empty out.
- [src/components/PlanStaging.tsx:1374](src/components/PlanStaging.tsx#L1374) `.map()`s the manifest with no empty-state fallback; the user sees a blank Phase 2.

## Approach

### 1. Chat — system-prompt rule + tool-less fallback (≈25 lines)

**A. context.ts** — add a new rule to the RULES block:

> *KNOWLEDGE QUESTIONS — when the user asks for general horticultural knowledge (plant spacing, watering frequency, sowing depth, pest ID, propagation technique, what something looks like, etc), answer directly from your gardening knowledge. Don't reach for a tool unless the question is specifically about THEIR garden (their plants, their tasks, their plan).*

**B. agent-chat/index.ts** — replace the canned `finalReply` fallback (lines 351-353) with a single tool-less Gemini call:

```ts
if (!finalReply) {
  // No tool produced a useful answer — re-ask Gemini with no tools,
  // letting it answer the user's original question conversationally.
  const fallback = await callGeminiWithTools(apiKey, FN, [
    { role: "user", parts: [{ text: message }] },
  ], [], {  // empty tools array
    systemPrompt: `${fullPrompt}\n\nAnswer the user's last question directly and conversationally. Do not mention tools.`,
    toolChoice: "NONE",
    logContext: { round: "fallback", userId },
  });
  totalTokensSpent += fallback.usage.totalTokenCount;
  finalReply = fallback.text?.trim() || "I'm not sure how to help with that — could you rephrase?";
}
```

### 2. Overhaul — server warning + client empty-state (≈30 lines)

**A. generate-garden-overhaul/index.ts** — log plant count in `vision_succeeded` and warn loudly when zero:

```ts
const plantCount = Array.isArray(parsed.blueprint?.plant_list) ? parsed.blueprint.plant_list.length : 0;
log(FN, "vision_succeeded", {
  plan_id: planId,
  vision_cost_usd: visionCostUsd,
  concept_count: conceptPrompts.length,
  plant_count: plantCount,
});
if (plantCount === 0) {
  warn(FN, "ai_returned_empty_plant_list", { plan_id: planId });
}
```

(Not a hard failure — we still want concept images to render. Future enhancement: retry once if zero. Scoped out of this fix to stay minimal.)

**B. PlanStaging.tsx** — empty-state in Phase 2 when `plant_manifest.length === 0`:

When Phase 2 is unlocked, no plants are mapped, and the manifest is empty, render an info panel above the existing "Add Custom Plant" button:

> *The AI didn't suggest any plants for this overhaul. Use **Add Custom Plant** below to populate The Shed manually, or go back to Phase 0 and **Regenerate**.*

Existing "Add Custom Plant" + "Regenerate" actions already exist — this is just guidance text + a `data-testid="phase-2-empty-state"` hook.

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/agent-chat/context.ts` | + KNOWLEDGE QUESTIONS rule |
| `supabase/functions/agent-chat/index.ts` | Replace canned fallback with tool-less re-prompt |
| `supabase/functions/generate-garden-overhaul/index.ts` | Log `plant_count`, warn when zero |
| `src/components/PlanStaging.tsx` | Empty-state in Phase 2 when manifest is empty |

## Tests

- `tests/unit/lib/overhaulBlueprintAdapter.test.ts` — already covers `plant_list: []` → empty `plant_manifest` (idempotent pass-through). No new unit case required.
- No edge-function unit test exists for agent-chat fallback; behaviour is best validated manually.
- Manual verification:
  - Chat: ask *"how far apart should butterhead lettuce be?"* → conversational answer (not the canned line).
  - Overhaul: submit a plan, force-edit the AI blueprint to `plant_list: []` in DB (or wait for AI to do it organically), open Phase 2 → empty-state guidance visible.

## App-reference docs to update

- [docs/app-reference/04-planner/02-plan-staging.md](docs/app-reference/04-planner/02-plan-staging.md) — add empty-plants empty-state to Phase 2 description (Error states + Common pitfalls).
- No update needed to the chat reference — fallback behaviour is internal to the agent.

## Risks

- Tool-less fallback adds one extra Gemini call when the agentic loop fails. Bounded; common path unaffected.
- Empty-state copy is informational, not a regen trigger — keeps the change minimal but doesn't auto-recover.

## Release-notes bump

Single `--bump 1` (two small bug fixes, not a major feature).
