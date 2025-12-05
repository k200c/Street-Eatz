-- Fix RLS policies for orders table - use has_role() instead of checking profiles.role
DROP POLICY IF EXISTS "Staff can view all orders" ON orders;

CREATE POLICY "Staff can view all orders" ON orders
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix RLS policies for order_items table - same issue
DROP POLICY IF EXISTS "Staff can view all order items" ON order_items;

CREATE POLICY "Staff can view all order items" ON order_items
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));