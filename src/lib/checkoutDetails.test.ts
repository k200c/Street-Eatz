import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCheckoutDetails, saveCheckoutDetails, isAcceptableEmail, CHECKOUT_DETAILS_KEY } from './checkoutDetails.ts';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

test('details survive a reload', () => {
  const s = memory();
  saveCheckoutDetails(s, { name: 'Aoife', phone: '0851234567', email: '' });
  assert.deepEqual(loadCheckoutDetails(s), { name: 'Aoife', phone: '0851234567', email: '' });
});

test('damaged or missing storage never breaks checkout', () => {
  const s = memory();
  s.m.set(CHECKOUT_DETAILS_KEY, '{not json');
  assert.deepEqual(loadCheckoutDetails(s), { name: '', phone: '', email: '' });
  assert.deepEqual(loadCheckoutDetails(undefined), { name: '', phone: '', email: '' });
  saveCheckoutDetails({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, { name: 'a', phone: 'b', email: 'c' });
});

test('email is optional but must look valid when given', () => {
  assert.equal(isAcceptableEmail(''), true);
  assert.equal(isAcceptableEmail('  '), true);
  assert.equal(isAcceptableEmail('a@b.ie'), true);
  assert.equal(isAcceptableEmail('a@b'), false);
});
