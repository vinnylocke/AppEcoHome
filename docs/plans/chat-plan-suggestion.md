# Plan — Plant Doctor Chat: detect "project" trends and offer to create a Plan

## Problem

When a beginner is researching their first garden, they tend to ask the chat about several plants in a row — "Can I grow tomatoes here?", "What about peppers?", "Do strawberries need full sun?". Each reply is helpful in isolation but the chat never pulls the thread together. There is no nudge from Rhozly to say "hey, sounds like you're planning a sunny veggie patch — want me to help you turn this into a Plan?" The Planner exists for exactly this purpose but new users don't connect the dots.

Agreed direction: the chat learns from the conversation and, when it detects a coherent project theme across multiple plants, offers to start a Plan in the Planner. When the trend is unclear, it asks conversationally what the user is after rather than pushing a CTA.

## App-reference files consulted

- [docs/app-reference/05-tools/03-plant-doctor-chat.md](../app-reference/05-tools/03-plant-doctor-chat.md) — chat overlay schema and current message types.
- [docs/app-reference/04-planner/01-planner-dashboard.md](../app-reference/04-planner/01-planner-dashboard.md) — confirmed the existing `?open=new-plan` URL trigger pattern.
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini response-schema conventions.
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md) — confirmed query-param + searchParams is the established pattern for cross-screen handoffs.
- [docs/app-reference/99-cross-cutting/14-caching.md](../app-reference/99-cross-cutting/14-caching.md) — sessionStorage / URL-state trade-offs.

## Solution

A two-mode response from the AI based on its own judgement of the conversation:

1. **Soft probe (text only)** — when the AI sees a trend forming (2+ distinct plants in recent turns) but can't yet name the project, it asks in its normal `text` reply: "I notice you're looking at a few different plants — are you working on a particular project? I can help organise it into a Plan."

2. **Hard CTA (`plan_suggestion` card)** — when the AI is confident enough to propose a specific Plan (clear theme + at least one named plant), it emits a structured `plan_suggestion` payload alongside the text. The chat renders this as an inline card with two buttons: **Create this Plan** (opens the Planner's New Plan modal pre-filled with the suggested name + description) or **Not now**.

Guardrails baked into the prompt:
- Never emit `plan_suggestion` more than once unless the topic shifts substantially.
- Don't suggest a plan for diagnostic / one-off advice ("why are my carrots forking?").
- The suggested `plan_name` must be concrete and short (≤ 40 chars), not "Project 1".

Client-side guard: the chat checks recent history for an already-shown `plan_suggestion` and tells the AI via a system-prompt hint to skip emitting another. This is enforced by inspecting the last ~10 turns server-side too, as a belt-and-braces measure.

### Wire flow

```
Chat (assistant message)
└── PlanSuggestionCard
    └── "Create this Plan" tapped
        ├── setIsOpen(false) — close chat
        ├── sessionStorage.setItem("plannerPrefill", { name, description })
        └── navigate("/planner?open=new-plan")
              ↓
PlannerDashboard
└── reads ?open=new-plan + sessionStorage("plannerPrefill")
    └── opens <NewPlanForm initialName description /> with fields prefilled
        └── sessionStorage.removeItem("plannerPrefill") after consumption
```

URL params would have worked, but plan descriptions can be long enough to make the URL ugly + we lose them on share. sessionStorage scoped to a single hand-off is cleaner. The `?open=new-plan` flag stays as the trigger so the existing pattern keeps working.

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/<new>_chat_plan_suggestion.sql` | Add `plan_suggestion jsonb null` to `chat_messages`. |
| `supabase/functions/plant-doctor-ai/index.ts` | Extend `CHAT_SCHEMA` with optional `plan_suggestion`. Extend the system prompt with the two-mode rule + once-per-thread guardrail. Return `plan_suggestion` in the response payload. |
| `src/components/PlantDoctorChat.tsx` | Add `plan_suggestion` to the `Message` interface. Persist it via `saveMessageToDB`. Render `<PlanSuggestionCard>` inside the assistant bubble when present. Hydrate it on history load. |
| `src/components/chat/PlanSuggestionCard.tsx` (new) | Renders the suggestion card with **Create this Plan** + **Not now** actions. On accept: closes the chat, writes sessionStorage, navigates to `/planner?open=new-plan`. |
| `src/lib/plannerPrefill.ts` (new) | Tiny pure helper: `readPlannerPrefill()` / `writePlannerPrefill(payload)` / `clearPlannerPrefill()` over sessionStorage, with the JSON parse + shape guard in one place. |
| `src/components/PlannerDashboard.tsx` | When the `?open=new-plan` effect fires, also read sessionStorage via the helper and forward `initialName` / `initialDescription` to `NewPlanForm`. Clear sessionStorage after consumption. |
| `src/components/NewPlanForm.tsx` | Accept optional `initialName` and `initialDescription` props. Use them as the initial state for `formData.planName` and `formData.description`. |

## Tests

- `tests/unit/lib/plannerPrefill.test.ts` — round-trip via the helper; shape guard rejects malformed values without throwing; cleared state returns null.
- `supabase/tests/plant-doctor-ai-schema.test.ts` (if a shared schema test exists for this fn; otherwise skip — Deno fixtures for this fn are thin).

## App-reference Docs to Update

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — Document the new `plan_suggestion` field, the soft-probe vs hard-CTA modes, and the once-per-thread rule. Add a new flow entry: "Receive a Plan suggestion".
- `docs/app-reference/04-planner/01-planner-dashboard.md` — Note that `?open=new-plan` can be paired with a sessionStorage prefill from the chat; describe `initialName` / `initialDescription` flowing into `NewPlanForm`.
- `docs/app-reference/99-cross-cutting/13-ai-gemini.md` — Add `plan_suggestion` to the chat schema description.

## Edge cases

- **Older chat messages** — `plan_suggestion` is null on pre-existing rows. UI hides the card when absent. No backfill needed.
- **AI emits a plan but the user is on Sprout tier** — chat is hidden entirely on non-AI tiers, so this can't happen. No extra gating needed.
- **User taps "Create this Plan" twice quickly** — the second tap re-runs the navigation; sessionStorage is overwritten with the same payload. Idempotent.
- **User refreshes mid-handoff** — sessionStorage survives the reload; PlannerDashboard still consumes it. Cleared once consumed.
- **AI suggests a plan in error** — user dismisses ("Not now"). Card is non-blocking; conversation continues. Once dismissed it doesn't re-appear in that message (it's just one rendered card).

## Risks

- **AI over-suggesting**: mitigated by prompt guardrails + server-side check of the last ~10 turns for an existing suggestion.
- **Prefill data shape drift**: the new `plannerPrefill.ts` helper guards reads, so a stray sessionStorage entry can never crash the dashboard.
- **Migration**: single ALTER TABLE ADD COLUMN, nullable, no default. Zero downtime, no backfill.

## Process

1. Write the migration; apply locally first.
2. Update the edge function (schema + prompt + return).
3. Build the client side: helper, card, chat hook-up, planner prefill, NewPlanForm props.
4. Add the Vitest.
5. Update the three app-reference docs.
6. `npx tsc --noEmit`, `npm run test:unit`, deploy with `[skip ci]`.
