# Plant Doctor Chat — branded "Garden AI"

> A sticky AI chat overlay accessible from anywhere in the app. Carries page context (current screen, current plant, current task) into every message so the AI knows what you were doing when you asked.

> **Naming note:** The component file is `PlantDoctorChat.tsx` (code-level — the chat shares plumbing with the Plant Doctor surface). The user-facing brand for this floating overlay is **Garden AI**. Distinct from the **Plant Doctor** photo surface at `/doctor` — see [`02-plant-doctor.md`](./02-plant-doctor.md). Don't reuse "Garden AI" as a label for anything else.

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
│   ├── Suggested Plants → ChatPlantCard (Wikipedia info; multi-photo ChatPlantGallery when `show`)
│   ├── Suggested Tasks → TaskActionButtons
│   ├── PlantActionButtons (e.g. "Add to Shed")
│   ├── PlanSuggestionCard (proactive "Make a Plan" CTA — at most once per thread)
│   ├── ReadAloudButton (🔊 per assistant message — tap to play / stop; uses tts-speak)
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

```ts
// Auto-read preference. NOTE: user_profiles is keyed on `uid` — filtering on
// `id`/`user_id` matches zero rows and the read silently resolves to "off".
supabase.from("user_profiles")
  .select("voice_settings")
  .eq("uid", userId)
  .maybeSingle();
```

When `voice_settings.auto_read_assistant_replies` is `true`, an effect speaks each assistant reply that arrives **while the chat is open** via `useTextToSpeech` (→ `tts-speak` edge function). The decision lives in the pure `src/lib/chatAutoRead.ts` reducer, which *primes* the message already at the bottom as already-heard on open / history (re)load — so opening the chat never re-reads the previous reply; only genuinely new turns are spoken. Independently, every assistant message carries a `ReadAloudButton` for on-demand playback. Both paths honour the user's `voice_settings.preferred_voice` (curated list in `src/constants/voices.ts`; defaults to `en-GB-Chirp3-HD-Achernar`), **re-read each time the chat opens** (the overlay is mounted once, so re-reading on open is what makes a voice/auto-read change in settings apply without an app reload). The toggle + voice picker that set these live in **Gardener's Profile → Alerts → Voice** (`/gardener?tab=notifications`).

> **Native APK requirements:** tap-to-talk needs `RECORD_AUDIO` in the Android manifest; read-aloud needs `MainActivity` to set `setMediaPlaybackRequiresUserGesture(false)` (the WebView default blocks both auto-read and the post-`await` `audio.play()`). **Read-aloud fallback chain:** cloud Chirp3-HD → on any failure the `@capacitor-community/text-to-speech` native device voice (works in the WebView) → raw `speechSynthesis` only if the plugin is absent. The Web Speech API alone is silent in the Android System WebView, hence the native plugin. All baked into the APK (rebuild required); the PWA is unaffected. See [Capacitor](../99-cross-cutting/23-capacitor.md).

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
| `agent-chat` | Primary text chat — Gemini function-calling loop (read tools auto-run, mutations confirmed). Returns `{ reply, toolResults, pendingToolCalls, suggested_plants, quota }`. **Display-only tools (e.g. `show_plant_images`) are filtered out of `toolResults`** — they surface via `suggested_plants` instead, so they never render as a `ToolResultCard` JSON dump. |
| `plant-doctor-ai` | Gemini chat with **vision** (when an image is attached) |
| `plant-image-search` | Multi-photo gallery — returns up to 9 licensed images (Unsplash / Pixabay / Wikipedia, with attribution) for a `show` plant card. Cached in `plant_image_cache`. |
| `tts-speak` | Text-to-speech for read-aloud (auto-read effect + per-message `ReadAloudButton`). Returns cached audio from `tts_cache` / `tts-audio` bucket when available, otherwise synthesises via Google Cloud TTS. |

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

When the AI returns `suggested_plants: [{ name, search_query, show? }]`, each renders as a card calling `getPlantWikiInfo(search_query)` for a thumbnail + extract. Tap to expand.

When an item has **`show: true`** (set server-side by the `show_plant_images` tool — i.e. the user asked to *see* what a plant looks like), the card renders **`ChatPlantGallery`** instead of the compact thumbnail: an inline horizontal strip of up to 9 licensed photos from `plant-image-search` (requested with **`vet: true`**, so each photo is AI-scored for relevance and low-confidence ones are dropped — see [Image Sources](../99-cross-cutting/24-image-sources.md)), each with an `ImageCredit` badge and tappable to open the shared `Lightbox`. If everything is filtered out it shows "No clear photos found".

**Image disclaimer:** any reply that renders plant photos shows one `ImageDisclaimer` beneath the cards, with chat-specific copy noting the photos come from the web (Wikipedia / Unsplash / Pixabay) and may not match the exact plant — distinct from the plant-search copy that cites our verified plant databases. Falls back to the single Wikipedia thumbnail if no images are returned. Plants without `show` (ordinary "you might like…" suggestions) keep the compact thumbnail. The `PlantActionButtons` (Add to Shed) still render below either way.

**Photo relevance:** the gallery query is built by `src/lib/plantPhotoQuery.ts`, which biases toward the *growing plant* (not its produce/seeds) by appending `" plant"` to a bare name — e.g. "runner bean" → "runner bean plant" — unless the phrase is already botanical. The `show_plant_images` tool also asks Gemini to supply a `search_query` using the botanical/specific name plus "plant" (e.g. "Phaseolus coccineus plant"). Wikipedia is always fetched first (canonical reference shot).

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

- Chat overlay is hidden entirely on non-AI tiers (client gate — the `<PlantDoctorChat>` mount in `src/App.tsx`, RHO-10).
- **Not mounted on `/walk`** (RHO-17) — the Garden Walk is a focus experience, and the bottom-right FAB overlapped the walk cards' skip control on desktop. The same App.tsx mount gate checks `routerLocation.pathname`.
- **Server-side re-verification:** `agent-chat` now re-checks `ai_enabled` via `guardAiByUser` on **every** action — including tool confirm / cancel / undo — returning 403 "AI tier required" otherwise. This makes the App.tsx gate comment ("the server re-verifies") actually true; previously the client mount gate was the only enforcement.

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

> **Knowledge grounding (never refuses for lack of data):** the `agent-chat` system prompt (`supabase/functions/agent-chat/rules.ts`, `AGENT_RULES`) requires the assistant to answer general horticultural questions — harvest timing, ripeness, pruning, spacing — from its own expertise **even when the plant isn't in the user's Shed or the plant catalogue**. A named plant that's absent from the Shed triggers only an *additive* "want me to add it?" offer, never a refusal; a `search_plant_database` result of 0 means "no catalogue entry to add", not "unknown plant". This is what stops the chat replying "I can't find any information about X in my database" while the image path (`plant-doctor-ai`) answers freely (regression guarded by `supabase/tests/agentChatRules.test.ts`).

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

#### 8. Listen to replies (voice)

- Tap the 🔊 speaker on any assistant message to hear it read aloud; tap again to stop.
- To have **every** reply spoken automatically as it lands, turn on **Read AI replies aloud** in Gardener's Profile → Alerts → Voice. The preference syncs to your account, so it applies on every device.

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
- `src/components/chat/ReadAloudButton.tsx` — per-message read-aloud control
- `src/lib/chatAutoRead.ts` — pure auto-read decision (primes the existing tail on open so only new replies are spoken)
- `src/hooks/useTextToSpeech.ts` — TTS playback hook (calls `tts-speak`)
- `src/components/ImageDisclaimer.tsx` — illustrative-image note (accepts custom `text`)
- `supabase/functions/tts-speak/index.ts` — TTS edge fn (Google Cloud TTS + `tts_cache`)
- `supabase/functions/plant-doctor-ai/index.ts` — edge fn
- `supabase/functions/plant-image-search/index.ts` + `supabase/functions/_shared/plantImageVet.ts` — gallery photo search + AI relevance vetting (`vet: true`)
- `supabase/migrations/20260427000000_chat_history.sql` — base schema
- `supabase/migrations/20260624000200_chat_plan_suggestion.sql` — plan_suggestion column
