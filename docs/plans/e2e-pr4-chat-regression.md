# PR 4 — E2E suite: Plant Doctor Chat regression net

## Why this scope (not the full catalogue PR 4)

The catalogue PR 4 line says "Plant Doctor + Chat (~45 tests)". The full chat section (R2.08, R2-080 through R2-112) alone is 33 tests, plus the lens identify/diagnose flow. Too much for one focused session.

Recent commit `4d0fbf1 fix(22.0023): chat reply duplication + Shed/task offers tightened` is the live regression target. The shed/task suggestion path was unguarded, and reload-duplication of assistant messages was a real shipped bug. There is currently zero E2E coverage of the chat conversation flow — only the FAB visibility (DOC-012 in `plant-doctor.spec.ts`).

This PR lays the net for the chat regression surface: send → mocked reply → suggested plants / suggested tasks / shed offer detection / no-duplicate-on-reload.

## App-reference files consulted

- [`05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md) — full chat contract (component graph, page context, suggested-plants flow, suggested-tasks flow, plan-suggestion once-per-thread guard, server-side validation).
- [`05-tools/02-plant-doctor.md`](../app-reference/05-tools/02-plant-doctor.md) — the photo surface (not in scope; already covered by `plant-doctor.spec.ts`).
- [`99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini call infrastructure (relevant for the mock approach).

## What we already have

- `plant-doctor.spec.ts` — covers `/doctor` page structure, upload, identify, diagnose, error handling, AI-disabled, FAB visibility (DOC-012).
- `tests/e2e/fixtures/api-mocks.ts` — `mockEdgeFunction(page, fn, response)` helper ready to use; `MOCK_PLANT_DOCTOR_IDENTIFY` / `MOCK_PLANT_DOCTOR_DIAGNOSE` constants for the lens surface.
- `PlantDoctorPage` — lens-only locators; no chat coverage.

## Scope — 10 tests in 1 new spec file

### `plant-doctor-chat.spec.ts` (NEW — 10 tests)

| ID | Test | What it asserts |
|---|---|---|
| CHAT-001 | FAB opens the chat panel | Click `plant-doctor-chat-fab` → chat panel mounts |
| CHAT-002 | Send a text message — user bubble appears, mocked AI reply renders | After `mockEdgeFunction("plant-doctor-ai", { text: "..." })`, send → user bubble + assistant bubble visible |
| CHAT-003 | After closing and re-opening, the assistant reply renders exactly once (22.0023) | Send → close → re-open → assertion: exactly 1 assistant bubble for that turn |
| CHAT-004 | `suggested_plants` payload renders ChatPlantCards | Mock response includes `suggested_plants: [{ name, search_query }]` → cards visible |
| CHAT-005 | `suggested_tasks` payload renders TaskActionButtons | Mock response includes `suggested_tasks: [...]` → at least one "Add to Schedule" button visible |
| CHAT-006 | Cucumber-not-in-shed → "Add to Shed" button visible (22.0023 / R2-097) | Mock reply triggers `plant_actions: [{ kind: "add_plant_to_shed", ... }]` → button rendered |
| CHAT-007 | Care-advice reply offers a "Create Task" CTA (R2-098) | Mock reply includes `suggested_tasks` → task action button visible |
| CHAT-008 | PlanSuggestionCard renders when `plan_suggestion` is in payload | Mock reply with `plan_suggestion: { headline, plan_name, description }` → card visible with "Create this Plan" CTA |
| CHAT-009 | Page-context chip clears via X button | Set a plant context (via setPageContext) → chip visible → click clear → chip hidden |
| CHAT-010 | Cold open loads history from `chat_messages` | Pre-seed two `chat_messages` rows → open chat → both turns visible |

Total: **10 tests** in **1 new spec file**.

## Page object work

- `PlantDoctorChatPage.ts` — NEW. Locators for: FAB, chat-panel root, close button, message-list, user/assistant bubbles, suggested-plant cards, plant-action buttons, plan-suggestion card, page-context chip + clear, input field, send button, attach-image button.

## data-testid deltas needed

I'll scan during implementation. Expected additions to `PlantDoctorChat.tsx`:

- `plant-doctor-chat-panel` on the panel root
- `chat-message-{role}` (or `data-role` attribute) on each message bubble
- `chat-input` on the text input
- `chat-send` on the send button
- `chat-plant-card` (or per-card testid) for ChatPlantCard
- `chat-plant-action-add-to-shed` for the Add to Shed button
- `chat-task-action-add-schedule` for the suggested-task button
- `chat-plan-suggestion-card` for PlanSuggestionCard
- `chat-plan-suggestion-create` for the Create this Plan CTA

Existing testids I'll re-use: `plant-doctor-chat-fab`, `chat-plant-context-chip`, `chat-plant-context-clear`, `chat-attach-image-btn`.

## Mock response shapes (new constants in `api-mocks.ts`)

```ts
export const MOCK_PLANT_DOCTOR_AI_TEXT = {
  text: "Tomatoes love full sun and consistent watering — water about 2-3 times per week...",
};

export const MOCK_PLANT_DOCTOR_AI_SUGGESTED_PLANTS = {
  text: "Here are a few options that grow well together:",
  suggested_plants: [
    { name: "Tomato", search_query: "Solanum lycopersicum" },
    { name: "Basil", search_query: "Ocimum basilicum" },
  ],
};

export const MOCK_PLANT_DOCTOR_AI_SUGGESTED_TASKS = {
  text: "Weekly watering and a fortnightly feed should do it.",
  suggested_tasks: [
    {
      title: "Water tomato",
      type: "Watering",
      is_recurring: true,
      frequency_days: 3,
    },
  ],
};

export const MOCK_PLANT_DOCTOR_AI_ADD_TO_SHED = {
  text: "Cucumbers love a sunny spot. I don't see one in your Shed — want to add it?",
  plant_actions: [
    {
      kind: "add_plant_to_shed",
      plant_name: "Cucumber",
      scientific_name: "Cucumis sativus",
    },
  ],
};

export const MOCK_PLANT_DOCTOR_AI_PLAN_SUGGESTION = {
  text: "Looks like you're planning a salad bed. Want to formalise that?",
  plan_suggestion: {
    headline: "Salad bed for summer",
    plan_name: "Summer Salad Bed",
    description: "Tomato + Cucumber + Basil + Lettuce in one shared raised bed.",
    plants_of_interest: ["Tomato", "Cucumber", "Basil", "Lettuce"],
  },
};
```

## Seed strategy

- The chat is per-user. CHAT-010 needs pre-seeded `chat_messages` rows. I'll add them via a small per-test seed helper rather than extending the canonical seed files — the data is test-specific and would clutter the daily test data otherwise.
- All other tests are stateless (mocked edge function returns canned data; no real DB writes beyond the user's own `chat_messages` rows from CHAT-002/003).
- A `tests/e2e/utils/chatSeedReset.ts` helper will clear the user's `chat_messages` rows in `test.beforeEach`, then optionally insert preset rows for CHAT-010.

## Fixture / tier consideration

`PlantDoctorChat` checks `aiEnabled` to render the FAB. The seed bootstrap sets `subscription_tier = 'evergreen'` (PR 1 fix), but `ai_enabled` defaults — let me confirm. If `ai_enabled` is false on the test user, the FAB hides and every CHAT-* test fails on the first step.

If needed, I'll extend `00_bootstrap.sql` to set `ai_enabled = true` (already implicit in the AI freshness seed but worth confirming for the bootstrap user).

## Risks

- **`PlantDoctorChat.tsx` is 810 lines** — extracting the right testids without touching unrelated logic needs care. Edits will be minimal and additive only.
- **Conversation flow timing**: insert-user-message → call-AI → insert-assistant-message has multiple optimistic-UI / async steps. Tests will use `expect.poll` for visibility assertions rather than tight timeouts.
- **Page-context chip (CHAT-009)** depends on setting page context. The FAB lives on `/dashboard` by default — the dashboard sets `pageContext = { page: "dashboard" }`. For the plant-chip variant we may need to navigate to a plant-context page (e.g., open InstanceEditModal). If the chip isn't reachable in the chat default state, I'll downgrade CHAT-009 to a smoke test (chip absent when no plant context).
- **PlanSuggestionCard `priorPlanSuggested` guard (CHAT-008)**: it depends on the conversation history scanning. We test the *render* given a payload; the once-per-thread guard is an edge function concern best tested at the function level.
- **AI tier gating**: if the seed user isn't `ai_enabled = true`, the FAB hides. Will fix that in the seed if so.

## What this does NOT do

- AI ripeness "Check with AI" sheet (deferred per PR 3 plan).
- Voice / TTS (mic button, audio recording, TTS playback) — large surface needing additional mocking; deferred to a focused voice PR.
- Tool-call confirmation cards + destructive tools + undo (R2-099 through R2-105) — needs a separate plan, the chat is supposed to render these as inline cards but the contract is still evolving.
- Quota banners / 429 handling (R2-111 / R2-112).
- Lens identify / diagnose deeper paths (Pl@ntNet match, both-agree chip, none-of-these flow). The existing `plant-doctor.spec.ts` is the baseline; deeper lens coverage belongs to its own PR.
- `chat_feedback` 👍 / 👎 (R2-091 / R2-092) — straightforward to add later; out of scope to keep this PR focused.

## Doc updates

- `docs/e2e-test-plan.md` — append Section 08b "Plant Doctor Chat" with all 10 rows.
- `TESTING.md` — bump inventory (`plant-doctor-chat.spec.ts` (10)).
- The app-reference files for Plant Doctor Chat are already accurate; no updates needed.

## Acceptance criteria

- 10 / 10 new tests green under `--workers=1`.
- `tsc --noEmit` clean.
- Existing `plant-doctor.spec.ts` regression — still green.
- Source `data-testid` additions only on elements the tests target.

---

**Plan ready for approval.** Reply "go ahead" / "looks good" / "yes" to approve, or tell me which tests to drop/swap.
