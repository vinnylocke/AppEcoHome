-- Sketch → Layout: private storage for the original hand-drawn sketch, plus a
-- pointer on the layout so the editor can "re-open original".
--
-- garden-sketches: PRIVATE bucket. Only the sketch-to-layout edge fn (service
-- role) writes to it, and it hands the wizard a signed URL — same pattern as
-- garden-overhaul-photos. No authenticated storage.objects policy is needed
-- because every read is via a signed URL minted server-side.

INSERT INTO storage.buckets (id, name, public)
VALUES ('garden-sketches', 'garden-sketches', false)
ON CONFLICT (id) DO NOTHING;

-- Pointer to the stored sketch (a long-lived signed URL). Nullable — layouts
-- created any other way (blank / builder / starter) leave it null. No new
-- grants required: garden_layouts predates the Data API cutoff and adding a
-- nullable column does not change its exposure.
ALTER TABLE public.garden_layouts
  ADD COLUMN IF NOT EXISTS source_sketch_url text;
