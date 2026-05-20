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

#### 5. Provide feedback

- 👍 / 👎 per message helps train the system.

#### 6. Clear history

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
- `src/components/PlantActionButtons.tsx` — Add to Shed etc.
- `src/components/TaskActionButtons.tsx` — Add to Schedule
- `supabase/functions/plant-doctor-ai/index.ts` — edge fn
- `supabase/migrations/*_chat_messages.sql` — schema
