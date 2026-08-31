import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_MAX_MESSAGE_LENGTH,
  ASSISTANT_MAX_MESSAGES,
  formatAssistantValue,
  isAssistantProposal,
  sanitizeAssistantMessages,
} from './managementAssistant.ts';

test('sanitizes roles, whitespace, length and history size', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `  message ${index}  `,
  }));
  messages.push({ role: 'system', content: 'untrusted system prompt' });

  const result = sanitizeAssistantMessages(messages);
  assert.equal(result.length, ASSISTANT_MAX_MESSAGES);
  assert.equal(result[0].content, 'message 8');
  assert.equal(result.at(-1)?.content, 'message 19');
  assert.equal(result.some((message) => message.content.includes('untrusted')), false);
});

test('caps oversized messages', () => {
  const result = sanitizeAssistantMessages([{ role: 'user', content: 'x'.repeat(5_000) }]);
  assert.equal(result[0].content.length, ASSISTANT_MAX_MESSAGE_LENGTH);
});

test('formats menu change values for an owner preview', () => {
  assert.equal(formatAssistantValue('price', 12), '€12.00');
  assert.equal(formatAssistantValue('is_sold_out', true), 'Yes');
  assert.equal(formatAssistantValue('description', null), 'Not set');
});

test('accepts only a complete pending product proposal', () => {
  assert.equal(isAssistantProposal({ id: 'proposal', status: 'applied' }), false);
});

test('accepts a complete pending operating-setting proposal', () => {
  assert.equal(isAssistantProposal({
    id: 'proposal',
    proposal_type: 'product',
    target_name: 'Burger',
    product_id: 'product',
    before: { price: 10 },
    changes: { price: 11 },
    expires_at: new Date().toISOString(),
    status: 'pending',
  }), true);
  assert.equal(isAssistantProposal({
    id: 'setting-proposal',
    proposal_type: 'setting',
    target_name: 'Current wait time',
    setting_key: 'current_wait_time',
    before: { current_wait_time: '20 mins' },
    changes: { current_wait_time: '35 mins' },
    expires_at: new Date().toISOString(),
    status: 'pending',
  }), true);
});
