# User-reported bug batch — 2026-06-14

Five production bugs the user hit during real usage. All implemented and committed; user confirmed scope mid-batch.

## Status

| Bug | Status |
|---|---|
| 1 — "ran for 1 minutes" | ✅ Fixed (the real cause was `Math.round(30s/60s) = 1` rounding, not just grammar) |
| 2 — Detail modal tabs stuck on "Preparing the plant…" | ✅ Fixed (graceful empty state when ensure-in-library fails) |
| 3 — Add to Shed routes to /dashboard | ✅ Fixed (1-line route correction + query-param pre-fill in TheShed) |
| 4A — Create with AI clobbers user input | ✅ Fixed (preserve `name.trim()` as `common_name` in add-plant-to-library) |
| 4B — AI "Did you mean…" on empty search | ✅ Fixed (new edge function `suggest-plant-names` + chip strip in PlantSearch) |
| 5 — Water valve panel "Edge Function returned a non-2xx status code" | ✅ Fixed (extract real error body from FunctionsHttpError.context) |

---

## Bug 1 — Automation notification says "ran for 1 minutes" (singular value, plural noun)

### What I found

[`supabase/functions/run-automations/index.ts:406`](supabase/functions/run-automations/index.ts#L406-L420):

```ts
const durationMins = Math.round(durationSeconds / 60);
...
body = `Valves ran for ${durationMins} min${status === "partial" ? ...}`;
```

The notification displays `${durationMins} min` regardless of value — so `1 min` / `5 min` is fine but the user reports seeing `1 minutes`, which means somewhere the body actually does template `minute(s)` with a plural-S. Let me look again — actually the source above produces `1 min` not `1 minutes`. **So there's a second copy of this string somewhere** OR the user paraphrased.

Most likely the actual displayed string is `1 min` and the user described it as "1 minutes" in their message. **The bigger concern they raised is that they "had it set longer"** — the stored value or the value passed to the notification is wrong, not just the noun.

Hypotheses for the wrong duration:

- **A**: The automation's `duration_seconds` field on the DB row is genuinely 60s — possibly an old test value the user forgot to update. Easy fix: open the automation modal, confirm the value, save again.
- **B**: There's a bug where the per-run notification reads from a different field (e.g., the *configured* duration vs the *actual run* duration). I didn't find this in `sendNotification` — it reads `automation.duration_seconds` directly — but worth checking the calling code path.
- **C**: There's a grammar-only issue and the value is actually correct. Then we still want to fix the noun.

### What I propose to do

1. Add a one-line fix to make the noun grammatically correct regardless: `${durationMins} min` is already unitless-OK. **Replace with `${durationMins} ${durationMins === 1 ? "minute" : "minutes"}`** at both call sites (line 417 and 420). Trivial.
2. Add a small `console.log` / `log()` line that records the duration passed to `sendNotification` so the user can see in the supabase function logs what the actual value is on the next run. If it's 60 (= 1 min), it's a stored-value issue and the user can fix it in the UI. If it's longer, we have a real bug to chase.

### What I will NOT do
- Won't change `automation.duration_seconds` storage or the UI input behaviour without confirming hypothesis B.

**Open question for you**: do you remember roughly what duration you'd set? (e.g., 5 min / 10 min / 30 min). Knowing whether it's "supposed to be 10 but showing 1" vs "I'd set 1 but typed it wrong" tells me whether to chase hypothesis B further or just ship the grammar fix.

---

## Bug 2 — Plant Doctor result: "Full Care Guide / Grow Guide / Light / Companions" tabs aren't clickable

### What I found

The "tabs" are on the [`PlantDetailModal`](src/components/PlantDetailModal.tsx) (opened from inside the search/detail flow). Looking at [`PlantDetailModal.tsx:151`](src/components/PlantDetailModal.tsx#L151-L181):

```tsx
) : plant.plantId > 0 ? (
  activeTab === "grow" ? <GrowGuideTab plantId={plant.plantId} ... />
  : activeTab === "companions" ? <CompanionPlantsTab ... />
  : <LightTab plantId={plant.plantId} ... />
) : (
  <div>... <Loader2 /> Preparing the plant…</div>
)
```

**The Grow / Light / Companions tab bodies only render when `plant.plantId > 0`.** When the plant is from a fresh search result that hasn't been cloned into the library yet (typical for an external Perenual / Verdantly / AI result), `plantId` is 0 and the tabs show "Preparing the plant…" forever.

The Care tab works because it renders `<ManualPlantCreation initialData={plant.details} isReadOnly />` which only needs the raw `details`, not a numeric `plantId`.

### What I propose to do

Two-part fix:

1. **Trigger an "ensure in library" call when the user lands on the Detail Modal so `plantId` is populated promptly.** There's already an `ensuring` state on this modal (see line 143-148) — it just isn't firing the resolve call from non-library sources. Wire it up so when the modal opens with a non-library result, it calls the existing `ensureSelectionLanded()` / equivalent helper to clone the plant into `plant_library` and update `plantId`. The Care tab keeps working immediately; the others come alive once the round-trip resolves (~1-2s on Gemini, ~200ms on Perenual / Verdantly).

2. **Improve the empty state** so when `plantId` is still 0 after a reasonable wait, the tab body says something useful: "Tap Add to Shed to unlock the full care guide" — rather than the indefinite "Preparing the plant…" spinner. This makes the contract obvious if the resolve genuinely fails.

### Risks
- Need to confirm the existing `ensureSelectionLanded` helper exists / matches my mental model. If not, the fix needs slightly more wiring.
- Resolving an arbitrary AI/Perenual result into the library costs a Gemini call (for AI) or a Perenual hit (cheap). Should be silent / on-modal-open so the user doesn't notice.

---

## Bug 3 — Plant Doctor "Add to Shed" navigates to /dashboard instead of /shed

### What I found — confirmed bug

[`PlantDoctor.tsx:1604`](src/components/PlantDoctor.tsx#L1604):

```ts
navigate(`/shed/add/search?query=${encodeURIComponent(seed)}`, ...);
```

But the route table in [`App.tsx`](src/App.tsx) only defines:

```tsx
<Route path="/shed" element={...} />
<Route path="/watchlist" element={<Navigate to="/shed?tab=watchlist" replace />} />
```

**There is NO `/shed/add/search` route.** React Router falls through to the "*" / NotFound handler — which in this app redirects to `/dashboard`.

Meanwhile [`TheShed.tsx:654`](src/components/TheShed.tsx#L654) DOES handle the query-param form:

```tsx
} else if (searchParams.get("open") === "add-plant") {
  setShowBulkSearch(true);
  setSearchParams((p) => { ... p.delete("open"); ... }, { replace: true });
}
```

So the `?open=add-plant` query param already triggers the BulkSearchModal. The fix is to use that path-form instead of the broken `/shed/add/search` path.

### What I propose to do

One-line change at [`PlantDoctor.tsx:1604`](src/components/PlantDoctor.tsx#L1604):

```ts
navigate(`/shed?open=add-plant&query=${encodeURIComponent(seed)}`, {
  state: { returnTo: location.pathname + location.search },
});
```

Plus extend `TheShed.tsx`'s query-param handler so when `query=...` is also present, it pre-fills the BulkSearchModal's search input. That makes the existing "seed the search with the doctor's identified name" intent actually work.

### Risks
- The existing `setSearchParams` deletes only `open`; need to also delete `query` after consuming it, otherwise the URL stays cluttered.
- Need to verify nothing else relies on the `/shed/add/search` path. Quick grep should cover it.

---

## Bug 4 — "Create with AI" renames the plant to the common-name AI returned; also missing AI fallback when library search comes up empty

### What I found — confirmed bugs (two parts)

**Part A — name gets clobbered.** [`supabase/functions/add-plant-to-library/index.ts:101`](supabase/functions/add-plant-to-library/index.ts#L101) feeds Gemini a name and inserts the response directly:

```ts
const sciKey = computeSciKey(
  typeof sciRaw === "string" ? sciRaw : null,
  aiPlant.common_name ?? name,   // ← Gemini's common_name wins; user's input is fallback only
);
...
const row = seedRowToColumnShape(aiPlant, { seeded_by_run_id: ... });
```

Whatever Gemini decides is the `common_name` becomes the row's `common_name`. If the user typed `"Sungold Tomato"` and Gemini decided that's a cultivar of `"Tomato"` and returned `common_name: "Tomato"`, the user's exact phrasing is gone. The downstream library and shed display the generic name. **User's exact variety lost.**

**Part B — search doesn't fall back to AI suggestions.** Looking at [`src/components/shared/PlantSearch.tsx`](src/components/shared/PlantSearch.tsx) — when the library search comes back empty, the only options surfaced are:

- "Search more databases" (Perenual / Verdantly)
- "Create '{query}' with AI" (the bug above)
- "Add '{query}' manually"

There's no "did you mean…" suggestion driven by a quick AI similarity hit. So a user looking for a misspelled or fancy-named cultivar has no smart path forward — they either create-with-AI (which renames) or manually input (no care data).

### What I propose to do

**Part A fix — preserve user input**:
1. Update [`add-plant-to-library/index.ts`](supabase/functions/add-plant-to-library/index.ts) so the row's `common_name` is `name.trim()` (the user's input), and Gemini's `common_name` only fills `scientific_name` / `notes` if relevant. Concretely, replace `aiPlant.common_name` in `seedRowToColumnShape(aiPlant, ...)`'s output with the user-supplied name.
2. Keep `sciKey` computation as-is (it can use Gemini's scientific_name if the user only gave a common name).
3. If Gemini returns a wildly different name (e.g., the user typed garbage and Gemini said "Plant"), we still keep the user's input. Side effect: the library will have duplicate variants like "Sungold Tomato" and "Tomato" — that's intentional, since they're different items to the user.

**Part B fix — search → AI suggestions when library is empty**:
1. When the library returns zero matches AND providers return zero matches, instead of jumping straight to "Create with AI", fire a lightweight Gemini call ("`Suggest 3 plant names similar to '${query}', return JSON: { suggestions: [{ name, reason }] }`") and render the result as a "Did you mean…" strip above the existing fallback buttons.
2. Each suggestion is clickable — clicking re-runs the library search with the new name.
3. The Create-with-AI button stays as a final fallback if none of the suggestions match.

### Risks
- Part A — if Gemini's "common_name" was the canonical form, our fix could create messy duplicate library rows. Mitigation: dedup is already done by `scientific_name_key`, so a cultivar with the same scientific name as a parent will still dedup correctly. The user-facing display gets their variant; the underlying scientific identity is correct.
- Part B — fires a Gemini call on every failed library search. Wrap behind the existing `aiEnabled` tier gate. Cache the suggestions for the same `query` for 24h via `localStorage` so the same misspelling doesn't re-bill.

---

## Summary

| Bug | Files touched | Risk | Open Q? |
|---|---|---|---|
| 1 — "1 minutes" grammar + diagnostic | `run-automations/index.ts` only | Low | Yes (your remembered duration) |
| 2 — Detail Modal tabs gated on plantId | `PlantDetailModal.tsx` + maybe one helper | Medium (ensure-in-library wiring) | No |
| 3 — Add to Shed → /dashboard | `PlantDoctor.tsx` (1 line) + `TheShed.tsx` query handler | Low | No |
| 4A — Create-with-AI clobbers name | `add-plant-to-library/index.ts` (1 line in `seedRowToColumnShape` call) | Low | No |
| 4B — Search → AI "did you mean…" | `PlantSearch.tsx` + new edge fn or extend `search-plants-ai` | Medium-high (new AI call site, new caching) | Yes (do you want Part B in this batch or as own focused PR?) |

**Approval form**: tell me which of 1 / 2 / 3 / 4A / 4B to do. I'll batch what's approved into one commit per bug (or one combined commit if any are tightly related — say so if you want batching).
