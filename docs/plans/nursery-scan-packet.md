# Plan — Nursery: Scan a Seed Packet (OCR + Gemini extraction)

## Goal

Add a third way to get a packet into The Nursery: **point your phone at the packet, snap a photo, get the variety / vendor / sow-by / quantity pre-filled, review, save**. The existing paths (manual entry + bulk paste) stay; this is the "I just got this from the shop" path.

## What the user does

1. Open The Nursery on `/shed` → **Scan a packet** (new button next to Add packets / Paste a list).
2. Capture: the modal opens the camera (native on Capacitor, web file input fallback). User snaps the packet front, then optionally a second photo of the back if there's more info on it.
3. Send: button says **Extract details**. Modal shows a loading state with a thumbnail of the photo.
4. Review: a single editable form appears, pre-filled with whatever Gemini Vision could extract — plant common name, variety, vendor, sow-by, purchased / opened dates, quantity, notes. Anything Gemini missed is left blank for the user.
5. Save: same insert path as `createSeedPacket` — packet lands in The Nursery with `plant_id = null` (the OCR doesn't carry a Library link; user can attach it later from the packet detail).

## App-reference files consulted

- [docs/app-reference/03-garden-hub/10-nursery.md](../app-reference/10-nursery.md) — the host surface.
- [docs/app-reference/99-cross-cutting/33-data-model-nursery.md](../app-reference/33-data-model-nursery.md) — packet schema (no changes needed).
- [docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md](../app-reference/10-edge-functions-catalogue.md) — where the new edge fn lands.
- [docs/app-reference/99-cross-cutting/13-ai-gemini.md](../app-reference/13-ai-gemini.md) — Gemini Vision conventions.
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/17-tier-gating.md) — Sage+ gating.
- [docs/app-reference/99-cross-cutting/23-capacitor.md](../app-reference/23-capacitor.md) — camera capture patterns.

## Data model

One small addition: store the scan image against the packet.

```sql
ALTER TABLE public.seed_packets
  ADD COLUMN IF NOT EXISTS image_url text;
```

Plus a new storage bucket `seed-packet-images` (path `home_id/packet_id.jpg`). RLS lets home members read; writes are gated by home membership too. Mirrors the `instance-photos` pattern.

Upload happens on Save, NOT on Scan — that way cancelled / retaken scans don't leave orphan files. The flow:

1. User snaps photo → Gemini Vision call uses the **base64** (no upload yet).
2. Review form pre-fills, user confirms.
3. On Save:
   - Insert the `seed_packets` row first (gets a packet id).
   - Upload the compressed JPEG to `seed-packet-images/{home_id}/{packet_id}.jpg`.
   - PATCH the row's `image_url` with the public URL.
   - If the upload fails, the packet still exists — the image is non-critical.

## Edge function

New: **`scan-seed-packet`**. Sage+ only. Mirrors `parse-seed-packets`'s shape so the client review step can be shared.

```ts
// Request
POST /functions/v1/scan-seed-packet
Body: {
  homeId: string;
  imageBase64: string;     // raw base64, no data-URL prefix
  mimeType?: string;        // "image/jpeg" default
  extraImageBase64?: string; // optional second photo (back of packet)
  extraMimeType?: string;
}

// Response
{
  packet: ParsedSeedPacket | null;
  confidence: "high" | "medium" | "low";  // surfaces a hint in the UI
  unreadable?: boolean;      // server detected garbled output → ask user to retry
}
```

Server-side:
- `requireHomeMembership` + `guardAiByHome` + `enforceRateLimit` (same trio as `parse-seed-packets`).
- Image size cap: 1.5 MB raw (≈ 2 MB base64). PlantDoctorChat's compression helper (`compressImage`) already produces 800px @ 70% JPEG, which lands at ~150-300 KB — well under.
- Gemini call: vision-enabled prompt asking for ONE packet's worth of fields. Schema mirrors `parse-seed-packets`'s but always returns exactly one entry.
- Defensive normalisation: `normaliseScannedPacket()` rejects garbage dates (year < 1980 or > 2100), trims strings, and infers confidence from how many fields came back populated.

## Surfaces and files

| File | Status | Purpose |
|---|---|---|
| `supabase/migrations/<ts>_nursery_scan.sql` | NEW | `seed_packets.image_url` column + `seed-packet-images` storage bucket + RLS |
| `supabase/functions/scan-seed-packet/index.ts` | NEW | Gemini Vision edge fn |
| `supabase/functions/_shared/scanSeedPacket.ts` | NEW | Schema + prompt + `normaliseScannedPacket` helper |
| `src/components/nursery/ScanSeedPacketModal.tsx` | NEW | Capture → extract → review → save + upload |
| `src/components/nursery/NurseryTab.tsx` | MODIFY | New "Scan a packet" button (Sage+) next to existing add buttons |
| `src/components/nursery/SeedPacketDetailModal.tsx` | MODIFY | Render the scan image in the header when `image_url` is present |
| `src/lib/scanSeedPacket.ts` | NEW | Client wrapper: invoke + image compression + storage upload helper |
| `src/services/nurseryService.ts` | MODIFY | `createSeedPacket` accepts `image_url`; new `attachPacketImage(packetId, file)` helper |
| `docs/app-reference/03-garden-hub/10-nursery.md` | MODIFY | Document the new scan flow + image storage |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | MODIFY | Add `scan-seed-packet` row |
| `docs/app-reference/99-cross-cutting/33-data-model-nursery.md` | MODIFY | Note `image_url` + the new bucket |
| `docs/e2e-test-plan.md` | MODIFY | Add scan-flow test rows under Section 25 |

## Tier gating

| Tier | Behaviour |
|------|-----------|
| Sprout | Button hidden (vision-required). Manual entry + the regex-based bulk paste still available. |
| Botanist | Same as Sprout. |
| Sage | Full scan flow. |
| Evergreen | Same as Sage. |

## Capture surface

Reuse PlantDoctorChat's pattern verbatim:
- On Capacitor native: `Camera.getPhoto({ resultType: CameraResultType.Base64, source: CameraSource.Prompt })` so the user picks Camera vs Library.
- On web: hidden `<input type="file" accept="image/*" capture="environment" />` — opens the native camera on mobile, file picker on desktop.
- Either way: compress to ~800px wide @ 70% JPEG to keep the upload small.

## Confidence handling

The Gemini prompt asks the model to self-rate confidence based on how many of the standard packet fields it could extract. The modal surfaces this:
- `high` — silently presents the form pre-filled.
- `medium` — a small amber hint above the form: *"We weren't 100% sure on every field — give it a quick review."*
- `low` / `unreadable` — switches to an error state with a **Retake photo** button and a **Type it in instead** fallback that just opens the regular AddSeedPacketModal pre-filled with whatever scraps Gemini did extract.

## Edge cases

- **Multi-language packets** — Gemini Vision handles most Latin-alphabet seed brands fine. We don't translate; the variety / vendor stays in whatever language the packet uses.
- **Date format on packets** — packets typically print "Best before: 12/2027" or "Sow by: Dec 2027". The prompt teaches the model to convert to ISO YYYY-MM-DD with the same fallback semantics as `parse-seed-packets` (month-year → last-of-month for sow_by, first-of-month for opened/purchased).
- **Old / damaged packets** — confidence low; user falls back to manual entry.
- **No internet** — capture works, extraction blocks with an offline message and the **Type it in instead** fallback.

## Out of scope (this wave)

- **Multi-packet scanning** — taking a photo of several packets at once and extracting all of them. Possible v2; not needed for the 80% case.
- **Saving the scan image alongside the packet** — `seed_packets.image_url` would be a new column. v2.
- **Auto-linking to Library catalogue plant** — the extracted common name could trigger `ensureCataloguePlantFromSearchResult` so the new packet lands with `plant_id != null`. Saves the user the "link a plant" step. Worth doing in this wave if the extraction works reliably — let's wire it as a bonus, but the packet still saves correctly if the catalogue lookup fails.

## Sequencing

1. Shared prompt module + Deno schema (`_shared/scanSeedPacket.ts`).
2. Edge function `scan-seed-packet` (mirrors `parse-seed-packets`).
3. Client lib `src/lib/scanSeedPacket.ts` (invoke + image compression).
4. `ScanSeedPacketModal` — capture → extract → review → save (with the catalogue-link bonus).
5. NurseryTab button wiring (Sage+ gated).
6. App-reference doc updates + E2E rows.
7. Typecheck + tests + deploy.

## Risks

- **Gemini Vision quality on small packet text** — front-of-packet text can be tiny. The 800px compression target is fine for legible packet fronts; if results are poor we can up it to 1200px later.
- **Capacitor camera permissions on native** — already wired via PlantDoctorChat. We inherit its permission prompts.
- **AI cost** — one Vision call per scan. Comparable cost to `analyse_comprehensive`. Rate-limited per user.
