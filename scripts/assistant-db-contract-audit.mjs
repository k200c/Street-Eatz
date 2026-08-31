import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

const historicalSeed = read('supabase/migrations/20251204001148_0e5ada48-435e-46e5-9f12-4040bb71b0bc.sql');
const assistant = read('supabase/migrations/20260830113704_management_assistant_v1.sql');
const analytics = read('supabase/migrations/20260830115643_secure_management_analytics_rpc.sql');

const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

check(
  'Historical ingredient seed does not depend on a production product UUID',
  !historicalSeed.includes('405e8403-04d3-47cd-bdaf-c842a0f8f0df')
    && /from public\.products\s+cross join public\.ingredients\s+where products\.name = 'Urban Legend'/i.test(historicalSeed),
);
check(
  'Every assistant SECURITY DEFINER function has an empty search path',
  (assistant.match(/security definer/gi) ?? []).length
    === (assistant.match(/security definer\s+set search_path = ''/gi) ?? []).length,
);
check(
  'Assistant audit updates and deletes are blocked by a trigger',
  /before update or delete on public\.assistant_action_audit/i.test(assistant)
    && /Assistant audit records are immutable/i.test(assistant),
);
check(
  'Concurrent quota decisions are serialized per administrator',
  /pg_catalog\.pg_advisory_xact_lock/i.test(assistant)
    && /assistant_request_log[\s\S]*v_count >= p_limit/i.test(assistant),
);
check(
  'Assistant mutations require admin role and explicit confirmation RPC',
  /create_assistant_product_proposal[\s\S]*has_role\(v_actor, 'admin'/i.test(assistant)
    && /apply_assistant_product_proposal[\s\S]*has_role\(v_actor, 'admin'/i.test(assistant)
    && /create_assistant_setting_proposal[\s\S]*has_role\(v_actor, 'admin'/i.test(assistant)
    && /apply_assistant_setting_proposal[\s\S]*has_role\(v_actor, 'admin'/i.test(assistant),
);
check(
  'Assistant RPC execution is revoked from public and anon',
  (assistant.match(/revoke all on function public\.(?:consume_management_assistant_quota|create_assistant_product_proposal|apply_assistant_product_proposal|create_assistant_setting_proposal|apply_assistant_setting_proposal).*from public, anon/gi) ?? []).length === 5,
);
check(
  'Operating setting proposals are allow-listed, validated and stale-write protected',
  /setting_key in \('current_wait_time', 'is_store_open'\)/i.test(assistant)
    && /v_minutes > 180/i.test(assistant)
    && /v_current is distinct from v_proposal\.before_value/i.test(assistant),
);
check(
  'Assistant foreign keys used for cascades and audit lookup are indexed',
  /assistant_action_proposals_target_product_idx[\s\S]*\(target_product_id\)/i.test(assistant)
    && /assistant_action_audit_proposal_idx[\s\S]*\(proposal_id\)/i.test(assistant)
    && /assistant_action_audit_setting_proposal_idx[\s\S]*\(setting_proposal_id\)/i.test(assistant),
);
check(
  'Management analytics RPC is admin-only, time-bounded and has a statement timeout',
  /get_management_business_snapshot[\s\S]*has_role\(v_actor, 'admin'/i.test(analytics)
    && /least\(coalesce\(p_days, 14\), 90\)/i.test(analytics)
    && /set statement_timeout = '8s'/i.test(analytics),
);
check(
  'Lunch and dinner filters apply consistently to snapshot queries',
  (analytics.match(/v_meal_period = 'lunch'/g) ?? []).length >= 7
    && (analytics.match(/v_meal_period = 'dinner'/g) ?? []).length >= 7,
);

const reportingViews = [
  'v_paid_orders',
  'v_daily_sales',
  'v_trading_rhythm',
  'v_item_mix',
  'v_modifier_attach',
  'v_channel_mix',
  'v_prep_time',
  'v_data_health',
];

for (const view of reportingViews) {
  check(
    `${view} uses invoker security and has no direct anon/authenticated grant`,
    new RegExp(`alter view public\\.${view} set \\(security_invoker = true\\)`, 'i').test(analytics)
      && new RegExp(`revoke all on public\\.${view} from anon, authenticated`, 'i').test(analytics),
  );
}

const failed = checks.filter(({ pass }) => !pass);
for (const { name, pass } of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} assistant database contract check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} assistant database contract checks passed.`);
