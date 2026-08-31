import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const voiceOrder = readFileSync(join(root, 'supabase/functions/create-voice-order/index.ts'), 'utf8');
const voiceMenu = readFileSync(join(root, 'supabase/functions/get-menu/index.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20260829143000_voice_order_idempotency_v1.sql'), 'utf8');
const preorderMigration = readFileSync(join(root, 'supabase/migrations/20260829194500_harden_preorder_hours_and_capacity.sql'), 'utf8');

const checks = [
  ['Voice order requires a service shared secret', /VOICE_ORDER_WEBHOOK_SECRET/.test(voiceOrder) && /Unauthorized/.test(voiceOrder)],
  ['Voice calls require a bounded idempotency key', /callId\.length < 8 \|\| callId\.length > 200/.test(voiceOrder) && /voice_call_id/.test(migration)],
  ['Duplicate calls do not request a second dispatch', /duplicate:\s*true,[\s\S]{0,80}should_dispatch:\s*false/.test(voiceOrder)],
  ['Product pricing is loaded from the database', /select\("id, name, price, is_available, is_sold_out, is_visible"\)/.test(voiceOrder) && !/price_adjustment\s*:\s*addon\./.test(voiceOrder)],
  ['Menu and order paths hide invisible products', /\.eq\("is_visible", true\)/.test(voiceOrder) && /\.eq\("is_visible", true\)/.test(voiceMenu)],
  ['Normal menu responses exclude unavailable and sold-out products', /\.eq\("is_available", true\)[\s\S]{0,100}\.eq\("is_sold_out", false\)/.test(voiceMenu)],
  ['Add-ons must belong to a modifier group attached to the product', /allowedGroupsByProduct/.test(voiceOrder) && /is not an available add-on/.test(voiceOrder)],
  ['Ingredient removals must be configured as removable for that product', /removableIngredientsByProduct/.test(voiceOrder) && /cannot be removed from/.test(voiceOrder)],
  ['Voice payment is collection-only and stored unpaid', /Voice orders currently support pay-on-collection only/.test(voiceOrder) && /payment_status:\s*"unpaid"/.test(voiceOrder)],
  ['Scheduled voice orders require an explicit timezone', /scheduled_for must include an explicit timezone/.test(voiceOrder) && /pickup_time/.test(voiceOrder)],
  ['Scheduled fields are persisted and returned to the caller', /fulfillment_type:\s*fulfillmentType/.test(voiceOrder) && /scheduled_for:\s*scheduledFor/.test(voiceOrder) && /kitchen_release_at/.test(voiceOrder)],
  ['Scheduled voice orders do not request immediate kitchen dispatch', /should_dispatch:\s*fulfillmentType === "asap"/.test(voiceOrder)],
  ['Database slot rules enforce Dublin hours, capacity and kitchen release', /Europe\/Dublin/.test(preorderMigration) && /pg_advisory_xact_lock/.test(preorderMigration) && /preorder_slot_capacity/.test(preorderMigration) && /kitchen_release_at/.test(preorderMigration)],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

console.log(`\n${checks.length - failures}/${checks.length} voice-order contract checks passed.`);
if (failures) process.exitCode = 1;
