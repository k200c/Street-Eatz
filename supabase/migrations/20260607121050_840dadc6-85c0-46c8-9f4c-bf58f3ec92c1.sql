ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS pay_on_collection_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_pay_on_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  collection_enabled boolean;
BEGIN
  -- Only guard customer-facing collection orders (logged-in customer placing a cash/collection order).
  -- Staff POS orders are inserted with user_id IS NULL and are never blocked here.
  IF NEW.payment_method = 'cash' AND NEW.user_id IS NOT NULL THEN
    SELECT pay_on_collection_enabled INTO collection_enabled
    FROM public.app_settings
    WHERE id = 1;

    IF collection_enabled IS NOT NULL AND collection_enabled = false THEN
      RAISE EXCEPTION 'Pay on Collection is currently disabled'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pay_on_collection ON public.orders;
CREATE TRIGGER trg_enforce_pay_on_collection
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pay_on_collection();