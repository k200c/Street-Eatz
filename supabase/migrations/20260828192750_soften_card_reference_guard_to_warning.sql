-- ============================================================================
-- Guard 1 downgraded from BLOCKING to WARNING until the staff POS card lane
-- has been tested (test PAY-03).
--
-- WHY: the guard rejects a card order marked paid without a webhook reference.
-- That is the correct end state. But the staff POS wrote payment_status
-- directly from the browser between Jan and May 2026, and order_channel is
-- 'web' on all 1145 rows, so there is no way to exempt the terminal lane. If
-- that path is still in use, staff would be unable to take card payments on
-- reopening day. A guard that stops a live till is worse than the defect it
-- prevents.
--
-- The violation is still detected, still logged, and still surfaced by
-- v_payment_integrity - it simply does not block the sale.
--
-- TO RE-ARM once PAY-03 passes: change `raise warning` to `raise exception`
-- with errcode 23514. That is the only edit required.
-- ============================================================================

create or replace function public.enforce_card_payment_reference()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.payment_method::text = 'card'
     and lower(coalesce(new.payment_status,'')) in ('paid','completed')
     and (
       new.viva_transaction_id is null
       or btrim(new.viva_transaction_id) = ''
       or new.viva_transaction_id = new.viva_order_code
     )
  then
    -- WARNING, not EXCEPTION. See header. Re-arm after PAY-03.
    raise warning
      'PAYMENT INTEGRITY: card order % marked % without a webhook reference (got %). Surfaced in v_payment_integrity.',
      coalesce(new.display_id::text, new.id::text),
      new.payment_status,
      coalesce(new.viva_transaction_id, 'null');
  end if;
  return new;
end;
$$;

comment on function public.enforce_card_payment_reference() is
  'Detects card orders marked paid without provider confirmation. WARNING ONLY until test PAY-03 proves the staff POS card lane. Re-arm by changing raise warning to raise exception.';
