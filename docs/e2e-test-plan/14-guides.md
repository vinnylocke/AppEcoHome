# 14. Guides (Rhozly + Community)

**Spec files:** `tests/e2e/specs/guides.spec.ts` · `tests/e2e/specs/community-guides.spec.ts`
**Page Object:** `tests/e2e/pages/GuidesPage.ts`
**Seed dependencies:** `07_guides.sql` (Rhozly guides), `11_community_guides.sql` (community guides + stars + comments)
**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/)

## Rhozly Guides (`/guides`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GDE-001 | ✅ | `/guides` heading | — | ✅ Passing |
| GDE-002 | ✅ | Watering Basics, Pruning Techniques, Composting 101 cards | — | ✅ Passing |
| GDE-003 | ✅ | Empty state — no guides → graceful empty/loading | Supabase mock | ✅ Passing |
| GDE-004 | ✅ | Nav link → `/guides` | — | ✅ Passing |
| GDE-005 | ✅ | Search matching ("Watering") | — | ✅ Passing |
| GDE-006 | ❌ | Search no-match → "No guides found" | — | ✅ Passing |
| GDE-007 | ✅ | Label filter dropdown opens | — | ✅ Passing |
| GDE-008 | ✅ | Filter by "Beginner" | — | ✅ Passing |
| GDE-009 | ✅ | Clear label filter | — | ✅ Passing |
| GDE-010 | ✅ | Guide card click → reading view | — | ✅ Passing |
| GDE-011 | ✅ | Reading view sections render | — | ✅ Passing |
| GDE-012 | ✅ | Back to Library | — | ✅ Passing |
| GDE-013 | ✅ | Guide detail body text contains "watering" | — | ✅ Passing |
| GDE-014 | ✅ | Tag filter dropdown opens with "All" option | — | ✅ Passing |
| GDE-018 | ❌ | Fetch error — `/rest/v1/guides` 500 → "Failed to load guides" | Supabase route | ✅ Passing |
| GDE-019 | ✅ | Retry on error → guides reload | Supabase route | ✅ Passing |

## Community Guides (`/guides` Community tab)

**Spec file:** `tests/e2e/specs/community-guides.spec.ts`
**Seed:** `11_community_guides.sql` — Guide 1: "How to Prune Tomatoes" (labels: tomato, pruning, vegetables; 1 star; 2 comments); Guide 2: "Deep Watering Techniques" (labels: watering, roots, soil).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| CGU-001 | ✅ | Rhozly Guides tab visible | — | 🚧 In progress |
| CGU-002 | ✅ | Community Guides tab visible | — | 🚧 In progress |
| CGU-003 | ✅ | Clicking Community tab shows community list | — | 🚧 In progress |
| CGU-004 | ✅ | "Write a Guide" button on community tab | — | 🚧 In progress |
| CGU-005 | ✅ | "How to Prune Tomatoes" appears in list | — | 🚧 In progress |
| CGU-006 | ✅ | "Deep Watering Techniques" appears | — | 🚧 In progress |
| CGU-007 | ✅ | Guide card click opens reader; star button visible | — | 🚧 In progress |
| CGU-008 | ✅ | Author sees Edit button in reader | — | 🚧 In progress |
| CGU-009 | ✅ | Seeded comments visible | — | 🚧 In progress |
| CGU-010 | ✅ | Back returns to community list | — | 🚧 In progress |
| CGU-011 | ✅ | Star toggles count (star → unstar) | — | 🚧 In progress |
| CGU-012 | ✅ | Adding a comment appears in thread | — | 🚧 In progress |
| CGU-013 | ✅ | "Write a Guide" opens editor overlay | — | 🚧 In progress |
| CGU-014 | ✅ | Editor has title, subtitle, labels, publish, draft inputs | — | 🚧 In progress |
| CGU-015 | ✅ | Publishing a guide shows it in list | — | 🚧 In progress |
| CGU-016 | ✅ | Author sees Edit button on own guide | — | 🚧 In progress |
| CGU-017 | ❌ | Draft guide NOT visible in public community list | — | 🚧 In progress |

> Status `🚧 In progress` means the spec file exists and the tests are wired, but they've not been re-verified against the current seed since a recent migration. Run before promoting to ✅.

## Content feedback (👍/👎)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GFB-001 | ✅ | Rhozly guide reading view shows `content-feedback` ("Was this guide helpful?"); 👍 → "Thanks for the feedback ✓" | `content_feedback` insert | 🔲 Planned |
| GFB-002 | ❌ | 👎 reveals `content-feedback-comment` box; Send posts the comment | `content_feedback` insert + update | 🔲 Planned |
| GFB-003 | ✅ | App Help answer shows `content-feedback` ("Did this answer your question?") | `app-help` + `content_feedback` | 🔲 Planned |

> The 👍/👎 + "what's wrong/inaccurate" control writes to the `content_feedback` table (distinct from `ai_feedback`); its render is component-tested in `tests/unit/components/ContentFeedback.test.ts`. Surfaces: `rhozly-guide`, `grow-guide`, `app-help`, `documentation`, `onboarding-flow`. Admin review at `/admin/content-feedback`.
