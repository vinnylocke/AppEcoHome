# Rhozly — walkthrough & ad videos

Produced per `docs/plans/marketing-walkthrough-and-ad-videos.md`. Everything here is
generated — re-record any time with the pipeline below.

## Contents

| File | What it is |
|------|------------|
| `walkthroughs/01-core-tour.mp4` | Dashboard → The Shed → a plant page → Schedule (phone) |
| `walkthroughs/02-garden-ai.mp4` | Garden AI: grounded question → staged reminder → one-tap confirm (phone) |
| `walkthroughs/03-plant-doctor-watchlist.mp4` | Plant Lens photo identification → Watchlist (phone) |
| `walkthroughs/04-planner-shopping.mp4` | Planner plan detail → Shopping lists (desktop) |
| `scripts/*.md` | Timestamped narration scripts for each walkthrough (record VO against these) |
| `rhozly-ad-60s.mp4` | 60s portrait (1080×1920) advertising master |
| `rhozly-ad-30s.mp4` | 30s fast cut of the same material |

## Re-recording pipeline (from the project root)

```bash
# 1. Record raw flows on the live demo account (all, or one of: core|ai|doctor|planner)
RHOZLY_DEMO_PASS=... node marketing/_src/build/record-walkthroughs.mjs

# 2. Transcode raw .webm → crisp .mp4 (also prints durations for the scripts)
node marketing/_src/build/transcode-walkthroughs.mjs

# 3. Re-render the ad's title cards / caption overlays (only if copy changed)
node marketing/_src/build/render-ad-cards.mjs

# 4. Assemble both ad cuts
node marketing/_src/build/build-ad.mjs
```

Notes:

- The recorder is **read-mostly**: the only mutation is the Garden AI reminder in
  flow `ai`, which the script deletes again afterwards. It also suppresses the
  onboarding tour's blur spotlight and injects a visible cursor dot.
- The ads are **silent** by design — no licensed music can be bundled. To add music,
  drop either mp4 plus a licensed track into any editor (CapCut/Resolve/Premiere)
  and duck nothing: there's no VO on the ads. Suggested vibe: warm acoustic,
  90–100 BPM, ends on a soft button at the logo card.
- Narration for the walkthroughs is scripts-only (`scripts/`). Read at a relaxed
  ~140 wpm; the `[mm:ss]` marks match each cut's on-screen moments.
- `_raw/`, `_cards/` and `_seg/` are intermediates — safe to delete.
