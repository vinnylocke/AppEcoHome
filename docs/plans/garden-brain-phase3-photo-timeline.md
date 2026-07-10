# Garden Brain — Phase 3: the photo timeline (implementation plan)

**Date:** 2026-07-10 · **Parent:** [`garden-brain-strategy.md`](./garden-brain-strategy.md). Phases 1–2 shipped (OS 37.0001/37.0002). **Awaiting approval before any code.**

**Goal:** journal photos stop being dead data. A nightly vision pass over new plant-linked journal photos produces per-photo **observations** — observed growth stage (correcting the season-guessed `growth_state` with what the plant actually looks like) and early health flags ("yellowing on lower leaves — visible before you'd typically notice") — surfaced on the plant's photo timeline and fed into the Daily Brief. **No consumer gardening app watches plants longitudinally.**

## App-reference consulted
- [`99-cross-cutting/39-garden-brain.md`](../app-reference/99-cross-cutting/39-garden-brain.md) (Phases 1–2), [`07-data-model-media.md`](../app-reference/99-cross-cutting/07-data-model-media.md), [`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md), [`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md), [`11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md), [`03-garden-hub/11-global-journal.md`](../app-reference/03-garden-hub/11-global-journal.md).

## Verified foundations
- **`journal-photos` bucket is PUBLIC** — `plant_journals.image_url` is directly fetchable server-side (download → base64 → Gemini inlineData; no signed-URL machinery).
- `plant_journals`: `image_url`, `inventory_item_id` **nullable** (Quick Capture) — only linked photos are scanned (an unlinked photo has no plant to observe).
- `inventory_items.growth_state` already auto-updates from **season rules** (`update-plant-states` cron) — precedent for automatic state updates; the vision pass makes them *observed* rather than guessed. `auto_update_journal` pref gates auto journal entries (existing).
- Gemini vision via `callGeminiCascade` + inlineData parts (plant-doctor pattern); `logAiUsage` metering; `PhotoTimelineTab.tsx` already renders per-plant photo timelines.
- Daily Brief (Phase 2) assembles signals nightly at 04:30 — a photo pass at **04:00** feeds same-day briefs.

## Tier gating (user directive — explicit)
**Sage/Evergreen only** (owner tier, same rule as Phases 1–2; per the strategy: "adaptive care + photo monitoring as the Sage/Evergreen killer features"). There is no deterministic fallback for vision, so lower tiers get **nothing silently** (no rows created); the plant photo timeline shows a single quiet upsell line for them. Model ladder: `DEFAULT_MODELS` (flash-lite-led — passive monitoring must be cheap; the Pro-first `VISION_DIAGNOSIS_MODELS` stays reserved for on-demand Plant Doctor).

## Design

### 0. The output template — a CLOSED, schema-enforced contract (user requirement 2026-07-10)

The vision call runs in **JSON mode with `responseSchema`** (supported by `callGeminiCascade`) — the model *cannot* return anything outside this shape, and the server re-validates every enum anyway (defence in depth; invalid actions are dropped, the observation survives):

```ts
{
  growth_stage: enum(GROWTH_STAGES),      // the exact inventory_items.growth_state vocabulary
  health: "healthy" | "watch" | "concern",
  findings: string,                        // ≤200 chars, gardener-readable
  confidence: number,                      // 0..1
  recommended_actions: [                   // MAX 2 — from a closed vocabulary only
    { kind: "create_task",                 //   → one-tap APPLY creates a real task
      task_type: "Watering"|"Pruning"|"Maintenance"|"Harvesting",
      title: string, due_in_days: 0..14, reason: string ≤160 }
  | { kind: "check_for_ailment",           //   → APPLY deep-links to Plant Doctor diagnose
      suspected: string, reason: string ≤160 }
  | { kind: "watch_closely", reason: string ≤160 }   // advisory only — no apply
  ]
}
```

**Why this vocabulary:** `create_task` is the only *mutating* auto-action in v1 — Apply inserts a standalone task linked to the instance (client uuid via the proven `insertOrQueue` path → offline-capable for free; area/location inherited from the instance). `check_for_ailment` deliberately routes to Plant Doctor rather than auto-adding a watchlist ailment — a cheap passive flash call shouldn't create diagnosis records; the Pro-grade on-demand flow confirms first. **Watering-frequency changes are intentionally NOT in this vocabulary** — schedule adjustments stay owned by Phase 1's sensor-backed adaptive care (a single photo is weak evidence for cadence; the two pillars stay honest about their evidence). Every applied/dismissed action is recorded (audit + `ai_feedback` signal), mirroring the Phase-1 Apply/Dismiss trust loop.

### 1. `photo_observations` table (migration)
```sql
(id uuid PK, home_id, inventory_item_id, journal_id uuid UNIQUE,  -- one observation per photo, replay-safe
 observed_at timestamptz,          -- the journal's created_at (photo time, not scan time)
 growth_stage text,                -- observed stage (same vocabulary as inventory_items.growth_state)
 health text CHECK (health IN ('healthy','watch','concern')),
 findings text,                    -- ≤200 chars, gardener-readable ("slight yellowing on lower leaves")
 confidence numeric,               -- 0..1
 stage_applied boolean DEFAULT false,  -- did we update inventory_items.growth_state?
 actions jsonb NOT NULL DEFAULT '[]',  -- the validated recommended_actions, each carrying
                                       -- status: 'proposed'|'applied'|'dismissed' (+ applied_task_id)
 model text, created_at)
```
RLS members SELECT + **UPDATE** (apply/dismiss mutate `actions`); service-role INSERT. Grants: SELECT, UPDATE to authenticated. `journal_id UNIQUE` = idempotency (a photo is analysed once, ever).

### 2. Scanner — `scan-journal-photos` edge fn + cron 04:00 UTC
Per eligible home (owner Sage/Evergreen + member activity in 7 days, mirroring Phase 2):
1. Fetch unanalysed photos: `plant_journals` with `image_url` + `inventory_item_id`, `created_at` ≥ 14 days ago, LEFT-anti-join `photo_observations.journal_id` — **cap 10/home/night** (oldest first; the cap is the cost ceiling and clears backlogs over successive nights).
2. Per photo: download from the public URL (size-guard: skip >8MB), base64 → one `callGeminiCascade` vision call (flash ladder) with the plant's name + current `growth_state` + strict JSON schema `{growth_stage, health, findings, confidence}`. `logAiUsage` per call (ok/error). Parse via `extractJsonObject`; unparseable → skip (no row; retried next night up to a `scan_attempts`… no — keep v1 simple: write a `health:'watch', findings:'analysis failed'` row? **No** — write nothing, and rely on the 14-day window naturally expiring retries).
3. Insert the observation. **Stage correction:** when `confidence ≥ 0.8` AND observed stage ≠ current `growth_state` → update `inventory_items.growth_state` (`stage_applied: true`) — same auto-update contract as the season cron, now with eyes.
4. `concern` observations from the last 24h become a **Daily Brief signal** (Phase 2 generator): new item kind `photo_flag`, score **85** (between care proposals 90 and weather 80), route to the plant's journal.

### 3. Daily Brief integration + **Phase-2 actionability amendment** (user requirement 2026-07-10)
`BriefSignals.photoFlags: Array<{plantName, findings, observationId}>` → `assembleBrief` emits `photo_flag` items; generator fetches last-24h `concern` observations joined to instance names. (Deno tests extend DB-001 ranking.)

**Brief items become one-tap appliable, deterministically.** Phase 2's AI is already schema-locked (it rewrites prose only — it cannot author actions), but items were navigation-only. Amendment:
- `BriefItem` gains optional **`action`** — set ONLY by the deterministic assembler, never AI-touched (the generator rebuilds items from the deterministic array + parsed prose, so `action` survives verbatim by construction):
  - `{ type: 'apply_care_adjustment', adjustmentId, label }` on `care_proposal` items (signal now carries the `care_adjustments.id`).
  - `{ type: 'open_photo_actions', observationId, label }` on `photo_flag` items (routes into the timeline's Apply chips — photo actions apply where their audit trail lives).
- **Shared apply logic, no drift:** extract AdaptiveCareCard's apply/dismiss into `src/lib/careAdjustments.ts` (`applyCareAdjustment(adj, {homeId, userId})` — the blueprint update / routine-create + status write + events); both `AdaptiveCareCard` AND `GardenBrainBriefCard` call it. The brief card renders an **Apply** button on items with `action`; on success the item greys with "✓ Applied" and the AdaptiveCareCard reconciles on next load.
- Tests: dailyBrief Deno — `care_proposal` items carry `action.adjustmentId`; AI-path construction preserves `action`; vitest for `careAdjustments.ts` apply paths (mocked supabase: frequency update / routine create / status write).

### 4. UI — observation chips + one-tap actions on the photo timeline
`PhotoTimelineTab.tsx` (and the plant journal entries where photos render): a small chip under an analysed photo — stage + health colour (`healthy` green / `watch` amber / `concern` rose) + findings line, tooltip "Observed by Rhozly from this photo". **Recommended actions render beneath with Apply / Dismiss** (user requirement):
- `create_task` Apply → `insertOrQueue("tasks", { id: crypto.randomUUID(), type, title, due_date: today + due_in_days, inventory_item_ids: [instance], area/location from the instance, … })` — the proven standalone-task shape (offline-capable for free), then the action's `status → 'applied'` + `applied_task_id` written back to `actions`, `logEvent` + `ai_feedback` signal.
- `check_for_ailment` Apply ("Diagnose now") → navigates to Plant Doctor with the instance preselected (no silent mutation).
- `watch_closely` → advisory text only.
- Dismiss → `status: 'dismissed'` (+ negative `ai_feedback`).
Sub-Sage homes: one quiet "Rhozly can watch these photos for changes — Sage and above" line (no dark patterns). testids: `photo-observation-chip`, `photo-action-apply`, `photo-action-dismiss`, `photo-observation-upsell`.

## Files
**Server:** migration (`photo_observations` + cron 04:00), `scan-journal-photos/index.ts`, `_shared/dailyBrief.ts` (+`photoFlags` signal + `photo_flag` kind), `generate-daily-brief/index.ts` (fetch concerns), `supabase/config.toml` (`verify_jwt = false` — the Phase-2 lesson).
**Client:** `PhotoTimelineTab.tsx` chips + upsell line (fetch observations by instance).
**Docs:** 39-garden-brain (Phase 3 section), 11-cron-jobs, 07-data-model-media (new table), photo-timeline surface ref, e2e rows, plan record.

## Tests
- **Deno `scanJournalPhotos.test.ts`** (pure helpers): photo-selection predicate (linked + unanalysed + window + cap + oldest-first), stage-correction gate (confidence ≥0.8 AND differs), size guard, and **action validation** — unknown kinds dropped, >2 actions truncated, `due_in_days` clamped 0..14, `create_task` requires a valid `task_type`, reasons length-capped (the closed-vocabulary contract).
- **Deno `dailyBrief.test.ts`** extension: `photo_flag` ranks between care and weather; carries plant name + findings.
- **Live:** seed a journal photo on a planted instance (real image in `journal-photos`) → run scanner (Evergreen: real vision call if local key, else error-path skip proves the guard) → observation row → chip renders → seed a `concern` → brief shows the `photo_flag` item → sub-Sage tier flip → scanner writes nothing + upsell line renders.
- **Cost check:** `ai_usage_log` rows per scan; 10-photo cap ⇒ worst case ~10 flash-lite vision calls/home/night.

## Risks
- **Vision cost** → flash-lite ladder, 10/night cap, activity + tier filters, one-analysis-ever per photo (`journal_id UNIQUE`), 14-day window. All metered.
- **Wrong stage corrections** → 0.8 confidence gate + `stage_applied` audit trail on the row; the season cron continues to run (they converge).
- **Hallucinated alarm** ("concern" on a healthy plant) → findings are capped, calm wording, and concerns only surface via the brief/timeline (no push); thumbs on the brief feed `ai_feedback`.
- **Public-bucket fetch failures** (deleted photo, huge file) → skip silently; window expires retries.
- Local edge runtime stop/start for the new function (known ops note).

## Rollout
One deploy (migration locally first), live-verified (scan → observation → chip → brief flag → tier gates) before finishing. This completes the three-pillar Garden Brain strategy.

---

## Delivered record (2026-07-10)

Built as planned; deltas + specifics worth recording:

- **Migration** `20260912000000_photo_observations.sql` — table (journal_id UNIQUE, 8-stage growth CHECK, health CHECK, actions jsonb with per-action status + applied_task_id, stage_applied audit), indexes on `(inventory_item_id, observed_at DESC)` + `(home_id, health, created_at DESC)`, RLS members SELECT/UPDATE + service INSERT, Data-API grants, cron `scan-journal-photos-daily` 04:00 UTC. `[functions.scan-journal-photos] verify_jwt = false` in config.toml.
- **Pure core** `_shared/scanJournalPhotos.ts` — closed vocabulary + `PHOTO_OBSERVATION_SCHEMA` + `validateObservation` + `selectPhotos` + `shouldApplyStage` + `buildPhotoPrompt`, exactly per §0/§2. Caps: 10/home/night, 14-day window, ≤2 actions, due 0–14d, 8 MB image.
- **Scanner** `scan-journal-photos/index.ts` — activity filter → owner tier ∈ sage/evergreen → anti-join vs existing observations → server-side image fetch (public bucket, chunked base64) → `callGeminiCascade` DEFAULT_MODELS (flash-lite ladder) temp 0.2 + responseSchema → validate → insert → conditional `inventory_items.growth_state` correction. `logAiUsage` ok/error per photo; clean no-op without `GEMINI_API_KEY`.
- **Brief actionability (§3)** — `BriefItemAction` union set ONLY by the deterministic assembler (AI rewrite reconstructs items → actions survive verbatim); `photo_flag` kind at score 85; generator fetches 24h `concern` observations + care-proposal ids. **Shared lib** `src/lib/careAdjustments.ts` extracted so AdaptiveCareCard and the brief's inline Apply run the identical mutation (`fetchCareAdjustment` re-check → "already handled" path).
- **UI (§4)** — `PhotoTimelineTab`: parallel `photo_observations` fetch keyed by `journal-{id}`, health chip on tiles (`photo-observation-chip`), lightbox panel (`photo-observation-panel`) with stage/health/findings + per-action Apply/Dismiss (`photo-action-apply/-dismiss`); create_task Apply uses offline-safe `insertOrQueue` with `applied_task_id` write-back; check_for_ailment routes to `/doctor`; watch_closely is "Got it"; every apply/dismiss writes `ai_feedback` (function_name `scan-journal-photos`, rating ±1); sub-Sage upsell line (`photo-observation-upsell`) via `useEntitlements`. Brief card renders inline Apply (`daily-brief-item-apply`) with applied-grey state.
- **Tests** — `supabase/tests/scanJournalPhotos.test.ts` (SJP-001..031, 17 tests), `dailyBrief.test.ts` +DB-012..015, `tests/unit/lib/careAdjustments.test.ts` (8 tests). Suites at ship: 923 Deno / 1404 Vitest, all green.
- **Docs** — 39-garden-brain.md (Phase 3 section + Phase 2 actionability), 11-cron-jobs.md (04:00 row), 07-data-model-media.md, 10-edge-functions-catalogue.md (also backfilled the missing Phase 1/2 rows — doc drift), e2e rows HOME-014/015 + PTO-001..005, TESTING.md inventory.
