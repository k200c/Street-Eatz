-- Allow staff/admin to insert orders (without requiring user_id match)
CREATE POLICY "Staff can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'staff'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Allow staff/admin to insert order items for any order
CREATE POLICY "Staff can create order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'staff'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Allow users to insert items for their own orders
CREATE POLICY "Users can create items for their own orders"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_id 
    AND orders.user_id = auth.uid()
  )
);