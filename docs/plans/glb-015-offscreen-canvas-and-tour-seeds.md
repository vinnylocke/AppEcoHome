# GLB-015 fix — off-viewport canvas drag + onboarding-tour seed hardening

**Date:** 2026-07-13
**Status:** Implemented 2026-07-13 (fixes 1, 2 and 3 all approved and shipped). GLB-015/016 green; all 4 worker accounts carry the onboarding baseline; closed Help drawer is aria-hidden + inert (HCD-006 guards it). Observed during verification: welcome-modal.spec is flaky under heavy parallel batches (different tests fail per run, all green solo and as a lone file; its fixture network-mocks everything these changes touch, so unrelated) — worth its own look someday.
**Investigation:** 4-agent workflow (code trace, git archaeology, live instrumented repro, blast-radius scan); measurements below are from a live run against the local stack, not inference.

## Problem

`GLB-015` (tests/e2e/specs/garden-layout.spec.ts, "drawing a shape opens properties with three tabs", 1280×800) fails deterministically, including on a clean tree. An earlier note misattributed this to the Help Center drawer — disproven (see "False lead" below).

### Measured root cause (defect 1 — the actual GLB-015 failure)

- The three seeded weather-alert banners (`04_weather.sql`: HEAT/FROST/WIND) render above the editor, pushing the canvas top to y=390.
- The Konva canvas element is 1139px tall — bounding box {x:512, y:390, w:736, h:1139}, bottom edge y=1529, far past the 800px viewport.
- GLB-015 derives its drag from the canvas **centre**: (800, 909.5) → (960, 1009.5) — **both points below the viewport**. `document.elementFromPoint` returns `null` at both; the raw `mouse.move/down/up` drag (which bypasses Playwright actionability) hits nothing, no shape is drawn, and `property-tab-style` never appears.
- GLB-016 passes because its coords (712,590) → (832,670) land inside the viewport, on the canvas (`elementFromPoint` = CANVAS at both).
- Timeline: GLB-015's body is byte-identical to its introduction (614a3f7, 2026-05-19). The banner/canvas geometry made centre-coords fall below the fold; banner count from seeds is a hidden test dependency.

### Second landmine found (defect 2 — worker-dependent Shepherd tour exposure)

- `global_welcome` (src/onboarding/flowRegistry.ts:7, `trigger:"automatic"`, `route:"global"`, `important:true`) fires 800ms after **any** route change for any account whose `user_profiles.onboarding_state` lacks `global_welcome: completed|dismissed` (src/onboarding/useAutoTrigger.ts:30-49, 90-133). `important:true` bypasses the per-day throttle; the only re-fire guard is sessionStorage, which resets in every fresh Playwright context.
- Its steps are all `attachTo: null` → a **centred, pointer-intercepting Shepherd card** (the blur panels are pointer-events:none; shepherdAdapter.ts:26-33, 89).
- Live DB: `test2/test3/test4@rhozly.com` have `onboarding_state = {}` → the tour fires **on every test, every route** for workers 1–3. `test1` is immune only because tours were manually dismissed on 2026-07-08 — untracked local DB state that `supabase db reset` would erase (seeds never write `onboarding_state`; grep = zero hits).
- Precedent inside the repo: `tests/e2e/fixtures/welcome-modal-ready.ts:74-81` already mocks `global_welcome`/`home_setup_tips` as dismissed, with a comment that the tour overlay "intercepts pointer events". The shared `auth.ts` fixture has no such defence.
- Blast radius: garden-layout.spec.ts is the only raw-coordinate spec, but a centred card can also disturb ordinary locator clicks/assertions near the viewport centre on workers 1–3 — a plausible source of unexplained flakes in 4-worker runs.

### False lead (documented so it isn't re-chased)

The failure snapshot showed a "Help & Guides" panel — but the HelpCenterDrawer is **always mounted** (portal in src/onboarding/HelpCenter.tsx:48-68) and merely `translate-x-full` off-screen when closed, with no `aria-hidden`/`inert`/`display:none`. ARIA snapshots therefore always include it. Live measurement: drawer at {x:1280, w:420} (fully off-screen), backdrop absent, for the whole 5s after editor load. No code path auto-opens the drawer (only the sidebar button, the mobile-drawer row, and the global `?` key — src/App.tsx:637-653, 1460-1464, 2209).

## App-reference files consulted

- docs/app-reference/03-garden-hub/06-garden-layout-editor.md (editor wiring, viewport fixes of 2026-07-08)
- docs/app-reference/99-cross-cutting/30-onboarding-state.md (onboarding flows/state)
- docs/app-reference/99-cross-cutting/27-weather.md (seeded alerts feeding the banners)

## Proposed changes

### Fix 1 — GLB-015 drag coords (test-only; tests/e2e/specs/garden-layout.spec.ts)

Add a small helper in the spec and use it in GLB-015 (and GLB-016, so both are geometry-proof):

```ts
/** Centre of the VISIBLE part of the canvas — the canvas can extend past the
 *  viewport (weather banners push the editor down), and raw mouse events
 *  can't hit off-viewport points. */
async function visibleCanvasCentre(page: Page) {
  const stage = page.locator("canvas").first();
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  const vp = page.viewportSize()!;
  const x1 = Math.max(box.x, 0), y1 = Math.max(box.y, 0);
  const x2 = Math.min(box.x + box.width, vp.width), y2 = Math.min(box.y + box.height, vp.height);
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}
```

GLB-015 then drags `(cx−80, cy−50) → (cx+80, cy+50)` as before, but around the *visible* centre. No app code changes; assertions unchanged.

### Fix 2 — seed `onboarding_state` for the E2E worker accounts (supabase/seeds/00_bootstrap.sql)

Extend the existing `user_profiles` UPDATE to set a deterministic onboarding baseline: every flow id in `src/onboarding/flowRegistry.ts` marked `"dismissed"` (25 ids: global_welcome, home_setup_tips, dashboard_tour, garden_hub_tour, weather_insights_tour, planner_tour, task_schedule_tour, tools_hub_tour, plant_doctor_tour, visualiser_tour, add_manual_plant, add_location_and_area, guides_tour, profile_quiz_tour, quick_access_tour, weekly_overview_tour, notes_tour, voice_chat_tour, image_credits_tour, garden_ai_chat_tour, plantnet_identification_tour, nursery_tour, garden_walk_tour, seasonal_picks_tour, quick_launcher_customise_tour).

- Rationale: makes all 4 workers behave like test1's accidental "tours dismissed" state — the state the suite has been green against — and survives `supabase db reset`. Dismissing **all** flows (not just the two `important` ones) also neutralises the route-pinned tours (dashboard_tour etc.), whose once-per-day throttle would otherwise fire them on the first matching test of the day per worker.
- Idempotent: plain `UPDATE ... SET onboarding_state = '{...}'::jsonb` (full overwrite is the deterministic baseline; seeds are the canonical source of E2E state).
- No spec tests the auto-fire behaviour (grep: only welcome-modal-ready mocks it via route interception, unaffected by DB values; no-home-yet.ts writes its own state at runtime). So nothing regresses.
- Doc updates: CLAUDE.md seed table row for `00_bootstrap.sql` (mention onboarding baseline) + docs/e2e-test-plan/01-seeded-fixtures.md if it lists profile fields.

### Fix 3 (optional, app code — approve separately) — make the closed Help drawer honest

`src/onboarding/HelpCenter.tsx`: when closed, add `aria-hidden="true"` + `inert` to the drawer container (it currently stays in the accessibility tree while visually off-screen). This is a genuine a11y defect — screen readers can reach "Help & Guides" content at any time — and it is what sent the failure snapshot (and me) down the wrong path. Small change; would also update docs/app-reference for the Help Center surface and add a Playwright assertion in help-center-docs.spec.ts that the drawer is hidden until opened.

### Explicitly out of scope (flagged, not changed)

- The editor sitting partly below the fold at 1280×800 when alert banners stack is real UX, not a bug in the test's sense — users scroll. If we ever want the editor viewport-locked, that's a design task.
- `global_welcome` firing on deep routes (e.g. the layout editor) for genuinely-new users is a product-behaviour question (should a first-run tour interrupt an editor?) — worth a think, but not needed for green tests.

## Tests & docs

- Fix 1: GLB-015 (and 016) rerun green ×3 locally; no new tests needed (behaviour unchanged, geometry hardened).
- Fix 2: re-seed + rerun garden-layout spec with `PLAYWRIGHT_WORKER_INDEX` coverage via the full 4-worker suite; welcome-modal / home-setup specs rerun to confirm their fixtures still pass.
- Fix 3 (if approved): unit-less DOM change; assertion added to help-center-docs.spec.ts; app-reference Help Center file updated.
- docs/e2e-test-plan/22-garden-layout-builder.md: GLB-015 back to ✅ with a one-line note.
