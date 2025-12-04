-- Allow staff to update products (for stock management)
CREATE POLICY "Staff can update products"
ON public.products
FOR UPDATE
USING (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));