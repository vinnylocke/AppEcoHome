# 9. Plant Doctor + Garden AI Chat

**Spec files:** `tests/e2e/specs/plant-doctor.spec.ts` · `tests/e2e/specs/plant-doctor-chat.spec.ts`
**Page Objects:** `tests/e2e/pages/PlantDoctorPage.ts` · `tests/e2e/pages/PlantDoctorChatPage.ts`
**Mock helper:** `mockEdgeFunction()` in `tests/e2e/fixtures/api-mocks.ts` + `MOCK_PLANT_DOCTOR_AI_*` constants
**Per-test reset (chat):** `tests/e2e/utils/chatSeedReset.ts` (uses `SUPABASE_SECRET_KEY` to bypass RLS — no DELETE policy on `chat_messages`)
**Env requirement (chat):** `SUPABASE_SECRET_KEY` in `.env.test` (local-only service-role)
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** [05-tools/](../app-reference/05-tools/)

## Plant Doctor (`/doctor`)

> **Phase 4.4 (design overhaul, 2026-07):** the Plant Lens redesign shipped a camera-first mobile layout (the "Upload or take a photo" heading and the "Upload File" button name are unchanged — they're the e2e contract), a unified neutral treatment for the four AI action buttons (labels / testids / disabled semantics unchanged), and a staged AI-wait overlay (`doctor-wait-overlay`) over the image frame while an action is in flight — its copy deliberately avoids "analyze" / "error" so it can never satisfy DOC-010's toast regex. Four pre-existing drifted tests were fixed in the same pass (DOC-001's PO heading, DOC-009, DOC-012, DOC-013 — see their rows). Suite: 13/13 passing.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DOC-001 | ✅ | Heading renders — PO heading updated to **"Plant Lens"** in Phase 4.4 (was "Plant Doctor"; the Phase 5 naming pass will standardise surface vs nav names) | — | ✅ Passing |
| DOC-002 | ✅ | Upload dropzone visible | — | ✅ Passing |
| DOC-003 | ✅ | Identify/Diagnose hidden before upload | — | ✅ Passing |
| DOC-004 | ✅ | Upload image → action buttons appear | — | ✅ Passing |
| DOC-005 | ✅ | Identify returns AI result | `plant-doctor` identify | ✅ Passing |
| DOC-006 | ✅ | Diagnose returns AI result ("early blight") | `plant-doctor` diagnose | ✅ Passing |
| DOC-007 | ✅ | Clear image button returns dropzone | — | ✅ Passing |
| DOC-008 | ✅ | Save to Journal toggle visible + interactive | `plant-doctor` identify | ✅ Passing |
| DOC-009 | ✅ | AI disabled — Sprint-3 quota reality: `plant-doctor-ai-gate` card renders with an **enabled** `doctor-btn-identify-free` + visible `doctor-upgrade-link`; Diagnose button has count 0 (buttons are replaced by the gate, not disabled) | Supabase profile mock | ✅ Passing |
| DOC-010 | ❌ | Edge function error — message/toast shown | `plant-doctor` 500 | ✅ Passing |
| DOC-011 | ✅ | Nav link → `/doctor` | — | ✅ Passing |
| DOC-012 | ✅ | PlantDoctorChat FAB visible globally on `/dashboard` — targeted via the `plant-doctor-chat-fab` testid (the FAB moved above the mobile tab bar in Phase 4.1; position classes are not a contract) | — | ✅ Passing |
| DOC-013 | ❌ | Upload invalid file type (.txt) → toast "Skipped notes.txt — not an image."; buttons remain hidden | — | ✅ Passing |
| DOC-014 | 🔲 | Multi-ID — `doctor-btn-multi-id` visible (Sage+) → `identify_scene` returns 2 regions → `scene-map-result` overlays + candidate names + confidence % | `plant-doctor` identify_scene | 🔲 Planned |
| DOC-015 | 🔲 | Multi-ID — empty state ("No distinct plants found") | `plant-doctor` identify_scene (empty) | 🔲 Planned |
| DOC-016 | 🔲 | Multi-ID — AI disabled → `doctor-btn-multi-id` disabled | Supabase profile mock | 🔲 Planned |
| DOC-017 | 🔲 | Multi-ID — select + confirm a plant → `scene-map-confirmed-N` shows selected candidate; single `scene` session written, `results.confirmed[regionIndex]` updated in place | `plant-doctor` identify_scene | 🔲 Planned |
| DOC-018 | 🔲 | Multi-ID — `scene-map-info-N-M` shows pills; `scene-map-see-care-N-M` opens PlantDetailModal | `plant-doctor` (identify_scene + resolve) | 🔲 Planned |
| DOC-019 | 🔲 | Multi-ID — `scene-map-check-N` → `scene-map-add-to-shed` → confirmed plant inserted | `plant-doctor` + resolve/save mocks | 🔲 Planned |
| DOC-020 | 🔲 | History — Group ID card from a Multi-ID run, expandable to per-plant rows | — | 🔲 Planned (scene session seed) |
| DOC-021 | 🔲 | Staged wait overlay (Phase 4.4) — `doctor-wait-overlay` mounts over the image frame while an action is processing (blurred photo + stage copy, `aria-live="polite"`), and unmounts once the mocked response settles | `plant-doctor` (delayed mock) | 🔲 Planned |

## Garden AI Chat (regression net)

**Spec file:** `tests/e2e/specs/plant-doctor-chat.spec.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CHAT-001 | ✅ | `plant-doctor-chat-fab` → panel mounts | — | ✅ Passing |
| CHAT-002 | ✅ | Send text + mocked AI reply renders (1 user bubble + 2 assistant — welcome + reply) | `agent-chat` | ✅ Passing |
| CHAT-003 | ✅ | Page reload after send → reply renders exactly once (Wave 22.0023 dedup fix) | `agent-chat` | ✅ Passing |
| CHAT-006 | ✅ | Cucumber-not-in-Shed surfaces `tool-confirm-*` for `add_plant_to_shed` (Wave 22.0023 mandatory rule) | `agent-chat` | ✅ Passing |
| CHAT-009 | ✅ | Page-context chip hidden on dashboard (no plant context) | — | ✅ Passing |
| CHAT-010 | ✅ | Cold open loads pre-seeded turns from `chat_messages` | — | ✅ Passing |
| CHAT-011 | 🔲 | `image-disclaimer` shows beneath a reply that returns `suggested_plants` (web-photo copy) | `agent-chat` (with suggested_plants) | 🔲 Planned |
| CHAT-012 | 🔲 | Auto-read on: opening the chat with a pre-seeded last reply does NOT call `tts-speak`; a newly-sent reply DOES (reducer covered by `chatAutoRead.test.ts`) | `agent-chat` + `tts-speak` spy | 🔲 Planned |
| CHAT-013 | 🔲 | Mocked 503 `{ error: "ai_unavailable" }` from `agent-chat` → `chat-error-message` bubble with the "temporarily unavailable" copy (`data-error-kind="unavailable"`), not the generic tangled-roots copy | `agent-chat` (503) | 🔲 Planned |
| CHAT-014 | 🔲 | Mocked 429 `{ error: "quota_exceeded", message }` → `chat-error-message` bubble shows the server's tier-limit message (`data-error-kind="quota"`) | `agent-chat` (429) | 🔲 Planned |

> **Auto-read logic** is unit-tested in `tests/unit/lib/chatAutoRead.test.ts` (9 cases — primes the existing tail on open so only newly-arrived replies are spoken). **Gallery AI vetting** (`plant-image-search` `vet: true`) filtering is unit-tested in `supabase/tests/plantImageVet.test.ts` (10 cases — threshold + fail-open). **Chat error mapping** (CHAT-013/014's logic) is unit-tested in `tests/unit/lib/chatError.test.ts` (8 cases — `ai_unavailable` / `quota_exceeded` / generic + `FunctionsHttpError.context` body extraction) and `supabase/tests/geminiCascadeError.test.ts` (5 cases — billing / rate_limit / transient cascade classification).
