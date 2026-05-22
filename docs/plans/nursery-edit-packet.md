# Plan — Edit a Nursery packet + clearer Plant Out gating

## Problem

A user with germinated sowings can't plant them out because their packets aren't linked to a Shed plant (they used "Add later", bulk-paste, or the scan flow which all leave `plant_id = null`). Two gaps in the UI:

1. **No edit affordance.** `SeedPacketDetailModal` exposes only Archive / Restore / Discard. There's no way to set the missing `plant_id` (or fix anything else on the packet) after creation, even though `updateSeedPacket` already exists in the service.
2. **Disabled "Plant out" with no actionable nudge on mobile.** Today the button stays visible but disabled with a `title` tooltip — invisible on touch. The user sees a greyed button and assumes the feature doesn't work, not that they need to link a plant first.

The Add modal even tells users *"You can link the packet to a proper plant any time"* — but there's nowhere to actually do it.

## App-reference files consulted

- [docs/app-reference/03-garden-hub/10-nursery.md](../app-reference/03-garden-hub/10-nursery.md) — confirms the gap: detail modal lifecycle doesn't include an edit path; the doc itself says *"the user attaches the catalogue plant later via the packet detail"* but the UI doesn't provide it.
- [docs/app-reference/99-cross-cutting/33-data-model-nursery.md](../app-reference/99-cross-cutting/33-data-model-nursery.md) — confirms `plant_id` is nullable on `seed_packets`, so no migration needed.
- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — confirms the Shed search pattern we'll reuse (`useCachedShed`).

## Solution

Two changes, in the same wave:

### 1. New `EditSeedPacketModal`

One scrolling modal (not two steps) with two sections:

**Section A — Linked plant**
- Shows the current link (logo + common name + scientific name) OR a clear "Not linked to a Shed plant" empty state.
- Search input over `useCachedShed(homeId).plants` (same hook the Add flow uses).
- Tapping a search result sets the new `plant_id`.
- "Unlink" button clears the link to `null` (rare but useful for fixing mistakes).
- This is the section that fixes the user's specific problem; placing it FIRST so it's the obvious thing to do.

**Section B — Packet details**
- Variety, Vendor, Purchased, Opened, Sow-by, Quantity, Notes — all editable, pre-filled from the packet.
- Reuses the `inputCx` styling and `FieldRow` pattern from `AddSeedPacketModal`. To avoid duplicating ~30 lines, I'll lift `FieldRow` + `inputCx` into `src/components/nursery/_packetForm.tsx` and import them from both modals.

**Save behaviour**
- Computes the patch (only fields that changed) and calls `updateSeedPacket(packet.id, patch)`.
- On success: toast "Packet updated", fire `onSaved()`, close.
- On error: inline error message, modal stays open.

**Logging**
- `EVENT.NURSERY_PACKET_EDITED` (new event in the registry). Fields: `packet_id`, `changed_keys[]`, `plant_id_was_null`.

### 2. Make "Plant out" actionable when not linked

In `SeedPacketDetailModal`'s `SowingRow`, when `sowing.status === "germinated"` and `!canPlantOut`:

- Replace the disabled "Plant out" button with an **active** "Link plant to plant out →" button (amber chip — still visually distinct from the green ready-to-go one).
- Tap opens the new `EditSeedPacketModal` directly. When the user picks a plant and saves, the row re-fetches, `canPlantOut` flips to `true`, and the actual green "Plant out" button replaces it.

This means the user always has a clear next action — never a dead disabled button.

### 3. Add an "Edit" entry to the packet detail footer

Even when `plant_id` is already set, users may want to fix variety / sow-by / etc. Add a small "Edit" pill alongside Archive/Done in the detail modal footer that opens the same modal.

## Files we'd add / change

| File | Purpose |
|------|---------|
| `src/components/nursery/EditSeedPacketModal.tsx` | NEW — the modal |
| `src/components/nursery/_packetForm.tsx` | NEW — shared `FieldRow` + `inputCx` lifted from `AddSeedPacketModal` |
| `src/components/nursery/AddSeedPacketModal.tsx` | Swap the local `FieldRow`/`inputCx` for the shared one |
| `src/components/nursery/SeedPacketDetailModal.tsx` | Add Edit pill in footer; render `EditSeedPacketModal`; replace disabled Plant Out with "Link plant to plant out →" CTA when `!canPlantOut` |
| `src/events/registry.ts` | New `NURSERY_PACKET_EDITED` event |
| `tests/unit/components/EditSeedPacketModal.test.ts` | NEW — render + change-link + save patch |
| `docs/app-reference/03-garden-hub/10-nursery.md` | Document the new Edit flow + the link-first nudge |

## Edge cases

- **Saving with no changes.** Disable Save until at least one field differs from the original. Keep the modal open if the user re-clicks.
- **Unlinking a packet that has germinated sowings.** Allowed — discarding the link doesn't break existing sowings, but Plant Out will go back to disabled until they relink. Show an inline warning when they tap Unlink on a packet with active sowings: *"This packet has active sowings — you'll need to relink before planting them out."*
- **Variety vs plant link.** If both go away, the "Log sowing" button's existing guard (`packet.plant_id == null && !packet.variety`) re-engages. Already handled.
- **Concurrent edit.** If two devices edit the same packet, last-write-wins on the columns. Acceptable for a single-user home; multi-user collaboration on packets is rare.

## What's deliberately out of scope

- A combined "Add or Edit" modal (would force us to handle two flows in one component). Two modals is cleaner.
- Editing sowings (sown_count, sown_on). Different flow, different surface; users delete + relog if they need to fix a sowing.
- A picker that lets you create a brand-new Shed plant inline. If the plant isn't in the Shed, the user needs to add it the normal way first. We can revisit if it becomes a friction point.

## Sequencing

1. Lift `FieldRow` + `inputCx` into `_packetForm.tsx`, update `AddSeedPacketModal` import (no behaviour change).
2. Build `EditSeedPacketModal` + its test.
3. Wire it into `SeedPacketDetailModal` — footer Edit pill + the "Link plant to plant out →" replacement.
4. Add the new event id.
5. Update the app-reference.
6. Typecheck + tests + release notes + deploy.
