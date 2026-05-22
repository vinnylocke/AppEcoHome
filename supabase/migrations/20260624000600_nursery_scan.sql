-- ============================================================
-- THE NURSERY — packet scan image storage
--
-- Adds:
--   1. `seed_packets.image_url` — public URL of the scanned packet
--      photo. Nullable; only populated by the Scan-a-packet flow.
--   2. `seed-packet-images` storage bucket — one folder per home,
--      one file per packet, named `<home_id>/<packet_id>.jpg`.
--      Public read (so the URL renders anywhere), authenticated write.
-- ============================================================

-- 1. Column ----------------------------------------------------------------

ALTER TABLE public.seed_packets
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.seed_packets.image_url IS
  'Public URL of the packet photo captured via the Nursery scan flow. Null when the packet was added manually or via bulk paste.';

-- 2. Storage bucket --------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'seed-packet-images',
  'seed-packet-images',
  true,
  5242880,  -- 5 MB cap — the client compresses to ~150-300 KB anyway
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_seed_packet_images" ON storage.objects;
CREATE POLICY "public_read_seed_packet_images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'seed-packet-images');

DROP POLICY IF EXISTS "auth_upload_seed_packet_images" ON storage.objects;
CREATE POLICY "auth_upload_seed_packet_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'seed-packet-images');

DROP POLICY IF EXISTS "auth_delete_seed_packet_images" ON storage.objects;
CREATE POLICY "auth_delete_seed_packet_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'seed-packet-images');

DROP POLICY IF EXISTS "auth_update_seed_packet_images" ON storage.objects;
CREATE POLICY "auth_update_seed_packet_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'seed-packet-images');
