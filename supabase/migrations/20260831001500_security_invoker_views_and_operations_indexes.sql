-- Harden exposed reporting views and cover new FoodOS foreign keys.
-- security_invoker preserves base-table RLS instead of inheriting the view owner's access.

alter view public.v_ingredient_usage_daily set (security_invoker = true);
alter view public.v_ingredient_par_levels set (security_invoker = true);
alter view public.v_stock_conflicts set (security_invoker = true);
alter view public.v_addon_catalogue set (security_invoker = true);
alter view public.v_payments_stuck set (security_invoker = true);
alter view public.v_feedback_summary set (security_invoker = true);
alter view public.v_feedback_trend set (security_invoker = true);
alter view public.v_feedback_by_item set (security_invoker = true);
alter view public.v_feedback_callbacks set (security_invoker = true);
alter view public.v_qa_summary set (security_invoker = true);
alter view public.v_review_coverage set (security_invoker = true);
alter view public.v_review_request_queue set (security_invoker = true);
alter view public.v_payment_integrity set (security_invoker = true);
alter view public.v_payment_integrity_summary set (security_invoker = true);

create index foodos_module_settings_updated_by_idx
  on public.foodos_module_settings (updated_by) where updated_by is not null;
create index inventory_movements_recorded_by_idx
  on public.inventory_movements (recorded_by) where recorded_by is not null;
create index roster_shifts_created_by_idx
  on public.roster_shifts (created_by) where created_by is not null;
create index food_safety_logs_recorded_by_idx
  on public.food_safety_logs (recorded_by);
create index competitor_profiles_created_by_idx
  on public.competitor_profiles (created_by) where created_by is not null;
create index competitor_snapshots_recorded_by_idx
  on public.competitor_snapshots (recorded_by) where recorded_by is not null;

-- These functions are trigger-only and must not be callable through the API.
revoke execute on function public.assign_staff_role_on_signup() from public, anon, authenticated;
revoke execute on function public.enforce_card_payment_reference() from public, anon, authenticated;
revoke execute on function public.enforce_pay_on_collection() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_role_self_change() from public, anon, authenticated;
revoke execute on function public.recalculate_order_total() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.set_completed_at() from public, anon, authenticated;
revoke execute on function public.update_customer_on_order() from public, anon, authenticated;
revoke execute on function public.validate_order_item_price() from public, anon, authenticated;

-- Used only by authenticated profile policies; anonymous clients do not need direct RPC access.
revoke execute on function public.get_user_role(uuid) from public, anon;
grant execute on function public.get_user_role(uuid) to authenticated;
