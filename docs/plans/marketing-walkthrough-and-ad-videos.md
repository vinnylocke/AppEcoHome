# Marketing — walkthrough videos + advertising video

**Date:** 2026-07-08 · **Scope agreed:** 4 walkthroughs (core tour, Garden AI, Plant Doctor + Watchlist, Planner + Shopping), phone portrait for core/AI/doctor + desktop for planner, narration scripts only (no baked audio), and TWO ad cuts (60s master + 30s edit, portrait 1080×1920 for social).

**App-reference consulted:** none required — no `src/` or `supabase/functions/` changes; this is marketing tooling only, modelled on the existing `marketing/_src/build/capture-screens.mjs` rig (demo-account sign-in via supabase-js + localStorage token injection, `settle()` clean-frame helper).

## Deliverables

```
marketing/videos/
  walkthroughs/
    01-core-tour.mp4            (phone 390×844 → 1080×2340-ish output)
    02-garden-ai.mp4            (phone)
    03-plant-doctor-watchlist.mp4 (phone)
    04-planner-shopping.mp4     (desktop 1280×800)
  scripts/
    01-core-tour.md … 04-planner-shopping.md   (timestamped narration, VO-ready)
  rhozly-ad-60s.mp4             (1080×1920 portrait, silent, captioned)
  rhozly-ad-30s.mp4             (fast-cut edit of the same material)
  README.md                     (how to re-record; note on adding a licensed music track)
```

## New build scripts (marketing/_src/build/)

1. **`record-walkthroughs.mjs`** — Playwright `chromium`, one `browser.newContext({ recordVideo: { dir, size }, viewport })` per walkthrough. Auth identical to capture-screens.mjs. Each flow is a scripted sequence of navigations/clicks with human pacing (600–1200 ms pauses, smooth `mouse.move` steps). Two watchability aids injected per page:
   - a fake cursor dot (fixed-position div following mousemove) since recordings don't show the real cursor;
   - the existing Shepherd-tour/toast suppression CSS from `settle()`.
   Videos land as `.webm` in a temp dir, then `ffmpeg-static` transcodes to H.264 `.mp4` (and trims dead time at the start/end).
2. **`render-ad-cards.mjs`** — renders 5–6 brand title cards (1080×1920 HTML → PNG via Playwright screenshot), using the same brand tokens as `render-collateral.mjs` (Rhozly green, display font, logo).
3. **`build-ad.mjs`** — ffmpeg assembly: title cards (2s each, subtle zoompan Ken Burns) interleaved with the best clip segments (trimmed from the walkthrough recordings) + 2–3 existing `_src/captures/` screenshots with zoompan, caption overlays via pre-rendered transparent PNGs (not drawtext — font control is better), 0.4s crossfades, logo + tagline end card. 60s master first; the 30s cut reuses the same segment list with tighter trims. Silent audio track note in README (no licensed music available to bake in).

## Walkthrough flows (all on the demo account — read-mostly)

- **01 core tour (phone):** /dashboard (weather + today) → /shed (collection scroll) → open a plant page (tabs glance) → /schedule (blueprints). No mutations.
- **02 Garden AI (phone):** open chat → ask "what needs attention this week?" (🔎 grounded answer) → ask "remind me to feed the tomatoes on Saturday" → confirm the staged card. **Mutation:** creates one one-off task — deleted afterwards by the script via supabase-js so the demo account stays pristine.
- **03 Plant Doctor + Watchlist (phone):** /doctor → upload a plant photo from `_src/captures` assets → identification result (live Gemini call on the demo account, within quota) → /watchlist scroll. No lasting mutations (nothing saved from the result).
- **04 Planner + Shopping (desktop):** /planner → open the in-progress plan (phases) → /shopping (lists + items). No mutations.

## Narration scripts

One markdown per video: `[mm:ss]`-stamped lines matched to the recorded pacing, warm gardener voice consistent with the marketing kit copy, ~140 words/min so each script fits its runtime. Written AFTER recording so timestamps match actual cut lengths.

## Dependencies & conventions

- `npm i -D ffmpeg-static` (self-contained binary; no system install).
- Requires `RHOZLY_DEMO_PASS` env at run time (never committed) — same as the other marketing scripts.
- Everything lands under `marketing/` which remains **uncommitted** (consistent with the rest of the marketing kit — committing it stays the user's call). `package.json`/`package-lock.json` gain the ffmpeg-static devDependency (that part is committed).
- No app code, tests, seeds or app-reference changes.

## Risks / notes

- Prod recording means real data: flows avoid destructive actions; the single created task is cleaned up in-script.
- The Gemini identification in walkthrough 03 costs one AI call on the Evergreen demo account — negligible.
- Recording length variance: scripts stamp timestamps from the final cut lengths, so they're written last.
- Ad cuts are portrait-first (phone clips); desktop planner footage appears only in walkthrough 04, not the ads (would letterbox).
