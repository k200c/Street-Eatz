import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(root, 'netlify/functions/management-assistant.ts'), 'utf8');

const preorderSelect = source.match(/name === 'get_preorder_operations'[\s\S]*?if \(name === 'get_loyalty_summary'/)?.[0] ?? '';
const loyaltySelect = source.match(/name === 'get_loyalty_summary'[\s\S]*?if \(name === 'propose_product_update'/)?.[0] ?? '';

const checks = [
  ['Assistant identity comes from deployment configuration', /BUSINESS_BRAND_NAME/.test(source) && /BUSINESS_LOCATION_NAME/.test(source) && !/private owner assistant for Street Eatz/.test(source)],
  ['Modern Netlify runtime variables are read through Netlify.env', /Netlify\.env\.get\('OPENAI_API_KEY'\)/.test(source) && /Netlify\.env\.get\('OPENAI_BASE_URL'\)/.test(source) && !/process\.env/.test(source)],
  ['Official OpenAI SDK is used for AI Gateway requests', /import OpenAI from 'openai'/.test(source) && /client\.chat\.completions\.create/.test(source) && !/fetch\(`\$\{baseUrl/.test(source)],
  ['A private OpenAI key can safely bypass an unavailable legacy-plan gateway', /providerApiKey \? 'https:\/\/api\.openai\.com\/v1'/.test(source) && /NETLIFY_AI_GATEWAY_KEY/.test(source)],
  ['Every request authenticates and verifies administrator role', /auth\.getUser\(token\)/.test(source) && /supabase\.rpc\('has_role'/.test(source) && /isAdmin !== true/.test(source)],
  ['Database-backed request quota is enforced before AI calls', /consume_management_assistant_quota/.test(source) && /allowed !== true/.test(source)],
  ['Preorder operations tool is declared and implemented', /name: 'get_preorder_operations'/.test(source) && /name === 'get_preorder_operations'/.test(source)],
  ['Preorder queue excludes customer identity and contact fields', preorderSelect.length > 0 && !/customer_name|customer_phone|customer_email/.test(preorderSelect)],
  ['Preorder tool returns settings, bounded horizon and release summary', /Math\.min\(30/.test(preorderSelect) && /preorder_slot_capacity/.test(preorderSelect) && /awaiting_kitchen_release/.test(preorderSelect)],
  ['Loyalty summary tool is declared and implemented', /name: 'get_loyalty_summary'/.test(source) && /name === 'get_loyalty_summary'/.test(source)],
  ['Loyalty tool returns aggregate values without user identifiers', loyaltySelect.length > 0 && /outstanding_points/.test(loyaltySelect) && /members_reward_ready/.test(loyaltySelect) && !/user_id|customer_name|customer_phone|customer_email/.test(loyaltySelect)],
  ['Assistant mutations remain proposal-and-confirmation only', /create_assistant_product_proposal/.test(source) && /create_assistant_setting_proposal/.test(source) && /action === 'confirm'/.test(source)],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) failures += 1;
}

console.log(`\n${checks.length - failures}/${checks.length} assistant function contract checks passed.`);
if (failures) process.exitCode = 1;
