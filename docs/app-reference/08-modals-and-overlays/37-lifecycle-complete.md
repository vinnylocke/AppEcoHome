# Lifecycle Complete Modal

> The gentle "this plant's journey is over" flow. Replaces the old archive toggle with a deliberate moment that captures a closing note, final photo, and (optionally) an AI analysis of what may have gone wrong.

**Trigger:** "Mark lifecycle complete" button inside `InstanceEditModal` for any plant instance that doesn't already have `ended_at` set.
**Source files:**
- `src/components/LifecycleCompleteModal.tsx` — the capture step
- `src/components/LifecycleAnalysisModal.tsx` — the result step
- `supabase/functions/analyse-plant-end-of-life/index.ts` — Gemini analysis
- `supabase/functions/analyse-plant-end-of-life/prompt.ts` — pure prompt builder

---

## Quick Summary

When a plant's time is up — whether it finished its season, was harvested, or died — the user opens this modal to mark its lifecycle complete. The flow captures:

1. Optional **closing note** (`end_summary`).
2. Optional **final photo** (uploaded to `plant-images/journal/{homeId}/lifecycle`).
3. A **"natural end of life" checkbox** (default OFF).

On confirm, the instance row is stamped with `ended_at = now()`, `was_natural_end`, `end_summary`, and `status = "Archived"`. A closing journal entry is always written. If the end was NOT natural AND the user has AI enabled, the `analyse-plant-end-of-life` edge function fires, which returns a structured analysis (`likely_causes`, `prevention_next_time`, `affirmation`) that is saved as a second journal entry AND rendered in `LifecycleAnalysisModal`.

---

## Role 1 — Technical Reference

### Component graph

```
LifecycleCompleteModal (portal, role=dialog)
├── Header (Leaf icon + plant name + 1-line intent)
├── Body
│   ├── Closing-note textarea
│   ├── PhotoUploader (bucket="plant-images", pathPrefix="journal/{homeId}/lifecycle")
│   └── Natural-end-of-life checkbox (default OFF) with sub-explanation
└── Footer (Cancel + "Mark lifecycle complete" CTA)

→ on confirm, parent (InstanceEditModal) renders:

LifecycleAnalysisModal (portal, role=dialog)
├── Header (Leaf or Sparkles icon, depending on natural vs not)
├── Body
│   ├── Affirmation card (when analysis returned)
│   ├── "What likely happened" list (likely_causes)
│   └── "What to try next time" list (prevention_next_time)
└── Footer ("Open garden journal" + Close)
```

### Props received

`LifecycleCompleteModal`:

| Prop | Type | Purpose |
|------|------|---------|
| `isOpen` | `boolean` | Mount/unmount via portal |
| `instanceId` | `string` | The inventory_items row being closed |
| `homeId` | `string` | For RLS + photo upload path |
| `plantName` | `string` | Display name for the modal copy |
| `aiEnabled` | `boolean` | Gates the Gemini analysis path |
| `onClose` | `() => void` | Closes without saving |
| `onCompleted` | `(result: { wasNaturalEnd: boolean; analysis: LifecycleAnalysis \| null }) => void` | Fires after the save (+ optional analysis) succeeds |

`LifecycleAnalysisModal`:

| Prop | Type | Purpose |
|------|------|---------|
| `isOpen` | `boolean` | Mount via portal |
| `wasNaturalEnd` | `boolean` | Picks the warm-closure vs analysis layout |
| `analysis` | `LifecycleAnalysis \| null` | The Gemini output (`likely_causes / prevention_next_time / affirmation`) |
| `plantName` | `string` | Display name |
| `aiEnabled` | `boolean` | When false + non-natural end, shows the upgrade nudge |
| `onClose` | `() => void` | Dismiss |

### State (local)

| State | Holds |
|-------|-------|
| `endSummary` | Closing-note textarea content |
| `imageUrl` | Final-photo URL from `PhotoUploader` |
| `uploading` | Disables Save while a photo is uploading |
| `wasNaturalEnd` | Checkbox state |
| `saving` | Spinner + button disable during the multi-step save |

### Data flow — write paths

On confirm (`handleConfirm`):

1. **Stamp the instance** —
   ```ts
   supabase.from("inventory_items").update({
     ended_at, was_natural_end, end_summary, status: "Archived"
   }).eq("id", instanceId)
   ```
   Status is set to "Archived" so existing queries that filter by status keep working. `ended_at` is the new source of truth for "is this lifecycle over".

2. **Insert the closing journal entry** —
   ```ts
   supabase.from("plant_journals").insert({
     home_id, inventory_item_id, subject, description, image_url
   })
   ```
   Subject is "Lifecycle complete (natural)" or "Lifecycle complete" depending on the checkbox. Description falls back to a stock sentence when `end_summary` is empty.

3. **Conditionally invoke Gemini** —
   When `!wasNaturalEnd && aiEnabled`:
   ```ts
   supabase.functions.invoke("analyse-plant-end-of-life", { body: { instance_id } })
   ```
   The function gathers context (journal, tasks, ailments, area, weather), prompts Gemini with the structured schema, persists the result as a second `plant_journals` row server-side, and returns the analysis object to the client.

4. **Fire `onCompleted`** — the parent (InstanceEditModal) renders LifecycleAnalysisModal with the result.

Analysis failure is soft — the closing entry is already saved and the analysis modal falls back to a friendly "we couldn't generate this time" card.

### Edge functions invoked

`analyse-plant-end-of-life` — auth-gated via `requireAuth` + `guardAiByUser`, rate-limited via `enforceRateLimit`. Gemini cascade with `responseSchema = ANALYSIS_RESPONSE_SCHEMA`. Logs AI usage via `logAiUsage` so the analysis appears on the Audit Page.

### Cron / scheduled jobs

None.

### Realtime channels

`plant_journals` and `inventory_items` are both on the home realtime channel — other devices / members see the closed lifecycle immediately.

### Tier gating

- **Sprout / Botanist** — see the full lifecycle-complete flow. If they leave the natural-end checkbox unticked, the analysis modal shows the upgrade nudge instead of an analysis card.
- **Sage / Evergreen** — full flow including AI analysis when not natural.

### Beta gating

None.

### Permissions

Standard `home_members` RLS. Any home member can mark a plant's lifecycle complete.

### Error states

| State | Result |
|-------|--------|
| Update on `inventory_items` fails | Toast surfacing the supabase error message; modal stays open. |
| Closing journal insert fails | Logged via Sentry; flow continues — the lifecycle is still considered closed. |
| Analysis edge fn fails | Soft-fail — LifecycleAnalysisModal shows the "couldn't generate" card. |
| User has no AI quota | `guardAiByUser` returns a 402-ish response; surfaced as the upgrade nudge. |

### Performance

- Photo compression handled by `PhotoUploader`.
- Edge fn returns within ~5–10s typically. The save modal shows a non-blocking spinner ("Looking back over your records…").
- No long-lived state — the modal unmounts after `onCompleted`.

### Linked storage buckets

- `plant-images`, path prefix `journal/{homeId}/lifecycle`.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

Every plant has a finish line. A successful annual finishes its season; a perennial gets removed when it's done; sometimes a plant just doesn't make it. Whichever it is, this modal closes the chapter with the warmth and detail that "Archive" never gave it — and turns the records you kept into something useful.

### Every flow

#### 1. Add a closing note (optional)

What you remember about this plant. "Best basil I've ever grown" or "Should've moved this to a sunnier spot in May" — whatever the moment deserves.

#### 2. Add a final photo (optional)

A closing image — the harvest pile, the dried stalks, or the empty pot. Stays attached to the closing journal entry forever.

#### 3. The natural-end-of-life checkbox

- **Leave it unticked** when something went wrong — too much water, the wrong spot, a frost you didn't see coming. Rhozly will look back through this plant's journal, tasks, area details, weather, and any pests you logged to suggest what might have happened. The point isn't blame — it's "what would I do differently with the next one".
- **Tick it** when the lifecycle was just naturally complete — the annual finished its season, you harvested everything, or the plant simply reached the end of its span.

#### 4. Confirm

The plant's records are archived in place — the journal stays, photos stay, tasks stay. You can revisit any of it from the Global Journal.

#### 5. Read the analysis (if applicable)

LifecycleAnalysisModal opens with three sections:

- **Affirmation** — one sentence acknowledging your effort. Not preachy, not "no big deal" — just respectful.
- **What likely happened** — 2 to 4 concrete bullets, each citing the evidence from your records.
- **What to try next time** — 2 to 4 actionable, plant-specific suggestions.

If you're on Sprout or Botanist, this section is replaced with a calm upgrade nudge — your records are still safe in the Global Journal.

### Tier-by-tier experience

| Tier | What you see |
|------|---|
| Sprout | Full lifecycle-complete flow. Analysis section shows an upgrade nudge for non-natural ends. |
| Botanist | Same as Sprout. |
| Sage | Full flow including Gemini analysis on non-natural ends. |
| Evergreen | Same as Sage. |

### Common mistakes / pitfalls

- **Don't tick "natural" if you actually want the analysis.** The default is unticked for a reason — the analysis is the more useful default for new gardeners.
- **The analysis is gentle, not gospel.** It works off the records you kept. If you never logged anything, the analysis will say so plainly and suggest what to log next time.
- **You can't undo lifecycle-complete from this modal.** If you mark a plant complete by mistake, you'll need to manually clear `ended_at` on the instance — talk to a maintainer.

### Recommended workflows

- **Successful harvest:** complete your harvest tasks, mark lifecycle complete with the natural checkbox ticked, attach a photo of the pile. The closing entry becomes a satisfying bookend.
- **Plant died:** leave the checkbox unticked, write 1–2 sentences in the closing note (your hypothesis is useful context for the AI). The analysis will arrive in 5–10 seconds.
- **You're not sure why it died:** still leave it unticked. The analysis will look at your records — that's exactly what it's for.

### What to do if something looks wrong

- **"Couldn't generate analysis":** the edge function failed (network, quota, or Gemini hiccup). The closing entry is still safe — open the Global Journal to review the plant's history manually.
- **Analysis is generic:** likely there isn't enough data. Add more journal entries throughout the next plant's life so the next analysis has more to work with.
- **Lifecycle marked accidentally:** see "Common mistakes" above.

---

## Related reference files

- [Senescence](../03-garden-hub/12-senescence.md) — the destination for instances ended through this modal; lists every ended instance with filter pills and a reversible Restore flow
- [Global Journal](../03-garden-hub/11-global-journal.md) — where the closing entries surface
- [Plant Journal Tab](./10-plant-journal-tab.md) — per-instance view of the same entries
- [Data Model — Plants](../99-cross-cutting/03-data-model-plants.md) — `ended_at`, `was_natural_end`, `end_summary`
- [AI — Gemini](../99-cross-cutting/13-ai-gemini.md) — analysis call path
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `analyse-plant-end-of-life`
- [Tier Gating](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance

- `src/components/LifecycleCompleteModal.tsx` — capture step
- `src/components/LifecycleAnalysisModal.tsx` — result step
- `src/components/InstanceEditModal.tsx` — embed point + state plumbing
- `supabase/functions/analyse-plant-end-of-life/index.ts` — Gemini-backed analysis
- `supabase/functions/analyse-plant-end-of-life/prompt.ts` — pure prompt builder
- `supabase/tests/analysePlantEndOfLife.test.ts` — prompt builder tests
- `supabase/migrations/20260626000100_plant_lifecycle_end.sql` — `ended_at / was_natural_end / end_summary` columns
