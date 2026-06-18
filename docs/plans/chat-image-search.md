# AI chat — real plant image search (no broken placeholders)

## Problem
When a user asks the AI chat to "show me images of X", the assistant (text-only
Gemini) sometimes promises images or emits markdown image placeholders it can't
fulfil. We want it to return **real** plant thumbnails when possible, and never
render a broken/placeholder image.

## Current state (verified)
- The chat already renders `suggested_plants` (`{ name, search_query }`) as cards
  **with images** — `PlantDoctorChat.tsx` resolves each via `getPlantWikiInfo`
  (wiki/Unsplash image pipeline) and shows an `<img>`.
- Two backends: `agent-chat` (tool-aware, text) for text turns; `plant-doctor-ai`
  for image turns. Both can populate `suggested_plants`.
- The gap: image *requests* ("show me a peace lily") aren't reliably routed into
  `suggested_plants`, and free-text `content` can contain markdown like
  `![...](...)` that renders as a broken image.

## App-reference consulted
- [05-plant-doctor](../app-reference/05-plant-doctor/) — Plant Doctor + chat surface.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md),
  [24-image-sources.md](../app-reference/99-cross-cutting/24-image-sources.md) —
  image pipeline (`SmartImage`, Unsplash, wiki).
- [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
  — `agent-chat` / `plant-doctor-ai`.

## Approach
Reuse the existing image-capable `suggested_plants` path rather than inventing a
new one:
1. **Prompt**: in both `agent-chat` + `plant-doctor-ai` system prompts, add an
   "image requests" rule — when the user asks to *see* a plant (or images of
   plants), populate `suggested_plants` with the relevant species (name +
   `search_query`) and keep `content` text-only; **never** write markdown image
   syntax or promise images you can't show.
2. **Client safety net**: in `PlantDoctorChat`, strip markdown image syntax
   (`!\[...\]\(...\)`) from rendered `content` (a small sanitiser) so a stray
   placeholder can never render broken. If a plant image fails to load, the card
   already needs a graceful fallback — ensure the `<img>` has an `onError` that
   hides it / shows a leaf glyph.
3. **Honest fallback**: if no species can be resolved for an image request, the
   model returns a short "I can't show photos directly, but here's what it looks
   like…" with `suggested_plants` (which carry thumbnails) — never an empty
   placeholder.

No new edge function or table — this is prompt + a client sanitiser, leaning on
the existing `suggested_plants` → `getPlantWikiInfo` → image render.

## Files
| File | Change |
|------|--------|
| `supabase/functions/agent-chat/index.ts` (+ system prompt) | image-request rule → use `suggested_plants`, no markdown images |
| `supabase/functions/plant-doctor-ai/index.ts` | same rule in its prompt |
| `src/components/PlantDoctorChat.tsx` | strip markdown-image syntax from `content`; `<img>` `onError` fallback |

## Tests
- **Vitest**: a pure `stripMarkdownImages(text)` helper (extract to `src/lib/`) —
  removes `![alt](url)`, leaves normal text/links intact.
- **Deno**: assert the chat system prompt includes the image-request rule (string
  presence), mirroring existing prompt tests.
- e2e: optional — ask the chat for a plant and assert a `suggested_plants` card
  with an image renders (needs AI mock).

## Risks
- Model compliance — prompt nudges aren't perfect; the client sanitiser is the
  guarantee against broken placeholders.
- Don't strip legitimate non-image markdown/links.

## Docs to update
- `05-plant-doctor` chat reference (image-request behaviour), `24-image-sources`.
