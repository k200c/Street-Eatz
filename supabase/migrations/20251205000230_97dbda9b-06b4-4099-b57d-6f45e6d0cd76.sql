-- Restrict direct INSERT on orders and order_items to service_role only
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Allow public order creation" ON public.orders;
DROP POLICY IF EXISTS "Allow public order items creation" ON public.order_items;

-- Create restrictive INSERT policies - only service_role (Edge Functions) can insert
-- Note: service_role bypasses RLS, so authenticated/anon users cannot insert directly
-- They must use the create-order Edge Function which validates data server-side

-- Allow authenticated users to insert their own orders (with user_id check)
CREATE POLICY "Authenticated users can create their own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- For guest orders (user_id IS NULL), only service_role can insert (Edge Function)
-- This is handled automatically since anon/public roles are not granted INSERT

-- Order items can only be created by service_role (via Edge Function)
-- No direct INSERT policy for authenticated users on order_items