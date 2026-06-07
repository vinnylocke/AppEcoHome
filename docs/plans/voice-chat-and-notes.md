# Plan — Voice in chat + Notes feature (bundled, ships as 22.0001)

Two substantial features bundled into one major release. Both new — no existing feature regressions expected.

---

## Feature A — Voice in chat (Garden AI)

### Ask

User wants three things on the floating Garden AI chat:
1. A mic button — tap to talk, audio sent to the AI, text response back.
2. A toggle in settings: "auto-read AI replies aloud" (default off).
3. A speaker icon on every assistant message — tap to play back as audio.

### Engine choice (locked in)

- **STT**: Gemini multimodal. Audio is sent as `inlineData` with `mimeType: "audio/webm"` (or `audio/mp4` on iOS) in the same message that hits `agent-chat`. Gemini transcribes + reasons in one call. This is the cleanest path because the chat already runs through Gemini and the wrapper at [`_shared/gemini.ts:41`](../../supabase/functions/_shared/gemini.ts#L41) already takes `inlineData`. No new vendor.
- **TTS**: Google Cloud Text-to-Speech via a new edge function `tts-speak`. Uses a `GOOGLE_CLOUD_API_KEY` env var (same Google account, separate product). Chirp3 HD voice for natural quality. Cost: ~$0.002 per ~500-char reply.
- **Fallback**: when Gemini audio input or Google TTS fails, fall back to:
  - **STT**: Web Speech API on PWA + `@capacitor-community/speech-recognition` on native.
  - **TTS**: `window.speechSynthesis` on PWA + `@capacitor-community/text-to-speech` on native.
- **iOS PWA caveat**: iOS Safari requires PWA install + user gesture to record audio. Capture this in a one-line guidance toast on first denial.

### Component changes

```
PlantDoctorChat (existing)
├── Input bar
│   ├── Camera button
│   ├── Library button
│   ├── 🎤 Mic button (NEW)
│   │   ├── Idle    — tap to start
│   │   ├── Recording — pulse + waveform; tap or 30s auto-stop
│   │   └── Sending — spinner; AI is processing
│   ├── Text input
│   └── Send button
└── Message bubble (assistant only)
    └── 🔊 Read aloud button (NEW) — tap to play; tap again to stop
```

New files:
- `src/components/chat/MicButton.tsx` — recording UI + state machine
- `src/components/chat/ReadAloudButton.tsx` — speaker icon per message
- `src/hooks/useVoiceCapture.ts` — wraps `MediaRecorder` + Capacitor STT fallback; emits `{ base64, mimeType }`
- `src/hooks/useTextToSpeech.ts` — wraps the new `tts-speak` edge fn + browser fallback; manages playback state
- `supabase/functions/tts-speak/index.ts` — Google Cloud TTS proxy; cached by `(text_hash, voice)` in a new `tts_cache` table to keep repeated playback free

### Backend changes

- **`supabase/functions/agent-chat/index.ts`** — accept optional `audio: { base64, mimeType }` in the request body. When present, attach as a Gemini `inlineData` part on the user turn. No changes to history, tool calling, etc. Existing text path untouched.
- **NEW edge function `tts-speak`** — Google Cloud TTS REST proxy. Body: `{ text, voice?: "en-GB-Chirp3-HD-Achernar" }`. Returns: `{ audio_base64, mimeType: "audio/mp3", cache_hit: boolean }`. Uses a small `tts_cache` table keyed by `(SHA256(text), voice)` so re-playing a message is free.
- **NEW migration `tts_cache`** — `id uuid pk, text_hash text not null, voice text not null, audio_url text not null, generated_at timestamptz, last_used_at timestamptz, unique(text_hash, voice)`. Audio stored in a new public `tts-audio` storage bucket.

### Settings change

Add `voice_settings jsonb` to `user_profiles`:

```ts
{
  auto_read_assistant_replies: false,   // toggle in Notifications/Voice tab
  preferred_voice: "en-GB-Chirp3-HD-Achernar",  // overrides default in TTS calls
}
```

New section in `GardenerProfile`'s Notifications tab: "Voice" with the auto-read toggle. The voice picker is deferred (default voice only for v1).

### Tier gating

- **Mic / talk-to-Gemini**: already AI-gated (chat itself requires AI).
- **Auto-read + Read-aloud button**: free for all AI-tier users. Reasoning: TTS is cheap (~$0.002 per reply) and is the natural pair to the mic. Cached aggressively so most plays cost $0.
- The "Voice" settings section only renders for AI-tier users.

### Files modified — Voice

| File | Change |
|------|--------|
| [`src/components/PlantDoctorChat.tsx`](../../src/components/PlantDoctorChat.tsx) | Mount `<MicButton>` + per-message `<ReadAloudButton>`; auto-read effect when setting enabled |
| `src/components/chat/MicButton.tsx` | **NEW** |
| `src/components/chat/ReadAloudButton.tsx` | **NEW** |
| `src/hooks/useVoiceCapture.ts` | **NEW** |
| `src/hooks/useTextToSpeech.ts` | **NEW** |
| [`src/components/GardenerProfile.tsx`](../../src/components/GardenerProfile.tsx) | Add "Voice" section in Notifications tab |
| [`supabase/functions/agent-chat/index.ts`](../../supabase/functions/agent-chat/index.ts) | Accept optional `audio` body field; pass as `inlineData` to Gemini |
| `supabase/functions/tts-speak/index.ts` | **NEW** |
| `supabase/migrations/<ts>_tts_cache.sql` | **NEW** — `tts_cache` table + `tts-audio` storage bucket |
| `supabase/migrations/<ts>_user_voice_settings.sql` | **NEW** — `user_profiles.voice_settings jsonb` |

---

## Feature B — Notes

### Ask

> "Similar to journals but notes — an area where you can jot down notes, attach images, maybe have tables, lists, etc. You can then link these to areas, locations, plans, plant instances, plants, seeds, ailments, etc."

### Data model (many-to-many linking)

```sql
CREATE TABLE notes (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references homes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete set null,
  title       text,
  -- TipTap document JSON. Editor renders directly from this.
  content     jsonb not null default '{}'::jsonb,
  -- Plain-text projection of `content` for search (kept in sync via a
  -- trigger or app-side write). Used by the future full-text index.
  body_text   text,
  -- First image extracted from `content` (used as the list-thumbnail).
  cover_image_url text,
  pinned      boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE TABLE note_links (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references notes(id) on delete cascade,
  target_type text not null check (target_type in (
    'plant_instance', 'plant', 'location', 'area', 'plan',
    'ailment', 'seed_packet'
  )),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (note_id, target_type, target_id)
);

-- Lookup index: "what notes are linked to this plant?"
CREATE INDEX note_links_target_idx ON note_links (target_type, target_id);

-- RLS: notes scoped by home_id; note_links inherit via JOIN
-- + GRANTs for the post-2026-10-30 Data API requirement.
```

`note_attachments` table is **not** introduced — TipTap stores image URLs inside the document JSON (uploaded to the existing `plant-images` storage bucket with `pathPrefix: "notes/{homeId}"`). One less table, one less index, the cover-image extraction handles list views.

### UI surface

```
/notes (new route)
├── NotesPage
│   ├── Header (title + "+ New note" + search)
│   ├── Filter chip strip — Pinned | All | By target type (Plant / Location / Area / Plan / Ailment / Seed)
│   ├── NotesGrid (responsive — 1 col mobile, 2 desktop, 3 wide)
│   │   └── NoteCard ×n
│   │       ├── Cover image
│   │       ├── Title + 2-line snippet
│   │       ├── Link chips (target chip per linked entity, max 3 visible + "+N")
│   │       └── Updated-at, pin/archive buttons
│   └── Empty state ("Your first note…")
└── NoteEditorOverlay (Portal modal)
    ├── Title input
    ├── TipTap editor (toolbar: Bold/Italic/Heading/List/Checklist/Table/Image/Link)
    ├── LinkTargetsPanel — chip strip + "+ Link to…" picker (reuses the journal's TargetPicker pattern, multi-select)
    └── Footer (Pin / Archive / Save)

Drawer on entity pages (PlantInstance modal, LocationPage, AreaDetails, PlannerDashboard, AilmentWatchlist row):
└── "Notes" section showing linked NoteCards, each tap opens the editor overlay.
```

### Editor — TipTap

```ts
const editor = useEditor({
  extensions: [
    StarterKit,            // headings, lists, bold/italic, paragraph, blockquote
    TaskList, TaskItem,    // checkboxes
    Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    Image.configure({ inline: false, allowBase64: false }),
    Link.configure({ openOnClick: true }),
    Placeholder.configure({ placeholder: "Start writing…" }),
  ],
  content: note.content,
  onUpdate: ({ editor }) => {
    setContent(editor.getJSON());
    setBodyText(editor.getText());     // projection for search
    setCoverImageUrl(firstImageInDoc(editor.getJSON())); // helper
  },
});
```

- Image upload: Tap "image" button → opens existing PhotoUploader → returns Supabase URL → inserts an `<image src={url}>` node. Uses the existing `plant-images` bucket so no new storage policy work.
- Toolbar is sticky on mobile.
- Add ~120kB gzipped. Lazy-loaded so non-notes routes don't pay.

### Linking flow

Reuses the existing `TargetPicker` pattern from the Journal (`src/components/journal/TargetPicker.tsx`) but adapted for multi-select. The picker shows the same categories as the Journal plus **Ailments**, **Seed packets**, and **Plants (catalogue)** (three new sources). Each linked target inserts a row into `note_links`.

### Entity-side drawer

Every supported entity page gets a "Notes" section that issues:

```ts
supabase
  .from("note_links")
  .select("note_id, notes!inner(id, title, cover_image_url, updated_at)")
  .eq("target_type", "plant_instance")
  .eq("target_id", plantInstanceId)
  .order("notes.updated_at", { ascending: false })
  .limit(20);
```

Tap a note → opens `NoteEditorOverlay`. "+ New note here" prefills `note_links` with the current entity.

### Tier gating

- **Free for everyone.** Notes is a productivity feature; no AI cost on the base flow.
- **Sage+ extra**: "Summarise note" + "Tag suggestions" buttons in the editor toolbar (deferred to a follow-up; mentioned here so the future architecture isn't surprising).

### Files modified — Notes

| File | Change |
|------|--------|
| `src/components/notes/NotesPage.tsx` | **NEW** — route component |
| `src/components/notes/NoteCard.tsx` | **NEW** |
| `src/components/notes/NoteEditorOverlay.tsx` | **NEW** |
| `src/components/notes/NoteTipTapEditor.tsx` | **NEW** — wraps TipTap with our toolbar + image upload |
| `src/components/notes/LinkTargetsPanel.tsx` | **NEW** — multi-select target picker |
| `src/components/notes/NotesDrawer.tsx` | **NEW** — embeddable "Notes" section for entity pages |
| `src/hooks/useNotes.ts` | **NEW** — list/create/update/delete |
| `src/hooks/useNoteLinks.ts` | **NEW** — link query by `(target_type, target_id)` |
| [`src/App.tsx`](../../src/App.tsx) | New `<Route path="/notes">`; add nav item |
| [`src/components/PlantDetailModal.tsx`](../../src/components/PlantDetailModal.tsx) | Mount `<NotesDrawer>` in the modal body |
| [`src/components/InstanceEditModal.tsx`](../../src/components/InstanceEditModal.tsx) | Mount `<NotesDrawer>` |
| [`src/components/AreaDetails.tsx`](../../src/components/AreaDetails.tsx) | Mount `<NotesDrawer>` |
| [`src/components/Location*.tsx`](../../src/components/) | Mount `<NotesDrawer>` on the per-location drill-in |
| [`src/components/PlannerDashboard.tsx`](../../src/components/PlannerDashboard.tsx) | Mount `<NotesDrawer>` on the plan detail surface |
| [`src/components/AilmentWatchlist.tsx`](../../src/components/AilmentWatchlist.tsx) | Mount `<NotesDrawer>` per ailment row |
| `src/lib/quickLauncherCatalogue.ts` | Add `notes` catalogue entry (opt-in for Quick Launcher pinning) |
| `supabase/migrations/<ts>_notes.sql` | **NEW** — `notes` + `note_links` tables + RLS + GRANTs |
| `package.json` | Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-table*`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-placeholder` |

---

## App-reference files consulted

- [`docs/app-reference/05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md) — Garden AI chat structure + edge function call shape
- [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) — Gemini wrapper supports `inlineData` (audio is same shape as image)
- [`docs/app-reference/03-garden-hub/11-global-journal.md`](../app-reference/03-garden-hub/11-global-journal.md) — Journal architecture; Notes adapts the TargetPicker + the entry-card list pattern
- [`docs/app-reference/99-cross-cutting/07-data-model-media.md`](../app-reference/99-cross-cutting/07-data-model-media.md) — `plant-images` storage bucket conventions
- [`docs/app-reference/99-cross-cutting/03-data-model-plants.md`](../app-reference/99-cross-cutting/03-data-model-plants.md), [`04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md), [`05-data-model-plans.md`](../app-reference/99-cross-cutting/05-data-model-plans.md), [`06-data-model-ailments.md`](../app-reference/99-cross-cutting/06-data-model-ailments.md), [`33-data-model-nursery.md`](../app-reference/99-cross-cutting/33-data-model-nursery.md) — confirm the linkable entity types and their PK shapes (all uuid except `plants.id` which is integer; the `note_links.target_id` column is therefore `text` not `uuid` so it can hold either)

> Note: `note_links.target_id` is **text**, not uuid, because `plants.id` is an integer in this schema. Casting on read is cheap and avoids needing two separate FK columns.

---

## App-reference docs to update post-implement

| File | Update |
|------|--------|
| [`docs/app-reference/05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md) | Mic + Read-aloud in the component graph; new `audio` body field on the agent-chat contract |
| [`docs/app-reference/06-account/02-notifications-tab.md`](../app-reference/06-account/02-notifications-tab.md) | New "Voice" section + the `voice_settings` JSON shape |
| [`docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) | New `tts-speak` row |
| [`docs/app-reference/99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) | Note that audio input is supported via `inlineData` |
| **NEW** `docs/app-reference/03-garden-hub/14-notes.md` | Full Role 1 + Role 2 for the Notes surface |
| **NEW** `docs/app-reference/99-cross-cutting/41-data-model-notes.md` | Notes schema, link semantics, drawer pattern |
| [`docs/app-reference/00-INDEX.md`](../app-reference/00-INDEX.md) | Add the two new entries |

---

## Tests

- **Vitest unit**
  - `tests/unit/lib/firstImageInDoc.test.ts` — pure helper that walks TipTap JSON to extract the cover image
  - `tests/unit/hooks/useVoiceCapture.test.ts` — recorder state machine (idle → recording → stopped) using a mocked `MediaRecorder`
- **Deno**
  - `supabase/tests/tts-speak.test.ts` — cache hit / miss / Google API error fallback
  - `supabase/tests/agent-chat-audio.test.ts` — body parsing carries `audio` into the Gemini `inlineData` part
- **Playwright E2E**
  - "Notes — create + link + filter" in `tests/e2e/specs/notes.spec.ts`
  - "Garden AI — mic button records and sends" (will mock the audio path because real STT in CI is flaky)
  - Add rows to `docs/e2e-test-plan.md` for both

---

## Deploy

- **Migrations** (3): `notes` + `note_links`, `tts_cache` + storage bucket, `user_profiles.voice_settings`. All applied locally first; `supabase db push` on user confirmation.
- **Edge functions** (2): `agent-chat` (modified — accept `audio`), `tts-speak` (new). Deploy via `--use-api --yes`.
- **Vercel**: full frontend deploy.
- **Major bump → Rhozly OS 22.0001** (`--bump-major`). Two genuine new surfaces and a new persistence model — warrants a major.

---

## Risks

| Risk | Mitigation |
|------|------------|
| iOS PWA mic permission flow is fussy | One-time guidance toast on first denial. Native (Capacitor) build sidesteps the permission UX. |
| Gemini audio increases token cost noticeably | Audio counts against the existing AI quota; surface usage in the audit page like every other AI call. |
| TipTap bundle size (~120kB gz) | Lazy-loaded — only `/notes` route + entity drawers ship the import. Non-notes routes pay nothing. |
| Notes-drawer N+1 query on entity pages | `useNoteLinks` issues ONE query per page with an `IN` filter; no per-row fetch. |
| Migration 30 October 2026 Data API grant requirement | Both new tables include explicit `GRANT` statements per CLAUDE.md convention. |
| Backwards compatibility on `agent-chat` | New `audio` field is optional; existing text-only callers unaffected. |
| Voice settings table not seeded for existing users | Migration adds the column with `DEFAULT '{}'::jsonb`; client treats missing as "auto_read = false". |
| `note_links.target_id text` lookups | The composite `(target_type, target_id)` index keeps drawer queries cheap. No JOINs to non-existent tables for `plants` (integer PK) — cast on read. |

---

## Implementation phasing

Given the size, I'll work in two waves but ship them as one Vercel + Supabase deploy:

**Wave 22.0001-A — Voice in chat** (~1.5 days)
1. Schema migrations (voice_settings, tts_cache, tts-audio bucket)
2. `tts-speak` edge fn + Deno tests
3. `agent-chat` audio passthrough
4. Frontend hooks + components
5. Settings UI

**Wave 22.0001-B — Notes** (~3-4 days)
1. Schema migrations (`notes` + `note_links` + grants)
2. TipTap install + base editor
3. `NotesPage` + list + create flow
4. Linking picker + drawer
5. Wire drawer into each entity page
6. Search + filter

Both waves merge to main as they complete; deploy fires when both are green and all tests pass.

---

## Out of scope (deferred)

- Note version history
- Real-time collaborative editing
- AI-summarise / tag-suggest (mentioned in tier-gating as Sage+ follow-up)
- TTS voice picker UI (default voice only for v1; jsonb field is ready for it)
- Two-way "link from note" deep-link affordances (entity drawer → note is enough for v1)
- Whisper / hosted STT fallback — only the browser + Capacitor fallback is built; we can add a Whisper path later if accuracy is an issue
