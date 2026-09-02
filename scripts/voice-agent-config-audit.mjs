import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const contractPath = join(root, 'integrations/voice/contracts/vapi-tools.v1.json');
const contractText = readFileSync(contractPath, 'utf8');
const contract = JSON.parse(contractText);

const exactParameters = new Map([
  ['MenuFAQ_Query', ['query']],
  ['order', ['customer_name', 'customer_phone', 'order_items', 'payment_method', 'special_notes']],
  ['send_app_link', ['Name', 'Number']],
  ['OrderStatus', ['Name', 'Phone Number']],
  ['request_human', ['Name', 'Phone Number']],
]);

const toolsByName = new Map(contract.tools.map((tool) => [tool.name, tool]));
const checks = [];

checks.push(['Contract is versioned', /^\d+\.\d+\.\d+$/.test(contract.contractVersion)]);
checks.push(['Street Eatz brand spelling is exact', contract.assistant?.brandSpelling === 'Street Eatz']);
checks.push(['Webhook is stored as a reference, not a URL', contract.endpoint?.reference === 'N8N_STREETEATZ_WEBHOOK_URL' && !/https?:\/\//i.test(contract.endpoint?.reference ?? '')]);
checks.push(['Server authentication is mandatory', contract.endpoint?.authenticationRequired === true && Boolean(contract.endpoint?.secretReference)]);
checks.push(['Tool names are unique', toolsByName.size === contract.tools.length]);

for (const [toolName, expectedFields] of exactParameters) {
  const tool = toolsByName.get(toolName);
  const actualFields = Object.keys(tool?.parameters?.properties ?? {});
  const requiredFields = tool?.parameters?.required ?? [];
  checks.push([
    `${toolName} preserves exact parameter names`,
    Boolean(tool) &&
      JSON.stringify(actualFields) === JSON.stringify(expectedFields) &&
      JSON.stringify(requiredFields) === JSON.stringify(expectedFields) &&
      tool.parameters.additionalProperties === false,
  ]);
}

checks.push([
  'Human callback remains gated on confirming the n8n Switch',
  toolsByName.get('request_human')?.lifecycle === 'planned-confirm-n8n-switch-before-creating',
]);
checks.push([
  'Order boundary documents the n8n order_items to items mapping',
  /order_items/.test(toolsByName.get('order')?.boundaryNote ?? '') &&
    /create-voice-order items/.test(toolsByName.get('order')?.boundaryNote ?? ''),
]);

const requiredResponseFields = ['ok', 'code', 'spoken_message', 'retryable'];
checks.push([
  'Every tool uses the structured response contract',
  JSON.stringify(contract.response?.required) === JSON.stringify(requiredResponseFields) &&
    contract.response?.additionalProperties === false,
]);
checks.push([
  'Contract contains no inline secret-shaped values',
  !/(?:whsec_|sk_live_|sk_test_|SG\.|AC[a-fA-F0-9]{32}|Bearer\s+[A-Za-z0-9._-]{20,})/.test(contractText),
]);

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

console.log(`\n${checks.length - failures}/${checks.length} voice-agent configuration checks passed.`);
if (failures) process.exitCode = 1;
