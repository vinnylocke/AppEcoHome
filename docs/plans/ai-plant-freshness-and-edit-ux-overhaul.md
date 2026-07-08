# AI plant freshness + edit UX — deep-dive findings & fix plan

**Date:** 2026-07-08 · **User report:** "we allow users to amend non-API plants which disassociates them… when we update info in our Rhozly library it lets the user verify changes to apply them — it always seems to say there's changes. Deep dive: is it working, is it intuitive, for both personas + app-new users?"

**App-reference consulted:** `99-cross-cutting/03-data-model-plants.md` (AI plant lifecycle, copy-on-write), `99-cross-cutting/25-plant-providers.md`, `08-modals-and-overlays/06-plant-edit-modal.md`.
**Evidence:** prod DB forensics (plant_care_revisions, user_plant_ack, demo shed), live Playwright screenshots (Shed + Cherry Tomato callout), full code trace (agent, file:line).

## Verified findings

**F1 — The chip is on forever because acks are never seeded (primary bug).**
`useAiPlantFreshness` treats a missing `user_plant_ack` row as "seen version 0" (`useAiPlantFreshness.ts:170`) vs globals that START at v1 → `has_update` from the moment of add. The May-20 hotfix (`cdc21be`) seeds the ack only on the `preloadedDetails` path (`TheShed.tsx:556` — `if (pd?.db_plant_id != null)`); the direct-Gemini add path loses `db_plant_id` and skips seeding. `scripts/seed-test-account.mjs` doesn't seed acks either. Prod proof: demo account has 8 AI plants, ALL chip-lit, **0 ack rows**.

**F2 — The June-12 cron run flagged noise as changes.**
All 64 `stale_check` revisions bumped every plant to v2 with 7–11 "changed fields" — including `drought_tolerant/tropical/medicinal/cuisine: false→null` on EVERY plant (regeneration omitted fields the original had = schema-evolution/omission noise, not a care change) plus case churn (`"Full Sun"→"Full sun"`). Users are told "Culinary Use changed" when the value became *nothing*.

**F3 — "Verify the changes" is impossible.**
The callout (`CareUpdateCallout.tsx`) lists field *labels* only — no before→after values — even though `plant_care_revisions.diff_summary` stores exactly that. A user cannot verify anything; they can only dismiss.

**F4 — "Mark as reviewed" doesn't apply anything.**
Acking writes `user_plant_ack` and clears the chip — **the home fork's care data stays at the old version**. There is no "apply" path in the loop at all (the cron only touches globals; `manual-refresh-ai-plant` refreshes the global + self-heals orphans). The user's stated mental model — "verify the changes to apply them" — describes a feature that doesn't exist. Confirm during implementation whether `manual-refresh-ai-plant` syncs shallow-fork rows; if not, applying is impossible without a new server path.

**F5 — Edit-disassociation is by design but under-communicated.**
Copy-on-write (2026-07-03): editing any non-manual plant forks it to `source='manual'`, drops provider ids, deletes the original home row, re-points references. Functionally sound — but the consequence ("your plant stops receiving library/AI updates permanently") needs explicit plain-words confirmation, and there's no path back (Revert exists only for legacy in-place forks).

**F6 — Doc drift.** The lifecycle doc claims every add creates a linked fork + seeds acks; only the preloadedDetails path does.

## Persona/UX assessment

- **New user:** opens the Shed and sees EVERY AI plant screaming a yellow "10 FIELDS UPDATED" badge (verified screenshot). Looks like the app is broken or their plants are wrong on day one. Trust-destroying.
- **Beginner persona:** "TROPICAL / MEDICINAL / CULINARY USE changed" is meaningless without values; "Mark as reviewed" reads as accepting changes they can't see.
- **Experienced persona:** would want to see old→new and choose; currently can neither see values nor apply them. The one good piece: the "Where plant info comes from" banner and the source chips are genuinely clear.

## Fix plan

### A. Stop the false chips (root cause)
1. Seed `user_plant_ack` on **every** AI add path: extract `db_plant_id` from the `generateCareGuide` response in the direct path (`TheShed.tsx:520` area), same in `PlantSearchModal`; seed at the global's current version.
2. `scripts/seed-test-account.mjs`: seed acks for seeded AI plants.
3. **One-time backfill** (service-role script, like the shape repair): for every home-scoped shallow fork, upsert the owner's ack at the global's current version. Rationale: the pending "updates" are overwhelmingly F2 noise; a clean slate beats a wall of false warnings. (Run once, before the next cron cycle.)

### B. Make the differ honest (cron + shared)
In `_shared/aiPlantCatalogue.ts` diff: (1) a field transitioning to `null`/absent is NOT a change (regeneration omission ≠ update — keep the old value rather than diffing it away, i.e. merge-don't-replace for absent fields); (2) case/whitespace-insensitive string + order-insensitive array compare everywhere (verify the existing normaliser covers all field types and was active); (3) bump `freshness_version` only when the filtered change set is non-empty. Deno tests for each rule.

### C. Turn "notify" into "review & apply" (the feature the user thought existed)
1. Callout shows **before → after** per field (read latest `plant_care_revisions.diff_summary` for the span between seen and current version).
2. Two actions, plain words: **"Apply updates"** (sync the changed fields from the global into the home shallow fork — new RPC `apply_ai_plant_update(fork_id)` mirroring `revert_ai_plant_fork_in_place`'s mechanics but pulling latest global data; then ack) and **"Keep mine"** (ack only). "Mark as reviewed" retires.
3. Tone down the Shed badge: one small chip ("Update available"), not a per-field count shout.

### D. Make disassociation informed (copy-on-write UX)
"Save as my own copy" confirm dialog states the consequence in gardener words: *"This makes a personal copy you can edit freely — it will no longer receive Rhozly's automatic care-guide updates."* Chip flips to Manual immediately after. (Copy change + verify the dialog exists on every entry point; no mechanics change.)

### E. Tests & docs
- Vitest: ack seeding on both add paths; hook null-ack behaviour documented as intentional-with-seeding.
- Deno: differ null-guard/normalisation rules; apply-RPC contract test if written in SQL, else edge-fn tests.
- E2E: add AI plant → NO chip; simulate behind-version → callout shows values → Apply updates → data changed + chip cleared.
- Docs: `03-data-model-plants.md` lifecycle rewrite (ack seeding requirement, apply path), `06-plant-edit-modal.md`, e2e-test-plan rows.

### Order & risk
A (stop the bleeding) → B (prevent recurrence) → C (the real feature) → D (copy) → E throughout. Risks: the backfill hides any *real* June-12 changes (accepted — they're mostly noise and C gives a better channel next cycle); the apply-RPC must respect `overridden_fields` (deep forks stay opted out, unchanged).

## Ship
Gates (`typecheck`, unit, functions, build) → backfill script run → release notes → deploy `--bump 1` → push → live Playwright verification (shed chips gone; callout flow).
