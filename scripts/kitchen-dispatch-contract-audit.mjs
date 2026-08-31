import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const staffHook = readFileSync(join(root, 'src/hooks/useStaffCheckout.ts'), 'utf8');
const staffModal = readFileSync(join(root, 'src/components/checkout/StaffCheckoutModal.tsx'), 'utf8');
const dispatcher = readFileSync(join(root, 'supabase/functions/send-to-kitchen/index.ts'), 'utf8');
const waitTime = readFileSync(join(root, 'supabase/functions/get-wait-time/index.ts'), 'utf8');

const checks = [
  ['Staff POS sends only the saved order identity to the dispatcher', /body:\s*\{\s*order_id:\s*orderResult\.orderId\s*\}/s.test(staffHook)],
  ['Staff POS reports dispatcher errors as failures', /if\s*\(fnError\)[\s\S]{0,180}return false/.test(staffHook) && /catch[\s\S]{0,180}return false/.test(staffHook)],
  ['Staff UI distinguishes a saved order from printer-dispatch failure', /Order saved, but printer dispatch needs attention/.test(staffModal)],
  ['Dispatcher rebuilds receipt items from persisted order rows', /order_items\s*\(product_name, quantity, unit_price, selected_modifiers\)/.test(dispatcher) && /order\.order_items\s*\?\?\s*\[\]/.test(dispatcher)],
  ['Dispatcher blocks unpaid card orders', /Card payment is not confirmed/.test(dispatcher)],
  ['Dispatcher holds scheduled orders until release time', /Scheduled order is not due for kitchen release yet/.test(dispatcher)],
  ['Dispatcher persists retryable outbox state', /\.from\("kitchen_dispatches"\)/.test(dispatcher) && /status:\s*"failed"/.test(dispatcher)],
  ['Missing wait time never becomes a fabricated estimate', !/20 mins/.test(dispatcher) && !/20 mins/.test(waitTime) && /Wait time is not configured/.test(waitTime)],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

console.log(`\n${checks.length - failures}/${checks.length} kitchen dispatch contract checks passed.`);
if (failures) process.exitCode = 1;
