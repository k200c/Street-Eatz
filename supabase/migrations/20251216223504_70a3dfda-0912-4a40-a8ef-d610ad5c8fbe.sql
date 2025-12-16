-- Make the 'social-media-content' bucket public
UPDATE storage.buckets
SET public = true
WHERE id = 'social-media-content';

-- Ensure the policy allows public reading
CREATE POLICY "Public Access for social-media-content"
ON storage.objects FOR SELECT
USING ( bucket_id = 'social-media-content' );