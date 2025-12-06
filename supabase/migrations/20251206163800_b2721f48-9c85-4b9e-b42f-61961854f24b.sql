-- Remove emergency policy and create proper staff-only access
DROP POLICY IF EXISTS "Emergency_Authenticated_Access" ON social_media_posts;
DROP POLICY IF EXISTS "Emergency_Open_Access" ON social_media_posts;

-- Create proper staff-only RLS policy using existing has_role function
CREATE POLICY "Staff can manage social posts" 
ON social_media_posts 
FOR ALL 
TO authenticated
USING (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));