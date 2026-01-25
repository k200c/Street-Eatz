-- Fix the UPDATE policy role from public to authenticated
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create correct policy for authenticated users only
CREATE POLICY "Users can update their own profile" 
ON profiles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);