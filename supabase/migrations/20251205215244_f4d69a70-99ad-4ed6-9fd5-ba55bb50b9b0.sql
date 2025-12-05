-- Drop the existing UPDATE policy that uses direct profile query
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

-- Create new UPDATE policy using the has_role security definer function
CREATE POLICY "Staff can update orders" 
ON public.orders 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));