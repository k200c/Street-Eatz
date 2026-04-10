
-- Add review SMS columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_sms_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_sms_sid text;

-- Partial composite index for the pending-review query
CREATE INDEX IF NOT EXISTS idx_orders_review_pending
  ON public.orders (status, review_sms_sent, completed_at)
  WHERE status = 'completed' AND review_sms_sent = false;

-- Trigger function: auto-set completed_at on first transition to 'completed'
CREATE OR REPLACE FUNCTION public.set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists to ensure clean state, then create
DROP TRIGGER IF EXISTS trg_set_completed_at ON public.orders;

CREATE TRIGGER trg_set_completed_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_completed_at();
