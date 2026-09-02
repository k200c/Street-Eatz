import test from 'node:test';
import assert from 'node:assert/strict';
import { sortModules, isExpanded, initialExpandedKeys, withOverride, type ModuleLayoutRow } from './moduleLayout.ts';

/** The live foodos_module_settings rows on 2 Sept, verified by query. */
const LIVE: ModuleLayoutRow[] = [
  { module_key: 'operations_inventory', domain: 'operations', enabled: true, display_order: 100, default_expanded: false },
  { module_key: 'marketing_sms', domain: 'marketing', enabled: true, display_order: 10, default_expanded: true },
  { module_key: 'intelligence_competitors', domain: 'intelligence', enabled: true, display_order: 80, default_expanded: false },
  { module_key: 'operations_end_of_day', domain: 'operations', enabled: true, display_order: 140, default_expanded: false },
  { module_key: 'marketing_banner', domain: 'marketing', enabled: true, display_order: 70, default_expanded: true },
  { module_key: 'operations_roster', domain: 'operations', enabled: true, display_order: 110, default_expanded: false },
];

test('operations render last, by display_order', () => {
  const keys = sortModules(LIVE).map((m) => m.module_key);
  assert.deepEqual(keys, [
    'marketing_sms',
    'marketing_banner',
    'intelligence_competitors',
    'operations_inventory',
    'operations_roster',
    'operations_end_of_day',
  ]);
});

test('operations and intelligence start collapsed; marketing starts open', () => {
  const open = initialExpandedKeys(sortModules(LIVE), {});
  assert.deepEqual(open, ['marketing_sms', 'marketing_banner']);
});

test('a manual expand persists as an override without touching the row', () => {
  const inventory = LIVE[0];
  assert.equal(isExpanded(inventory, {}), false);
  const overrides = withOverride({}, 'operations_inventory', true);
  assert.equal(isExpanded(inventory, overrides), true);
  // The row itself is untouched — the column is not ours to write.
  assert.equal(inventory.default_expanded, false);
});

test('a manual collapse of a default-open section also persists', () => {
  const sms = LIVE[1];
  const overrides = withOverride({}, 'marketing_sms', false);
  assert.equal(isExpanded(sms, overrides), false);
});

test('rows with no display_order sort last and unknown default_expanded opens', () => {
  const stray: ModuleLayoutRow = { module_key: 'zzz', domain: 'marketing', enabled: true, display_order: null, default_expanded: null };
  const keys = sortModules([stray, ...LIVE]).map((m) => m.module_key);
  assert.equal(keys[keys.length - 1], 'zzz');
  assert.equal(isExpanded(stray, {}), true);
});
