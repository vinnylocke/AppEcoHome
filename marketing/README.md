# Rhozly — Marketing & Launch Kit

Everything needed to publish and promote Rhozly: app-store listings, marketing
collateral, social graphics and beta-tester recruitment copy. All screenshots are
**real captures of the live app** (demo account), framed in Rhozly's brand style.

Brand reference (colours, fonts, logo, icons): `../Rhozly-Brand-Guidelines.pdf`.

---

## What's in here

```
marketing/
├── app-store/                         App Store + Google Play submission assets
│   ├── Rhozly-App-Store-Listing.pdf     ← branded listing kit (copy + screenshots + specs)
│   ├── listing-copy/
│   │   ├── apple-app-store.md            char-counted Apple fields
│   │   └── google-play.md                char-counted Google Play fields
│   ├── icon/rhozly-icon-1024.png        1024×1024 app icon
│   └── screenshots/
│       ├── apple/iphone-6.7/            5 × 1290×2796
│       ├── apple/ipad-12.9/             2 × 2732×2048 (landscape)
│       └── google-play/
│           ├── phone/                   5 × 1080×1920
│           ├── tablet/                  2 × 1920×1200 (landscape)
│           └── feature-graphic-1024x500.png
│
├── collateral/                        Marketing material
│   ├── one-pager/Rhozly-Product-One-Pager.pdf
│   ├── feature-sheet/Rhozly-Feature-Highlights.pdf
│   └── social/
│       ├── rhozly-square-1080.png       1080×1080  (Instagram / general post)
│       ├── rhozly-story-1080x1920.png   1080×1920  (Stories / Reels / TikTok)
│       └── rhozly-banner-1500x500.png   1500×500   (X / Discord / LinkedIn header)
│
├── beta-recruitment/
│   └── beta-tester-request.md          ready-to-post copy (full / short / one-liner)
│
└── _src/                              Sources — HTML for the PDFs, raw captures, build scripts
    ├── *.html                          PDF page sources
    ├── captures/                       raw app screenshots (unframed)
    └── build/                          regeneration scripts (see below)
```

---

## Before you publish / post — swap these

- **Beta message** (`beta-recruitment/beta-tester-request.md`): `[DISCORD INVITE]`, `[APP LINK]`, `[YOUR NAME]`. The bug-form link stays **pinned in your Discord**, not in the public post.
- **Listing copy**: confirm the URLs (`rhozly.com`, `/privacy`, support email) resolve before submitting.
- **Google Play icon**: export `app-store/icon/rhozly-icon-1024.png` down to 512×512.

---

## Regenerating the assets

Run from the **project root**. Requires the app's `@playwright/test` + `@supabase/supabase-js` (already installed).

```bash
# 1. Re-capture real app screenshots from the live demo account
#    (creds via env so no secret is stored in the repo)
RHOZLY_DEMO_EMAIL=test.rhozly+demo@rhozly.com RHOZLY_DEMO_PASS=... \
  node marketing/_src/build/capture-screens.mjs
RHOZLY_DEMO_EMAIL=... RHOZLY_DEMO_PASS=... \
  node marketing/_src/build/capture-extra.mjs

# 2. Re-render the framed store screenshots + icon + feature graphic
node marketing/_src/build/render-frames.mjs

# 3. Re-render collateral HTML (one-pager + feature sheet), then to PDF
node marketing/_src/build/render-collateral.mjs
node marketing/_src/build/html-to-pdf.mjs marketing/_src/one-pager.html    marketing/collateral/one-pager/Rhozly-Product-One-Pager.pdf
node marketing/_src/build/html-to-pdf.mjs marketing/_src/feature-sheet.html marketing/collateral/feature-sheet/Rhozly-Feature-Highlights.pdf
node marketing/_src/build/html-to-pdf.mjs marketing/_src/app-store-listing.html marketing/app-store/Rhozly-App-Store-Listing.pdf

# 4. Re-render social graphics
node marketing/_src/build/render-social.mjs
```

The framed captions live in `render-frames.mjs` (`PHONE` / `TABLET` arrays); feature copy lives in `render-collateral.mjs` (`FEATURES`). Icons are real Lucide glyphs extracted from the installed `lucide-react`, matching the brand guidelines.

---

## Notes

- **Demo account** used for captures: `test.rhozly+demo@rhozly.com` (evergreen tier, richly seeded "Maple Cottage Garden"). Password is **not** stored here — pass it via `RHOZLY_DEMO_PASS`.
- **Tier copy** is deliberately qualitative ("AI features on higher tiers") — confirm exact pricing/limits against the app before any paid-media use.
- All PDFs are A4; screenshots are exact store dimensions (verified in `app-store/Rhozly-App-Store-Listing.pdf` → Specs page).
