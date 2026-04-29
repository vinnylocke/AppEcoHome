-- Storage bucket for Perenual plant thumbnail imports (used by image-proxy function)
INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-images', 'plant-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_plant_images" ON storage.objects;
CREATE POLICY "public_read_plant_images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'plant-images');

DROP POLICY IF EXISTS "auth_upload_plant_images" ON storage.objects;
CREATE POLICY "auth_upload_plant_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'plant-images');

DROP POLICY IF EXISTS "service_upload_plant_images" ON storage.objects;
CREATE POLICY "service_upload_plant_images"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'plant-images');
