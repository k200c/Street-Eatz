-- Add is_removable column to product_ingredients table
-- TRUE = ingredient can be removed (e.g., "No Onions")
-- FALSE = ingredient is an add-on (e.g., "Extra Cheese")
ALTER TABLE product_ingredients
ADD COLUMN is_removable BOOLEAN NOT NULL DEFAULT true;

-- Add RLS policies for staff to manage product_ingredients
CREATE POLICY "Staff can insert product ingredients"
ON product_ingredients
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can update product ingredients"
ON product_ingredients
FOR UPDATE
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can delete product ingredients"
ON product_ingredients
FOR DELETE
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policies for staff to manage ingredients table
CREATE POLICY "Staff can insert ingredients"
ON ingredients
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can update ingredients"
ON ingredients
FOR UPDATE
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can delete ingredients"
ON ingredients
FOR DELETE
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));