# Plan — Chat plant images: kill the JSON "code snippet" + show a real photo

## Problem

User asked the chat to "show me images of a runner bean". Result:
1. A **code snippet** still appears under the reply.
2. The only image is a tiny thumbnail that reads as an "add to shed" row — not
   "here's what a runner bean looks like".

### Root cause (confirmed by reading prod data + code)

The latest post-deploy message is stored **clean** server-side:
`content: "Here are some images of runner beans."`,
`suggested_plants: [{ name: "runner bean", search_query: "runner bean" }]`.
So the snippet is **not** in the message text — my earlier `sanitizeAssistantText`
fix was aimed at the wrong place.

The real causes:

1. **The "code snippet" = a raw JSON dump.** The client stores the full
   `toolResults` array (incl. the display-only `show_plant_images` call) and renders
   each as a `ToolResultCard`. `ToolResultCard` has **no renderer for
   `show_plant_images`**, so it hits `Fallback` (`ToolResultCard.tsx:232-238`) which
   renders `<pre>{JSON.stringify(payload)}</pre>` →
   `{ "plants": [{ "name": "runner bean", … }] }`. That `<pre>` is the snippet.
   `show_plant_images` is display-only — its output is already surfaced as the image
   card — so it must never render as a tool-result card.

2. **The image is a 40×40px thumbnail.** `ChatPlantCard` (`PlantDoctorChat.tsx:97-103`)
   renders the photo as a `w-10 h-10` thumbnail next to the name. For a "show me what
   it looks like" request that reads as a list row / add affordance, not an image.

## App-reference files consulted

- [`05-tools/03-plant-doctor-chat.md`](../app-reference/05-tools/03-plant-doctor-chat.md) — chat component graph (ChatPlantCard, ToolResultCard, suggested plants).
- [`99-cross-cutting/10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — `agent-chat` entry.
- [`99-cross-cutting/13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) — function-calling loop / tool results.

## Approach

### Part A — Stop the JSON snippet (the actual bug)

Two layers (server stops sending it; client stops rendering it on reload of older rows):

1. **`supabase/functions/agent-chat/index.ts`** — exclude display-only tools from the
   `toolResults` returned (and persisted). Add a `DISPLAY_ONLY_TOOLS = new Set(["show_plant_images"])`
   and filter the returned `toolResults` through it. The internal `suggestedPlants`
   computation (which reads `show_plant_images`) stays unchanged — it runs on the raw
   results before the filter.
2. **`src/components/PlantDoctorChat.tsx`** — when rendering `msg.tool_results`, skip
   any entry whose `tool` is display-only. Use a tiny pure helper (see tests) so this
   is covered and reusable, e.g. `visibleToolResults(msg.tool_results)`. This catches
   already-persisted rows from before the server fix.

### Part B — Make "show me images" show a real **multi-photo gallery**

The user wants to see **more than one photo**. A single big Wikipedia thumbnail isn't
enough. The app already has a built, licensed, cached **`plant-image-search`** edge
function that returns **up to 9 images** per query from Unsplash + Pixabay + Wikipedia,
each with attribution/credit — and a reusable `Lightbox` (from `DiagnosisImageGallery`)
and `ImageCredit` badge. Reuse them.

3. **`supabase/functions/agent-chat/executors/read.ts`** — `exec_show_plant_images`
   tags each returned plant with `show: true` so the client can tell a *show-me-this*
   card from a *suggested-to-add* card.
4. **Types** — add optional `show?: boolean` to the `suggested_plants` item shape in
   `PlantDoctorChat.tsx` (ChatMessage + the two agent-response types + ChatPlantCard prop).
5. **New `ChatPlantGallery` sub-component (in `PlantDoctorChat.tsx`)** — for a `show`
   plant, on mount it invokes `plant-image-search` (`{ query, count: 6 }`) and renders an
   **inline horizontal strip of several photo thumbnails** (≈`w-24 h-24` each, scrollable),
   each with its `ImageCredit` badge and tappable to open the shared `Lightbox` for
   full-size browsing. Loading skeletons while fetching; if zero images come back it
   falls back to the existing single Wikipedia thumbnail so the card is never empty.
6. **`ChatPlantCard` (`PlantDoctorChat.tsx`)** — when `plant.show` is true, render
   `ChatPlantGallery` (the multi-photo strip) under the plant name instead of the 40px
   thumbnail; keep the "Learn more" wiki extract and the message-level `PlantActionButtons`
   (Add to Shed) below. Non-`show` suggestion cards (e.g. "you might like Star Jasmine")
   keep the compact thumbnail.

### Files changing

| File | Change |
|------|--------|
| `supabase/functions/agent-chat/index.ts` | Filter display-only tools out of returned/persisted `toolResults` |
| `supabase/functions/agent-chat/executors/read.ts` | `exec_show_plant_images` adds `show: true` |
| `src/components/PlantDoctorChat.tsx` | Skip display-only tool results; `ChatPlantCard` large image when `show`; type adds `show?` |
| `src/lib/visibleToolResults.ts` (new) | Pure helper: drop display-only tools from a tool-result list |
| `tests/unit/lib/visibleToolResults.test.ts` (new) | Unit tests for the helper |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Note: `show_plant_images` is display-only (not a ToolResultCard); large image for show-intent |
| `docs/e2e-test-plan/` (relevant tools surface file) | Note the show-images behaviour / no JSON dump |

## Tests

- **New Vitest** `tests/unit/lib/visibleToolResults.test.ts`: given results incl.
  `show_plant_images`, it's dropped; normal read tools pass through; empty/undefined safe.
- `npm run test:unit` green; `npx tsc --noEmit` + `npm run build` clean.
- Manual smoke after deploy: "show me a runner bean" → friendly caption + one large
  photo + Add to Shed, **no `<pre>` JSON block**.

## Risks / edge cases

- `show: true` must round-trip through the persisted `suggested_plants` JSON column —
  it does (it's just an extra key); older rows without it simply render the compact
  card (graceful).
- Multi-plant "show me X and Y" → multiple large cards; fine (model caps at 8 via the
  executor's `.slice(0, 8)`).
- Image fails to load → existing `imgError` fallback (leaf icon) still applies, now at
  the larger size.

## Deploy

- `agent-chat` is the only function touched → deploy it individually
  (`supabase functions deploy agent-chat`) to avoid the flaky all-functions step.
- App via `node scripts/deploy-app-only.mjs --bump 1` (client-only otherwise).
- Reset `release-notes.json` + push, per the normal release tail.
