-- Storage bucket for area scan photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'area-scans',
  'area-scans',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_area_scans" ON storage.objects;
CREATE POLICY "public_read_area_scans"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'area-scans');

DROP POLICY IF EXISTS "auth_upload_area_scans" ON storage.objects;
CREATE POLICY "auth_upload_area_scans"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'area-scans');

DROP POLICY IF EXISTS "auth_delete_area_scans" ON storage.objects;
CREATE POLICY "auth_delete_area_scans"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'area-scans');
