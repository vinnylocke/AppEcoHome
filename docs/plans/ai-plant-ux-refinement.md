# Plan — AI plant UX refinement (Option A: kill the jargon)

## What the user asked for

Three concrete behaviours:

1. **Unedited AI plant** → Refresh button works. On click it tells you either "Care guide is up to date" or "Updates available" (and applies them).
2. **Edited AI plant** → Refresh button **disabled** with a message explaining "you've customised this so it's no longer auto-updating", plus a **Revert** button to undo the edits and rejoin auto-updates.
3. **No mention of "catalogue" or "linked"** anywhere users see.

The orphan Pear in the user's local DB triggered the gap that surfaced this — the button was silently absent. The user expected it to be there and work.

## What's broken vs the goal

| Surface | Currently | Should be |
|---------|-----------|-----------|
| Source chip (catalogue-tracking AI) | "AI · Auto-updating catalogue" | "AI" |
| Source chip (edited AI) | "AI · Custom (your edits)" | "AI · Edited" |
| Refresh button on unedited linked AI | Works ✓ | Works ✓ (keep) |
| Refresh button on unedited **orphan** AI | Hidden (silent click before) | Works — self-heal then refresh |
| Refresh button on edited AI | Hidden | **Visible but disabled** with explanation |
| Reset button label | "Reset to catalogue" | "Revert" |
| Reset confirm copy | "Reset to the Rhozly AI catalogue?" / "Reset and rejoin" | "Revert your edits?" / "Revert" |
| "Not linked to catalogue" hint | Visible on orphan rows | Removed (orphan self-heals on Refresh) |
| Overrides summary panel | "Your overrides" + field list | "You've edited: …" + field list (less jargon-y) |
| `<CareUpdateCallout>` headline | "Care guide updated — N field(s) changed" | (keep — already user-friendly) |
| Shed card `<UpdatedChip>` | "N fields updated" | (keep — already fine) |

## Self-heal for orphan AI plants

The Pear-style orphan happens when an AI plant was added without `forked_from_plant_id` set — usually because Wave 2's catalogue-write wasn't yet active in the local stack at the time, or the race-recovery insert failed silently.

When the user clicks Refresh on an orphan, do this:

1. Call `PlantDoctorService.generateCareGuide(commonName, homeId)` — this re-runs the catalogue-write path. If the global already exists (someone else added it later), `fromCatalogue: true` is returned and no Gemini call fires. If it doesn't, Gemini generates + the edge fn inserts it. Either way, `db_plant_id` comes back.
2. UPDATE the home row: `forked_from_plant_id = db_plant_id`, `overridden_fields = []`.
3. Upsert `user_plant_ack` at the global's `freshness_version` so no chip flashes.
4. Refetch the plant + the freshness hook → button + chip behaviour now works normally.

If the user later clicks Refresh again, the row is no longer an orphan, so it goes through the normal manual-refresh-ai-plant path.

## Files to change

### `src/components/aiPlants/SourceChip.tsx`
- "AI · Auto-updating catalogue" → "AI"
- "AI · Custom" → "AI · Edited"
- Tooltip text adjusted to remove "catalogue" / "linked" language.

### `src/components/aiPlants/ResetConfirmModal.tsx`
- Rename heading: "Reset {plantName} to the catalogue?" → "Revert your edits to {plantName}?"
- Subheading: "Your edits will be lost" (keep)
- Body copy: rephrase to avoid "catalogue" — say "auto-updating care guide" or just "automatic care updates".
- Button: "Reset and rejoin" → "Revert"
- testid stays `ai-reset-confirm-modal` / `ai-reset-confirm` so E2E doesn't break.

### `src/components/PlantEditModal.tsx`
- Drop the "Not linked to catalogue" hint and the orphan-aware gate added in `a9a470e`.
- Render the Refresh button for all AI plants (catalogue-tracking OR edited). Disabled when edited; enabled otherwise.
- On click for unedited orphan rows, run the self-heal flow before invoking `manual-refresh-ai-plant`.
- On click for edited plants: button is disabled, can't fire.
- Rename "Reset to catalogue" button to "Revert".
- Rename "Your overrides" panel heading to "You've edited these fields".
- Add a small explanation block when edited: "You've customised this plant, so its care guide no longer auto-updates. Use Revert to rejoin and lose your edits."

### `src/components/aiPlants/CareUpdateCallout.tsx`
- "Catalogue refreshed N days ago" → "Care guide refreshed N days ago" (drop "catalogue" — already a minor change).

### Vitest
- `tests/unit/components/SourceChip.test.ts` — update assertions to match new labels.

### Docs
- `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` — refresh the "AI editing flow" subsection to match the new copy + Refresh-always behaviour + Revert button.
- `docs/plans/ai-plant-overhaul.md` — add a "Post-Wave-7 UX refinement" note in the Wave 7 section.

## What this does NOT change

- The data model: catalogue, forks, overridden_fields all stay exactly as-is. Only labels and the Refresh/Revert UX change.
- The cron, RPCs, edge functions: untouched.
- The Wave 1–6 migrations: untouched.
- The Shed grid card chip: stays "N fields updated" — already fine.

## Risk

- **Self-heal on Refresh costs a Gemini call** if no global exists yet (the user's exact Pear case). That's expected and matches the existing manual-refresh cost model — user-triggered. Capped by the existing 7-day rate limit (which applies after the first heal, since the heal completes a successful generate_care_guide).
- **Race**: user A and user B both click Refresh on an orphan with the same scientific_name at the same time. Each generates a global; one wins via the partial unique index, the other catches the race and re-reads. Existing Wave 2 behaviour, no change needed.
- **No E2E coverage** for the self-heal path. Manual verification on the user's local Pear is the validation — once the global is linked, all the existing Wave 5/6 E2Es apply.

## Process

1. Rename pass (SourceChip, ResetConfirmModal, copy in PlantEditModal).
2. Drop the orphan hint, restore Refresh button visibility, add disabled state.
3. Write the self-heal helper inline in PlantEditModal (it's small — find global by name → update home row → re-fetch freshness).
4. Update Vitest assertions for new copy.
5. Manual test on the orphan Pear: click Refresh → expect a toast saying "Care guide is up to date" (and the orphan state quietly disappears).
6. `npx tsc --noEmit` clean, Vitest green.
7. Commit + push with `[skip ci]`.

No migrations, no edge function changes, no schema changes.
