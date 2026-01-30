-- Step 1: Add 'Kids Menu' to the product_category enum
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'Kids Menu';

-- Step 2: Create the product_allergens table
CREATE TABLE IF NOT EXISTS public.product_allergens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  allergen_numbers INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Enable RLS
ALTER TABLE public.product_allergens ENABLE ROW LEVEL SECURITY;

-- Public read access for allergens
CREATE POLICY "Anyone can view product allergens" 
  ON public.product_allergens 
  FOR SELECT 
  USING (true);

-- Staff/Admin can manage allergens
CREATE POLICY "Staff can manage product allergens" 
  ON public.product_allergens 
  FOR ALL 
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));