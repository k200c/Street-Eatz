-- QUARANTINE: Reset RLS policy on social_media_posts to simple authenticated check
-- This removes any potential recursive role-checking that could cause 504 timeouts

-- Drop existing policy
DROP POLICY IF EXISTS "Staff can manage social posts" ON social_media_posts;

-- Create simple non-recursive policy
CREATE POLICY "Emergency_Authenticated_Access" 
ON social_media_posts 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);