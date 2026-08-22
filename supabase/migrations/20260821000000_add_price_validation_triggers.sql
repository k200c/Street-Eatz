-- ============================================================================
-- Server-side price validation
-- Applied to production 21 August 2026 via the Supabase SQL editor.
-- Committed retrospectively so the migration history matches the live database
-- and so these survive a project migration.
-- ============================================================================
--
-- WHY THESE EXIST
--
-- src/hooks/useCheckout.ts submitOrder() inserts orders and order_items
-- directly from the browser (the comment in that file reads "BYPASS Edge
-- Function"). `total` comes from the client cart and `unit_price` from
-- item.totalPrice / item.quantity — both client-computed.
--
-- The create-order edge function performs correct server-side validation, but
-- nothing calls it. Verified 21 Aug: `orders` carried four triggers, none of
-- which touched price, and `order_items` had no triggers at all.
--
-- Net effect before this migration: a customer could record a €40 basket as
-- €0.01. These triggers make the database, not the browser, the authority on
-- what an order costs.
--
-- The n8n Payment Processor now charges order.total rather than the client's
-- total_amount (22 Aug), which depends on these triggers being present. Do not
-- drop them without also reverting that change.
--
-- PRE-FLIGHT EVIDENCE (21 Aug, before applying)
--   * 335 historical order_items priced below their product's base price, all
--     dated on or before 3 May, in six distinct gap sizes (-0.50 x243,
--     -1.00 x80, -0.09 x9, and three one-offs). Consistent with menu price
--     rises, not exploitation. Nothing since 3 May.
--   * One order (#330) where stored total differed from the item sum, by
--     €14.00 — a missing order_items row, not a fee or discount mechanism.
--   * 20 order_items reference a product that no longer exists, which is why
--     the floor check fails open on a missing product.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Floor check: reject an item priced below the product's base price.
--    Modifiers only ever add cost, so the base price is a safe floor. This is
--    the same rule create-order applies.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_order_item_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_price numeric;
BEGIN
  SELECT price INTO base_price
  FROM public.products
  WHERE id = NEW.product_id;

  -- Fail open on a missing product. 20 historical rows reference deleted
  -- products; blocking a legitimate order mid-service is worse than the narrow
  -- case this misses. Underpricing is still caught whenever the product exists,
  -- which is every normal order.
  IF base_price IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1c tolerance for floating-point rounding. Note: nine historical rows sat at
  -- -0.09 (a modifier rounding artefact, last seen January). If legitimate
  -- orders start being rejected, widen this to 0.10 before investigating
  -- anything else.
  IF NEW.unit_price < base_price - 0.01 THEN
    RAISE EXCEPTION
      'Invalid price for %: submitted %, minimum %',
      NEW.product_name, NEW.unit_price, base_price
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 100 THEN
    RAISE EXCEPTION 'Invalid quantity for %: %', NEW.product_name, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_item_price ON public.order_items;
CREATE TRIGGER trg_validate_order_item_price
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_item_price();


-- ----------------------------------------------------------------------------
-- 2. Recompute orders.total from the items actually recorded, so the client's
--    figure is never authoritative.
--
--    Overwrites rather than rejects: the order still completes, the database
--    just corrects the total. Rejecting would show a customer a failed checkout
--    for something they did nothing wrong in, and you would never know.
--
--    Safe because a pre-flight check found only one historical order where
--    total differed from the item sum — no surcharge, fee or discount mechanism
--    lives on orders.total. If one is ever added, this trigger must change with
--    it or it will erase the difference.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed numeric;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)
  INTO computed
  FROM public.order_items
  WHERE order_id = NEW.order_id;

  UPDATE public.orders
  SET total = ROUND(computed, 2)
  WHERE id = NEW.order_id
    AND ABS(COALESCE(total, 0) - ROUND(computed, 2)) > 0.01;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_order_total ON public.order_items;
CREATE TRIGGER trg_recalculate_order_total
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_order_total();


-- ============================================================================
-- KNOWN LIMITS
--
-- 1. Modifier prices are still unvalidated. The floor check stops underpricing
--    an item, but a paid add-on can still be claimed free by submitting the
--    base price with modifiers attached. Fix belongs in the order-write path.
-- 2. An order with no items keeps whatever total the client supplied, since the
--    recompute only fires on item insert.
-- 3. orders is inserted before order_items, so the client total exists briefly
--    before correction. Nothing reads it in that window.
-- 4. These are defence in depth. The architectural fix is routing web checkout
--    through create-order, which already validates correctly. Keep these
--    regardless — they protect the data layer whatever the frontend does.
-- ============================================================================
