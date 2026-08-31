import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentOutcome, isKitchenEligible, isPaymentSettled } from './paymentState.ts';

test('only confirmed settlement statuses are treated as paid', () => {
  assert.equal(isPaymentSettled('paid'), true);
  assert.equal(isPaymentSettled(' COMPLETED '), true);
  assert.equal(isPaymentSettled('pending'), false);
  assert.equal(isPaymentSettled('processing'), false);
  assert.equal(isPaymentSettled('unpaid'), false);
  assert.equal(isPaymentSettled(null), false);
});

test('payment outcomes separate declined and unsettled states', () => {
  assert.equal(getPaymentOutcome('failed'), 'failed');
  assert.equal(getPaymentOutcome('declined'), 'failed');
  assert.equal(getPaymentOutcome('pending'), 'pending');
  assert.equal(getPaymentOutcome('paid'), 'settled');
});

test('kitchen gate blocks unpaid web card orders', () => {
  assert.equal(isKitchenEligible({
    payment_status: 'pending',
    payment_method: 'card',
    order_channel: 'web',
  }), false);
});

test('kitchen gate accepts settled, cash, and voice collection orders', () => {
  assert.equal(isKitchenEligible({
    payment_status: 'paid',
    payment_method: 'card',
    order_channel: 'web',
  }), true);
  assert.equal(isKitchenEligible({
    payment_status: 'unpaid',
    payment_method: 'cash',
    order_channel: 'staff',
  }), true);
  assert.equal(isKitchenEligible({
    payment_status: 'unpaid',
    payment_method: 'card',
    order_channel: 'voice',
  }), true);
});
