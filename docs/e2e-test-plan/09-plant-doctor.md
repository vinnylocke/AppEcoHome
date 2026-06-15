# 9. Plant Doctor + Garden AI Chat

**Spec files:** `tests/e2e/specs/plant-doctor.spec.ts` · `tests/e2e/specs/plant-doctor-chat.spec.ts`
**Page Objects:** `tests/e2e/pages/PlantDoctorPage.ts` · `tests/e2e/pages/PlantDoctorChatPage.ts`
**Mock helper:** `mockEdgeFunction()` in `tests/e2e/fixtures/api-mocks.ts` + `MOCK_PLANT_DOCTOR_AI_*` constants
**Per-test reset (chat):** `tests/e2e/utils/chatSeedReset.ts` (uses `SUPABASE_SECRET_KEY` to bypass RLS — no DELETE policy on `chat_messages`)
**Env requirement (chat):** `SUPABASE_SECRET_KEY` in `.env.test` (local-only service-role)
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** [05-tools/](../app-reference/05-tools/)

## Plant Doctor (`/doctor`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| DOC-001 | ✅ | Heading renders | — | ✅ Passing |
| DOC-002 | ✅ | Upload dropzone visible | — | ✅ Passing |
| DOC-003 | ✅ | Identify/Diagnose hidden before upload | — | ✅ Passing |
| DOC-004 | ✅ | Upload image → action buttons appear | — | ✅ Passing |
| DOC-005 | ✅ | Identify returns AI result | `plant-doctor` identify | ✅ Passing |
| DOC-006 | ✅ | Diagnose returns AI result ("early blight") | `plant-doctor` diagnose | ✅ Passing |
| DOC-007 | ✅ | Clear image button returns dropzone | — | ✅ Passing |
| DOC-008 | ✅ | Save to Journal toggle visible + interactive | `plant-doctor` identify | ✅ Passing |
| DOC-009 | ✅ | AI disabled — Identify/Diagnose buttons disabled | Supabase profile mock | ✅ Passing |
| DOC-010 | ❌ | Edge function error — message/toast shown | `plant-doctor` 500 | ✅ Passing |
| DOC-011 | ✅ | Nav link → `/doctor` | — | ✅ Passing |
| DOC-012 | ✅ | PlantDoctorChat FAB visible globally on `/dashboard` | — | ✅ Passing |
| DOC-013 | ❌ | Upload invalid file type (.txt) → error, buttons remain hidden | — | ✅ Passing |
| DOC-014 | 🔲 | Multi-ID — `doctor-btn-multi-id` visible (Sage+) → `identify_scene` returns 2 regions → `scene-map-result` overlays + candidate names + confidence % | `plant-doctor` identify_scene | 🔲 Planned |
| DOC-015 | 🔲 | Multi-ID — empty state ("No distinct plants found") | `plant-doctor` identify_scene (empty) | 🔲 Planned |
| DOC-016 | 🔲 | Multi-ID — AI disabled → `doctor-btn-multi-id` disabled | Supabase profile mock | 🔲 Planned |
| DOC-017 | 🔲 | Multi-ID — select + confirm a plant → `scene-map-confirmed-N` shows selected candidate; single `scene` session written, `results.confirmed[regionIndex]` updated in place | `plant-doctor` identify_scene | 🔲 Planned |
| DOC-018 | 🔲 | Multi-ID — `scene-map-info-N-M` shows pills; `scene-map-see-care-N-M` opens PlantDetailModal | `plant-doctor` (identify_scene + resolve) | 🔲 Planned |
| DOC-019 | 🔲 | Multi-ID — `scene-map-check-N` → `scene-map-add-to-shed` → confirmed plant inserted | `plant-doctor` + resolve/save mocks | 🔲 Planned |
| DOC-020 | 🔲 | History — Group ID card from a Multi-ID run, expandable to per-plant rows | — | 🔲 Planned (scene session seed) |

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
