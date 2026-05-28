# UI Wave 5 — Plan Staging + Overhaul polish

## Goal

Lift Plan Staging from 84 → ~90 and shore up Overhaul (already 90/100) with small targeted improvements.

Investigation found the Overhaul cost-transparency complaint is already addressed (the review step shows "$0.05 vision + 3 × $0.039 photo transformations"). Focus shifts to Plan Staging where the gaps are real.

## Sensible-default decisions

| Decision | Choice |
|---|---|
| Phase 1 area form rewrite (wizard-within-wizard)? | **Defer** — bigger structural change. Real fix is making the AI suggestion + selection state visually clearer, not rebuilding the form. |
| Phase 2 collapsible plant cards for 10+ plant manifests? | **Defer** — only relevant for big plans; smaller win than the progress indicator. |
| Progress indicator at top of staging? | **Yes** — single best clarity win for newcomers. |
| Demote Regenerate to secondary? | **Yes** — easy CSS pass + lower accident rate. |
| Highlight quick-start tips on Overhaul? | **Skip** — the Step 2 already explains the purpose well. |

## App-reference files consulted

- [`docs/app-reference/04-planner/06-plan-staging.md`](docs/app-reference/04-planner/06-plan-staging.md)
- [`docs/app-reference/04-planner/09-garden-overhaul.md`](docs/app-reference/04-planner/09-garden-overhaul.md)

---

## Changes

### 1. Plan Staging — progress indicator strip

Right below the cover image header, add a slim progress strip:

```
●━━━━○━━━━○━━━━○━━━━○   Phase 2 of 5 · Infrastructure
```

- 5 dots, current phase filled green, future phases empty grey, completed phases ticked.
- Thin progress bar underneath fills proportionally (0% before start, 20% per completed phase).
- Hidden during the Pre-Start Review (no current phase yet).
- Hidden in the OverhaulGeneratingState (different flow).

### 2. Plan Staging — Regenerate button demoted

Pre-Start Review's button row:

**Before:** two equal-weight buttons side-by-side.

**After:**
- Full-width primary "Accept & Start" button.
- Below it: a small text link "Not quite right? Regenerate with feedback" — same handler, smaller visual weight.

This protects users who just want to start from accidental regenerate taps.

### 3. Plan Staging — Phase 1 AI Suggestion visual lift

The "AI Suggestion" box in Phase 1's Create-New mode already exists but reads as plain text. Add:
- A small sparkle icon next to the "AI Suggestion" label.
- Make the suggested name look more like an editable input + "Use" pill rather than a static display, hinting that it's a starting point not a fixed value.

Small change; significant clarity boost.

---

## Files

| File | Change |
|---|---|
| `src/components/PlanStaging.tsx` | Add progress indicator strip; demote Regenerate to text link; lift Phase 1 AI Suggestion presentation. |

No new tests — these are visual changes to an existing surface. Existing test coverage stays valid.

---

## Risks & edge cases

- **Progress indicator off-by-one** — Pre-Start Review state shows 0/5. Need to test all 5 phases tick correctly as the user progresses.
- **Regenerate accessibility** — must remain keyboard-focusable + retain its `data-testid` so any test referencing it still works.
- **AI suggestion in Phase 1** — must not break the actual area-creation submit (the suggested name is what `handleConfirmArea` reads).

## Steps

1. Add progress indicator strip.
2. Refactor Pre-Start Review button layout.
3. Phase 1 AI Suggestion polish.
4. Typecheck + tests + deploy.
