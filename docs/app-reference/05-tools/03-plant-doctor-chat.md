# Plant Doctor Chat

> A sticky AI chat overlay accessible from anywhere in the app. Carries page context (current screen, current plant, current task) into every message so the AI knows what you were doing when you asked.

**Trigger:** Floating Bot button (always-on in the corner) when AI tier active.
**Source files:**
- `src/components/PlantDoctorChat.tsx` (~810 lines)
- `src/context/PlantDoctorContext.tsx` — page context + open/close state

---

## Quick Summary

A chat panel that slides up from the bottom. Messages persist in `chat_messages` per user. Each turn includes the user's page context (e.g. "viewing Plant Doctor with image", "on Light Sensor at area X with lux Y", "on Dashboard"), so answers can reference what you're looking at. Supports image attachments (camera or library), suggested plants as inline cards with Wikipedia info, suggested tasks as add-to-blueprint buttons, and feedback (👍/👎).

---

## Role 1 — Technical Reference

### Component graph

```
PlantDoctorChat (Portal / fixed-position)
├── Header (close, clear conversation)
├── Message list
│   ├── Message bubble (user / assistant)
│   ├── Image preview (if attached)
│   ├── Suggested Plants → ChatPlantCard (Wikipedia info)
│   ├── Suggested Tasks → TaskActionButtons
│   ├── PlantActionButtons (e.g. "Add to Shed")
│   ├── PlanSuggestionCard (proactive "Make a Plan" CTA — at most once per thread)
│   └── Feedback buttons (👍 / 👎)
├── Pending image preview (before send)
├── Input bar
│   ├── Camera button (Capacitor or web)
│   ├── Library button
│   ├── Text input
│   └── Send button
└── Loading dots / regenerate button
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |

Plus reads from `usePlantDoctor()` context:
- `isOpen`, `setIsOpen`
- `pageContext` — populated by every page that sets it on mount

### Local state

| State | Purpose |
|-------|---------|
| `messages` | Full conversation history |
| `input` | Text composer |
| `isLoading` | AI response pending |
| `isLoadingHistory` | Initial fetch |
| `userId` | For chat_messages scoping |
| `feedback` | 👍 / 👎 per message |
| `pendingImage` | Image attached but not yet sent (base64 + preview) |

### Data flow — read paths

```ts
supabase.from("chat_messages")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: true });
```

### Data flow — write paths

#### Each turn
1. Insert user message into `chat_messages`.
2. Call edge function `plant-doctor-ai` with `{ history, message, image, pageContext, homeId }`.
3. Receive assistant message; insert into `chat_messages`.

#### Clear conversation
- `supabase.from("chat_messages").delete().eq("user_id", userId)`.

#### Feedback
- `chat_messages.update({ feedback })` or a separate `chat_feedback` table (implementation detail).

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `plant-doctor-ai` | Gemini chat with vision + tool calls |

### Page context (`PlantDoctorContext`)

Each page calls `setPageContext({ page, ...meta })` on mount. Examples:

| Page | Meta |
|------|------|
| Dashboard | `{ page: "dashboard" }` |
| Plant Doctor | `{ page: "plant-doctor", currentTask, image, plantName }` |
| Light Sensor | `{ page: "lightsensor", luxReading, area }` |
| Instance Edit Modal | `{ page: "instance-edit", inventoryItemId, plantName }` |

The AI uses this to ground its answer: "you're currently on the Light Sensor at the South Bed, reading 12,500 lx".

### Suggested plants → `ChatPlantCard`

When the AI returns `suggested_plants: [{ name, search_query }]`, each renders as a card calling `getPlantWikiInfo(search_query)` for a thumbnail + extract. Tap to expand.

### Suggested tasks → `TaskActionButtons`

When the AI returns `suggested_tasks: [...]`, each row gets an "Add to Schedule" button that pre-fills `AddTaskModal`.

### Plan suggestions → `PlanSuggestionCard`

When the AI detects the user is researching a multi-plant project (2+ distinct plants + a coherent theme), it can return `plan_suggestion: { headline, plan_name, description, plants_of_interest }`. The card renders with **Create this Plan** (writes the name + description to `sessionStorage` via `plannerPrefill.ts`, closes the chat, navigates to `/planner?open=new-plan` — the dashboard consumes the prefill and pre-populates `NewPlanForm`) and **Not now** (dismiss locally).

**Two-mode prompt rule:**

- **Soft probe (text only)** — when a trend is forming but no clear theme yet, the AI is told to ask conversationally inside the normal `text` reply ("Are you working on a particular project?"). No card emitted.
- **Hard CTA (`plan_suggestion`)** — only when 2+ plants AND a coherent theme are present AND no prior assistant turn already emitted one in this thread.

**Once-per-thread guard:** the client scans the loaded message history for any prior assistant message with a non-null `plan_suggestion` and passes `priorPlanSuggested: true` in the request body so the model knows to suppress further suggestions.

**Defensive server-side validation:** the edge function discards the model's `plan_suggestion` if the shape is incomplete (missing `headline` / `plan_name` / `description`) or if `plan_name` exceeds 80 chars.

### Realtime channels

None — chat is single-user (per-device polling via fetch on send).

### Cron / scheduled jobs

None.

### Tier gating

- Chat overlay is hidden entirely on non-AI tiers.

### Beta gating

None.

### Permissions

- None — chat is per-user, not shared.

### Error states

| State | Result |
|-------|--------|
| AI call fails | Inline retry button on the failed message |
| Image too large | Service compresses before send |
| No connectivity | Toast; pending message can be resent |

### Performance

- Chat lazy-renders only when `isOpen === true`.
- Messages stream into UI as they arrive (no big block on AI response).
- Wikipedia info cached per `search_query` for the session.

### Linked storage buckets

- `chat-uploads` — attached images.

---

## Role 2 — Expert Gardener's Guide

### Why use the chat

Sometimes you have a question that doesn't fit a screen — "Why are my carrots forking?" "Should I prune this lavender now?" "Can I plant garlic in May?" The chat is the catch-all for those.

It's also context-aware. Open it from the Light Sensor with a reading of 800 lx and ask "is this enough for my chillies?" — the AI knows what reading you're looking at without you typing it.

### Every flow on this overlay

#### 1. Open / close

- Floating button (bottom-right by default) → slides up.

#### 2. Ask a question

- Type and send.
- Optionally attach a photo (camera or library).

#### 3. Receive suggested plants

- AI might respond with cards for plant suggestions. Tap a card to expand its Wikipedia extract.
- "Add to Shed" button per card.

#### 4. Receive suggested tasks

- AI might propose tasks ("Water every 3 days").
- "Add to Schedule" pre-fills `AddTaskModal`.

#### 5. Receive a Plan suggestion

- After asking about a few different plants in a row, the AI may notice a project taking shape ("sounds like you're planning a sunny veg patch") and offer to start a Plan.
- The card shows the suggested plan name + plants you mentioned + two buttons.
- **Create this Plan** opens the Planner with the New Plan form already filled in with the name + description. Edit freely before saving.
- **Not now** dismisses the card; the conversation continues.
- The chat won't pester you — only one suggestion per thread.

#### 6. Provide feedback

- 👍 / 👎 per message helps train the system.

#### 7. Clear history

- Trash icon in header. Wipes all `chat_messages` for your user. Cannot be undone.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| User bubble | Your message |
| Assistant bubble | AI response |
| Attached image | Photo you sent |
| Plant card | AI-suggested plant + Wikipedia |
| Task suggestion | "Add to schedule" |
| Feedback | 👍 / 👎 |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Chat overlay hidden entirely. |
| Sage / Evergreen | Full chat with quota. |

### Common mistakes / pitfalls

- **Asking without context.** Open the chat from the right screen — Light Sensor questions are sharper if asked from the Light Sensor.
- **Treating it as authoritative.** Like all LLMs, occasionally wrong. Cross-check critical advice with a guide or external source.
- **Clearing history thinking it resets quota.** It doesn't — quota is account-level.

### Recommended workflows

- **Quick lookup:** open, type, get an answer, move on.
- **Photo-driven diagnosis:** attach photo, describe the symptom — the AI works best with image + words.
- **Multi-turn refinement:** if the first answer is generic, ask "go deeper on X" — the AI remembers context.

### What to do if something looks wrong

- **AI says it can't help:** quota may be exhausted — check Account → AI usage.
- **History didn't load:** connectivity. Retry on next open.
- **Suggested-plant card has no Wikipedia info:** the plant name didn't match a Wikipedia entry. AI still answers correctly.

---

## Related reference files

- [Plant Doctor](./02-plant-doctor.md)
- [Plant Doctor History](./04-plant-doctor-history.md)
- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/PlantDoctorChat.tsx` — chat UI
- `src/context/PlantDoctorContext.tsx` — open/close + page context
- `src/lib/wikipedia.ts` — `getPlantWikiInfo`
- `src/lib/plannerPrefill.ts` — sessionStorage handoff for the Plan CTA
- `src/components/PlantActionButtons.tsx` — Add to Shed etc.
- `src/components/TaskActionButtons.tsx` — Add to Schedule
- `src/components/chat/PlanSuggestionCard.tsx` — Plan CTA card
- `supabase/functions/plant-doctor-ai/index.ts` — edge fn
- `supabase/migrations/20260427000000_chat_history.sql` — base schema
- `supabase/migrations/20260624000200_chat_plan_suggestion.sql` — plan_suggestion column
