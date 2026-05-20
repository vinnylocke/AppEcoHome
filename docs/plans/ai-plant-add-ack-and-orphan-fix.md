# Plan — Fix freshness chip + refresh button on freshly-added AI plants

## Bugs reported

1. **Bug A — chip fires immediately after add.** User adds Common Pear via PlantSearchModal. Opens the plant. The yellow "Care guide updated" callout appears even though the user hasn't seen any prior version — they just added it.
2. **Bug B — "Refresh now" returns `{"error":"not_a_global_ai_plant"}`** on the same plant. The edge fn rejects because the row it's looking at has `home_id IS NOT NULL`.

## Root causes (two, share a fix surface)

**Root cause 1 — no `user_plant_ack` seeded on add.**

`useAiPlantFreshness` computes `has_update = global.freshness_version > seen_version`. For a freshly-added plant the user has no `user_plant_ack` row, so `seen_version = 0`. The global has `freshness_version = 1` (always, even on first generation). So `has_update` is true → chip fires.

`fork_ai_plant_for_home` (the Wave 1 RPC) seeds the ack to avoid this. But Wave 3 chose to do the shallow-fork insert client-side at add-time INSTEAD of calling that RPC, and the equivalent ack-seed step was never wired up on the client paths.

**Root cause 2 — orphan AI rows resolve to themselves.**

`resolveGlobalId` in `useAiPlantFreshness.ts`:

```ts
return p.forked_from_plant_id ?? p.id;
```

For a normal shallow fork this returns the global parent. But for an **orphan AI row** — `source = 'ai'` with `home_id != null` AND `forked_from_plant_id = NULL` — it returns `p.id`, which IS the home-scoped row. The Refresh button then invokes `manual-refresh-ai-plant` with the home row's id; the edge fn checks `home_id IS NULL` and rejects with `not_a_global_ai_plant`.

How does an orphan AI row appear? Two ways:
- Wave 2's catalogue insert race-recovery failed (the `warn(FN, "insert-race-recovery-failed", ...)` path).
- The user added the plant before Wave 2 was deployed locally (their `supabase functions serve` was stale, or the function wasn't yet checked in).

The user's Pear case is likely the second — they had a stale plant-doctor when they added it, so no global got created and `db_plant_id` was null, so the Wave 7 D2 code didn't set `forked_from_plant_id`.

## Fixes

### Fix 1 — Seed `user_plant_ack` on add (closes Bug A)

In both AI add paths, after the home-scoped row inserts AND when `db_plant_id` is known, upsert a `user_plant_ack` row for the caller against the global plant_id at the global's current `freshness_version`. Mirrors what `fork_ai_plant_for_home` does internally.

Two surfaces:

- **`src/components/TheShed.tsx`** — `handleProceedToBulkAdd` AI branch (after `savePlantToDB`).
- **`src/components/PlantSearchModal.tsx`** — `handleAddToShed` AI branch (after the `plants.insert`).

Both will need:

```ts
if (db_plant_id != null) {
  await supabase
    .from("user_plant_ack")
    .upsert(
      {
        user_id: (await supabase.auth.getUser()).data.user?.id,
        plant_id: db_plant_id,
        seen_freshness_version: previewPlant.freshness_version ?? 1,
        acked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plant_id" },
    );
}
```

`previewPlant.freshness_version` is already plumbed through Wave 3 (`CareGuideResponse.freshness_version`).

### Fix 2 — Treat orphan AI rows as ineligible (closes Bug B + defensive)

`useAiPlantFreshness` learns about `home_id`. `resolveGlobalId` returns `null` for orphan AIs instead of falling back to the home row's own id:

```ts
function resolveGlobalId(p: PlantRow): number | null {
  if (p.source !== "ai") return null;
  const overrides = p.overridden_fields ?? [];
  if (overrides.length > 0) return null;        // deep fork — no chip
  if (p.forked_from_plant_id != null) return p.forked_from_plant_id;   // shallow fork → parent
  if (p.home_id == null) return p.id;           // true global → itself
  return null;                                  // orphan AI (home-scoped, no parent link) — no chip, no refresh
}
```

The `home_id` field needs to flow through:

- The `PlantRow` type in `useAiPlantFreshness.ts`.
- Callers: `TheShed` already does (rows come from `useCachedShed` which selects `*`). `PlantEditModal` already does (it gets the full plant). `InstanceEditModal` already does (it reads the full plant record from `plants`).

**UX consequence:** an orphan AI row gets:
- No freshness chip on the Shed card.
- No callout in the Plant Edit Modal.
- No "Refresh now" button (which is what we want — manual-refresh would 400 anyway).
- The SourceChip still shows "AI · Auto-updating catalogue" (it doesn't know about orphans, but that's cosmetic and we can clean up later if needed).

### What this does NOT fix

- **Orphan rows that already exist in the user's shed don't get repaired.** They'll just stop showing the chip + refresh button. To bring them back into the catalogue track, a separate one-shot "relink orphans" tool would be needed. Out of scope here — flagged for future cleanup if the orphan count actually grows.

## Files modified

| File | Change |
|------|--------|
| `src/hooks/useAiPlantFreshness.ts` | `PlantRow` gains optional `home_id`; `resolveGlobalId` returns null for orphan home-scoped AI rows. |
| `src/components/TheShed.tsx` | AI bulk-add branch: after `savePlantToDB`, upsert `user_plant_ack` for caller at global's freshness_version (only when `db_plant_id` present). |
| `src/components/PlantSearchModal.tsx` | AI Add-to-Shed branch: after insert, upsert `user_plant_ack` (only when `db_plant_id` present). |
| `tests/unit/hooks/useAiPlantFreshness.test.ts` | New case: orphan home-scoped AI row (home_id != null, forked_from_plant_id null) returns null. |
| `docs/plans/ai-plant-overhaul.md` | Add a "Post-Wave-7 hotfix" note in the Wave 7 section. |

No new migrations; no edge function changes; no RPC changes.

## Process

1. Update the hook + test → Vitest green.
2. Wire the ack seed into both add paths.
3. `npx tsc --noEmit` clean.
4. Manually verify in `npm run dev`:
   - Add an AI plant (use one that's NEW so the catalogue insert runs).
   - Open it → expect NO freshness callout.
   - Click "Refresh now" → expect a toast saying "Care guide is up to date." (catalogue version unchanged on a freshly-generated plant).
5. Commit + push with `[skip ci]`.
