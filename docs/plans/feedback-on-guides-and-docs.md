# Feedback (👍/👎 + "report a problem") across guides, docs & workflows

## Goal

Let users flag a problem / inaccuracy / issue on our **guides, documentation and
workflows** — the same lightweight 👍/👎 + optional comment we already show on AI
outputs — everywhere that currently has no feedback control.

## What exists today

- **`src/components/ai/AiFeedback.tsx`** — reusable 👍/👎 control. 👎 reveals a "What was
  off? (optional)" box. Writes to **`ai_feedback`** (`user_id`, `home_id`, `function_name`,
  `action`, `rating` ±1, `target_kind`, `target_id`, `comment`). Never blocks the UI.
  Already surfaced in the **admin AI-calls feedback summary**, so anything written here is
  visible to us in one place.
- Currently wired into 3 **AI** surfaces only: Plant Doctor, Area Coach, Yield.
- **Community guides** already have **stars + comments** (`community_guide_stars` /
  `community_guide_comments`) — not a target; we won't duplicate that.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/08-data-model-guides.md` (guides data model)
- `docs/app-reference/02-dashboard/12-the-library.md` / guides surface refs
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` (`app-help`, grow-guide)
- AI observability / `ai_feedback` (migration `20260812000000_ai_observability.sql`)
- Each touched surface's own reference will be read before wiring (and updated after).

## Approach (confirmed)

**New `content_feedback` table + new `ContentFeedback` component + a new admin viewer.**
Content feedback is kept separate from the AI `ai_feedback` "learning signal".

**Scope: all of A–E** (guides, docs, AND onboarding/workflow tours).

### 1. `content_feedback` table (migration)

```sql
CREATE TABLE public.content_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_id      uuid REFERENCES public.homes(id) ON DELETE SET NULL,
  surface      text NOT NULL,        -- 'rhozly-guide' | 'grow-guide' | 'app-help' | 'onboarding-flow'
  target_kind  text,                 -- 'guide' | 'answer' | 'flow'
  target_id    text,                 -- guide id / plant_<id> / question hash / flow id
  target_label text,                 -- human-readable (guide title, flow name) for the admin view
  rating       smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;
-- users insert/read their OWN rows; admins read everything (mirror ai_feedback policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_feedback TO authenticated;
```
Indexes on `(surface, created_at desc)` and `(rating)`.

### 2. `ContentFeedback` component (`src/components/feedback/ContentFeedback.tsx`)

Mirrors `AiFeedback`'s UX (👍/👎, 👎 reveals an optional box) but writes to
`content_feedback` with neutral, content-oriented copy:
- prompt label prop, default **"Was this helpful?"**
- 👎 placeholder: **"Tell us what's wrong or inaccurate (optional)"**
- props: `surface` (req), `targetKind?`, `targetId?`, `targetLabel?`, `homeId?`, `label?`,
  `className?`. `data-testid`s `content-feedback-*`. Never blocks the UI; failures swallowed.

### 3. Admin viewer (`src/components/admin/ContentFeedbackAdmin.tsx` + admin tab)

Admin-gated list of `content_feedback` (newest first): date · surface · target label · 👍/👎 ·
comment, with filters by **surface** and **rating** (so 👎-with-comment "problems" are one
click away). Mirrors the structure of `AiCallsAdmin` but read-only + simpler. Add a nav entry
alongside the existing AI-calls admin view.

## Surfaces to wire (each = one `<AiFeedback …>` with a stable target)

| # | Surface | File | surface / target |
|---|---------|------|------------------------|
| A | Rhozly guide reading view | `src/components/GuideList.tsx` | `rhozly-guide` / kind `guide`, id `guide.id`, label = title |
| B | Grow Guide tab (per plant) | `src/components/GrowGuideTab.tsx` | `grow-guide` / kind `guide`, id `plant_<id>`, label = plant name |
| C | Plant Guides tab — Rhozly reader | `src/components/PlantGuidesTab.tsx` | `rhozly-guide` / `guide.id` |
| D | App Help AI answer | `src/components/AppHelpSearch.tsx` | `app-help` / kind `answer`, id = question hash, label = question |
| E | Onboarding tours / Help Center ("workflows") | `src/onboarding/HelpCenterDrawer.tsx` (+ flow completion) | `onboarding-flow` / kind `flow`, id `flowId`, label = flow name |

Notes:
- A and C share the same `guide` target so a guide rated in either place rolls up together.
- D: the answer isn't persisted, so `target_id` is a hash of the question (stable per Q).
- E is the most involved (Shepherd tours / drawer) — proposed as its own slice; the rest are
  simple inline renders.

## Tests

- `AiFeedback` already has a Vitest unit test; extend it for the new `label` prop.
- Add `data-testid`s at each call site (the component already exposes `ai-feedback-*`).
- E2E: add rows on the guides + help surfaces asserting `ai-feedback` renders and a 👎 +
  comment posts (mock the insert).

## Docs to update

- Each touched surface's `docs/app-reference/` file (add a "Feedback" note to Role 1 + Role 2).
- `docs/app-reference/99-cross-cutting/` AI-feedback/observability note — record the new
  `function_name`s now writing to `ai_feedback`.
- `TESTING.md` + `docs/e2e-test-plan/` for the new specs.

## Decisions (confirmed)

1. **Scope** — **all of A–E**, including the onboarding/workflow tours.
2. **Storage** — **new `content_feedback` table** (separate from `ai_feedback`) + its own
   admin viewer.

## Build order

1. Migration: `content_feedback` (+ RLS, grants, indexes) — apply locally.
2. `ContentFeedback` component + Vitest test.
3. Wire A → B → C → D → E (each a small inline render with a stable target + label).
4. `ContentFeedbackAdmin` viewer + admin nav entry.
5. Docs (app-reference per surface + a feedback note) + e2e rows + TESTING.md.
